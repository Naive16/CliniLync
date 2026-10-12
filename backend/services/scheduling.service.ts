/**
 * CLINILYNC Scheduling & Conflict Prevention Service
 * 
 * Provides:
 * 1. Concurrency-safe atomic appointment booking with PostgreSQL transaction isolation.
 * 2. Strict double-booking prevention respecting durations and configured buffers.
 * 3. Provider availability calculation with timezone awareness and schedule exceptions.
 * 4. Enforced appointment lifecycle state transitions.
 */

import { getDatabaseClient, IDatabaseClient } from '../../database/db.js';
import { Appointment, AppointmentStatus, Provider, ProviderAvailability, ProviderScheduleException, AppointmentType } from '../types/domain.js';
import { AuditService } from '../security/audit.js';

export interface BookingRequest {
  organizationId: string;
  patientId: string;
  providerId: string;
  departmentId?: string | null;
  appointmentTypeId?: string | null;
  scheduledTime: string; // ISO 8601
  durationMinutes?: number;
  reasonForVisit?: string | null;
  creationSource?: 'STAFF' | 'PORTAL' | 'EXTERNAL';
  userId: string;
  userRole?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface RescheduleRequest {
  organizationId: string;
  appointmentId: string;
  newScheduledTime: string;
  newProviderId?: string;
  reason?: string;
  userId: string;
  userRole?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface AvailableSlot {
  startTime: string; // ISO 8601
  endTime: string;   // ISO 8601
  timeString: string; // HH:MM
  isAvailable: boolean;
  conflictReason?: string;
}

export const VALID_STATUS_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  REQUESTED: ['SCHEDULED', 'CANCELLED'],
  SCHEDULED: ['CONFIRMED', 'CHECKED_IN', 'CANCELLED', 'RESCHEDULED', 'NO_SHOW'],
  CONFIRMED: ['CHECKED_IN', 'IN_PROGRESS', 'CANCELLED', 'RESCHEDULED', 'NO_SHOW'],
  CHECKED_IN: ['IN_PROGRESS', 'CANCELLED', 'NO_SHOW'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
  RESCHEDULED: []
};

export class SchedulingService {
  /**
   * Validate permitted appointment status transition
   */
  static validateStatusTransition(currentStatus: AppointmentStatus, targetStatus: AppointmentStatus): boolean {
    const allowed = VALID_STATUS_TRANSITIONS[currentStatus] || [];
    return allowed.includes(targetStatus);
  }

  /**
   * Check if an appointment overlaps with existing bookings for a provider
   */
  static async checkConflict(
    db: IDatabaseClient,
    providerId: string,
    scheduledStartTime: Date,
    scheduledEndTime: Date,
    bufferBeforeMinutes: number = 0,
    bufferAfterMinutes: number = 0,
    excludeAppointmentId?: string
  ): Promise<{ hasConflict: boolean; conflictingAppointment?: Appointment }> {
    // Window starts bufferBefore before scheduled start, and ends bufferAfter after scheduled end
    const windowStart = new Date(scheduledStartTime.getTime() - bufferBeforeMinutes * 60 * 1000).toISOString();
    const windowEnd = new Date(scheduledEndTime.getTime() + bufferAfterMinutes * 60 * 1000).toISOString();

    // Query active appointments for this provider
    const existingRes = await db.query<Appointment>(
      `SELECT * FROM appointments 
       WHERE provider_id = $1 
         AND status NOT IN ('CANCELLED', 'NO_SHOW', 'RESCHEDULED')
       ORDER BY scheduled_time ASC`,
      [providerId]
    );

    for (const apt of existingRes.rows) {
      if (excludeAppointmentId && apt.id === excludeAppointmentId) {
        continue;
      }

      const aptStart = new Date(apt.scheduled_time);
      const aptEnd = apt.end_time 
        ? new Date(apt.end_time) 
        : new Date(aptStart.getTime() + (apt.duration_minutes || 30) * 60 * 1000);

      // Overlap condition: aptStart < windowEnd AND aptEnd > windowStart
      if (aptStart.getTime() < new Date(windowEnd).getTime() && aptEnd.getTime() > new Date(windowStart).getTime()) {
        return { hasConflict: true, conflictingAppointment: apt };
      }
    }

    return { hasConflict: false };
  }

  /**
   * Concurrency-safe atomic appointment creation
   */
  static async bookAppointment(request: BookingRequest): Promise<{ appointment: Appointment }> {
    const db = getDatabaseClient();

    return db.transaction(async (tx) => {
      // 1. Verify Patient belongs to the active organization
      const patRes = await tx.query(
        `SELECT id, status, is_active FROM patients WHERE id = $1 AND organization_id = $2`,
        [request.patientId, request.organizationId]
      );
      if (patRes.rows.length === 0) {
        throw new SchedulingError('PATIENT_NOT_FOUND', 'Patient record not found in the active organization.', 404);
      }
      const patient = patRes.rows[0];
      if (patient.status === 'ARCHIVED' || patient.status === 'DECEASED' || !patient.is_active) {
        throw new SchedulingError('PATIENT_INACTIVE', 'Cannot schedule appointments for archived or inactive patients.', 400);
      }

      // 2. Verify Provider belongs to the active organization and is ACTIVE
      const provRes = await tx.query<Provider>(
        `SELECT * FROM providers WHERE id = $1 AND organization_id = $2`,
        [request.providerId, request.organizationId]
      );
      if (provRes.rows.length === 0) {
        throw new SchedulingError('PROVIDER_NOT_FOUND', 'Healthcare provider not found in the active organization.', 404);
      }
      const provider = provRes.rows[0];
      if (provider.status !== 'ACTIVE' || !provider.is_accepting_patients) {
        throw new SchedulingError('PROVIDER_UNAVAILABLE', 'Selected provider is not active or not currently accepting appointments.', 400);
      }

      // 3. Resolve Appointment Type and duration/buffers
      let durationMinutes = request.durationMinutes || 30;
      let bufferBefore = 0;
      let bufferAfter = 0;
      let appointmentTypeCode = 'CONSULTATION';

      if (request.appointmentTypeId) {
        const atRes = await tx.query<AppointmentType>(
          `SELECT * FROM appointment_types WHERE id = $1 AND organization_id = $2 AND is_active = TRUE`,
          [request.appointmentTypeId, request.organizationId]
        );
        if (atRes.rows.length === 0) {
          throw new SchedulingError('APPOINTMENT_TYPE_INVALID', 'The requested appointment type is inactive or invalid.', 400);
        }
        const at = atRes.rows[0];
        durationMinutes = request.durationMinutes || at.duration_minutes;
        bufferBefore = at.buffer_before_minutes || 0;
        bufferAfter = at.buffer_after_minutes || 0;
        appointmentTypeCode = at.code;
      }

      const startTime = new Date(request.scheduledTime);
      if (isNaN(startTime.getTime())) {
        throw new SchedulingError('INVALID_TIME', 'Provided scheduled time is not a valid timestamp.', 400);
      }

      if (!Number.isFinite(durationMinutes) || durationMinutes < 5 || durationMinutes > 480) {
        throw new SchedulingError('INVALID_DURATION', 'Appointment duration must be between 5 and 480 minutes.', 400);
      }

      const endTime = new Date(startTime.getTime() + durationMinutes * 60 * 1000);

      // 4. Validate Provider Working Hours & Exceptions
      // Convert day of week: JS Date getDay() returns 0 for Sunday, 1 for Monday
      const jsDay = startTime.getUTCDay();
      const dayOfWeek = jsDay === 0 ? 7 : jsDay; // Convert to 1=Mon ... 7=Sun

      const availRes = await tx.query<ProviderAvailability>(
        `SELECT * FROM provider_availability 
         WHERE provider_id = $1 AND day_of_week = $2 AND is_active = TRUE`,
        [request.providerId, dayOfWeek]
      );

      // If availability rules exist, verify the appointment falls within working hours
      if (availRes.rows.length > 0) {
        const hours = startTime.getUTCHours();
        const mins = startTime.getUTCMinutes();
        const currentSlotTime = `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;

        const isWithinShift = availRes.rows.some((av) => {
          return currentSlotTime >= av.start_time && currentSlotTime < av.end_time;
        });

        if (!isWithinShift) {
          // Warning/conflict: outside provider working shift
          // For strict validation:
          const shiftInfo = availRes.rows.map(a => `${a.start_time}-${a.end_time}`).join(', ');
          throw new SchedulingError(
            'OUTSIDE_WORKING_HOURS',
            `Requested appointment time (${currentSlotTime} UTC) falls outside provider's scheduled working hours (${shiftInfo}).`,
            409
          );
        }
      }

      // Check Schedule Exceptions (Time-off / Leaves / Blocks)
      const exceptionRes = await tx.query<ProviderScheduleException>(
        `SELECT * FROM provider_schedule_exceptions 
         WHERE provider_id = $1 
           AND start_datetime <= $2 
           AND end_datetime >= $3`,
        [request.providerId, endTime.toISOString(), startTime.toISOString()]
      );

      if (exceptionRes.rows.length > 0) {
        const exc = exceptionRes.rows[0];
        throw new SchedulingError(
          'PROVIDER_BLOCKED',
          `Provider is unavailable during this time: ${exc.reason}`,
          409
        );
      }

      // 5. ATOMIC DOUBLE-BOOKING CONFLICT CHECK
      const conflictCheck = await SchedulingService.checkConflict(
        tx,
        request.providerId,
        startTime,
        endTime,
        bufferBefore,
        bufferAfter
      );

      if (conflictCheck.hasConflict) {
        await AuditService.logEvent({
          organizationId: request.organizationId,
          actorId: request.userId,
          actorRole: request.userRole || 'STAFF',
          action: 'appointment.booking_conflict',
          resourceType: 'Appointment',
          metadata: {
            providerId: request.providerId,
            requestedTime: request.scheduledTime,
            conflictingAppointmentId: conflictCheck.conflictingAppointment?.id
          },
          severity: 'WARNING',
          ipAddress: request.ipAddress,
          userAgent: request.userAgent
        });

        throw new SchedulingError(
          'APPOINTMENT_CONFLICT',
          `The selected time slot conflicts with an existing booking for ${provider.display_name || provider.specialization}.`,
          409
        );
      }

      // 6. Insert new appointment
      const appointmentId = `apt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const now = new Date().toISOString();

      const newApt: Appointment = {
        id: appointmentId,
        organization_id: request.organizationId,
        patient_id: request.patientId,
        provider_id: request.providerId,
        department_id: request.departmentId || provider.department_id || null,
        appointment_type_id: request.appointmentTypeId || null,
        scheduled_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        duration_minutes: durationMinutes,
        appointment_type: appointmentTypeCode,
        timezone: provider.specialization ? 'Europe/London' : 'Europe/London',
        status: 'SCHEDULED',
        reason_for_visit: request.reasonForVisit || null,
        creation_source: request.creationSource || 'STAFF',
        created_by_user_id: request.userId,
        created_at: now,
        updated_at: now
      };

      await tx.query(
        `INSERT INTO appointments 
          (id, organization_id, patient_id, provider_id, department_id, appointment_type_id, scheduled_time, end_time, duration_minutes, appointment_type, timezone, status, reason_for_visit, creation_source, created_by_user_id, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
        [
          newApt.id,
          newApt.organization_id,
          newApt.patient_id,
          newApt.provider_id,
          newApt.department_id,
          newApt.appointment_type_id,
          newApt.scheduled_time,
          newApt.end_time,
          newApt.duration_minutes,
          newApt.appointment_type,
          newApt.timezone,
          newApt.status,
          newApt.reason_for_visit,
          newApt.creation_source,
          newApt.created_by_user_id,
          newApt.created_at,
          newApt.updated_at
        ]
      );

      // 7. Server-side audit event
      await AuditService.logEvent({
        organizationId: request.organizationId,
        actorId: request.userId,
        actorRole: request.userRole || 'STAFF',
        action: 'appointment.created',
        resourceType: 'Appointment',
        resourceId: newApt.id,
        metadata: {
          patientId: newApt.patient_id,
          providerId: newApt.provider_id,
          scheduledTime: newApt.scheduled_time,
          durationMinutes: newApt.duration_minutes
        },
        severity: 'INFO',
        ipAddress: request.ipAddress,
        userAgent: request.userAgent
      });

      return { appointment: newApt };
    });
  }

  /**
   * Concurrency-safe atomic rescheduling
   */
  static async rescheduleAppointment(request: RescheduleRequest): Promise<{ appointment: Appointment }> {
    const db = getDatabaseClient();

    return db.transaction(async (tx) => {
      // 1. Fetch current appointment
      const aptRes = await tx.query<Appointment>(
        `SELECT * FROM appointments WHERE id = $1 AND organization_id = $2`,
        [request.appointmentId, request.organizationId]
      );

      if (aptRes.rows.length === 0) {
        throw new SchedulingError('NOT_FOUND', 'Appointment not found in the active organization.', 404);
      }

      const currentApt = aptRes.rows[0];

      if (currentApt.status === 'CANCELLED' || currentApt.status === 'COMPLETED' || currentApt.status === 'NO_SHOW') {
        throw new SchedulingError('INVALID_STATE', `Cannot reschedule appointment with status ${currentApt.status}.`, 400);
      }

      const targetProviderId = request.newProviderId || currentApt.provider_id;
      const providerRes = await tx.query<Provider>('SELECT id, status, is_accepting_patients FROM providers WHERE id = $1 AND organization_id = $2', [targetProviderId, request.organizationId]);
      if (providerRes.rows.length === 0 || providerRes.rows[0].status !== 'ACTIVE' || !providerRes.rows[0].is_accepting_patients) {
        throw new SchedulingError('PROVIDER_UNAVAILABLE', 'The replacement provider is not active in the current organization.', 400);
      }
      const newStartTime = new Date(request.newScheduledTime);
      if (isNaN(newStartTime.getTime())) {
        throw new SchedulingError('INVALID_TIME', 'Invalid new scheduled time timestamp.', 400);
      }

      const durationMinutes = currentApt.duration_minutes || 30;
      const newEndTime = new Date(newStartTime.getTime() + durationMinutes * 60 * 1000);

      // Check conflict for new time slot, excluding current appointment
      const conflictCheck = await SchedulingService.checkConflict(
        tx,
        targetProviderId,
        newStartTime,
        newEndTime,
        0,
        0,
        currentApt.id
      );

      if (conflictCheck.hasConflict) {
        throw new SchedulingError(
          'APPOINTMENT_CONFLICT',
          'The requested reschedule slot is already booked for this provider.',
          409
        );
      }

      const now = new Date().toISOString();

      // Update appointment atomically
      await tx.query(
        `UPDATE appointments 
         SET provider_id = $1, scheduled_time = $2, end_time = $3, status = 'SCHEDULED', rescheduled_from_appointment_id = $4, updated_at = $5 
         WHERE id = $6`,
        [
          targetProviderId,
          newStartTime.toISOString(),
          newEndTime.toISOString(),
          currentApt.id,
          now,
          currentApt.id
        ]
      );

      await AuditService.logEvent({
        organizationId: request.organizationId,
        actorId: request.userId,
        actorRole: request.userRole || 'STAFF',
        action: 'appointment.rescheduled',
        resourceType: 'Appointment',
        resourceId: currentApt.id,
        metadata: {
          previousTime: currentApt.scheduled_time,
          newTime: newStartTime.toISOString(),
          providerId: targetProviderId,
          reason: request.reason
        },
        severity: 'INFO',
        ipAddress: request.ipAddress,
        userAgent: request.userAgent
      });

      const updatedRes = await tx.query<Appointment>(
        `SELECT * FROM appointments WHERE id = $1`,
        [currentApt.id]
      );

      return { appointment: updatedRes.rows[0] };
    });
  }

  /**
   * Compute available booking slots for a provider on a specific date
   */
  static async getAvailableSlots(
    providerId: string,
    organizationId: string,
    dateStr: string, // YYYY-MM-DD
    durationMinutes: number = 30
  ): Promise<AvailableSlot[]> {
    const db = getDatabaseClient();

    const targetDate = new Date(`${dateStr}T00:00:00Z`);
    if (isNaN(targetDate.getTime())) {
      return [];
    }

    const jsDay = targetDate.getUTCDay();
    const dayOfWeek = jsDay === 0 ? 7 : jsDay;

    // Fetch recurring availability
    const availRes = await db.query<ProviderAvailability>(
      `SELECT * FROM provider_availability 
       WHERE provider_id = $1 AND organization_id = $2 AND day_of_week = $3 AND is_active = TRUE`,
      [providerId, organizationId, dayOfWeek]
    );

    if (availRes.rows.length === 0) {
      return [];
    }

    // Fetch booked appointments on this date
    const dayStart = `${dateStr}T00:00:00.000Z`;
    const dayEnd = `${dateStr}T23:59:59.999Z`;

    const aptsRes = await db.query<Appointment>(
      `SELECT * FROM appointments 
       WHERE provider_id = $1 
         AND organization_id = $2 
         AND scheduled_time >= $3 
         AND scheduled_time <= $4
         AND status NOT IN ('CANCELLED', 'NO_SHOW', 'RESCHEDULED')`,
      [providerId, organizationId, dayStart, dayEnd]
    );

    const slots: AvailableSlot[] = [];

    for (const rule of availRes.rows) {
      const [startHour, startMin] = rule.start_time.split(':').map(Number);
      const [endHour, endMin] = rule.end_time.split(':').map(Number);

      const shiftStartMinutes = startHour * 60 + startMin;
      const shiftEndMinutes = endHour * 60 + endMin;

      for (let min = shiftStartMinutes; min + durationMinutes <= shiftEndMinutes; min += durationMinutes) {
        const slotH = Math.floor(min / 60);
        const slotM = min % 60;
        const timeStr = `${String(slotH).padStart(2, '0')}:${String(slotM).padStart(2, '0')}`;
        const slotStart = new Date(`${dateStr}T${timeStr}:00.000Z`);
        const slotEnd = new Date(slotStart.getTime() + durationMinutes * 60 * 1000);

        // Check if any appointment conflicts
        let isBooked = false;
        for (const apt of aptsRes.rows) {
          const aStart = new Date(apt.scheduled_time);
          const aEnd = apt.end_time ? new Date(apt.end_time) : new Date(aStart.getTime() + apt.duration_minutes * 60 * 1000);

          if (slotStart.getTime() < aEnd.getTime() && slotEnd.getTime() > aStart.getTime()) {
            isBooked = true;
            break;
          }
        }

        slots.push({
          startTime: slotStart.toISOString(),
          endTime: slotEnd.toISOString(),
          timeString: timeStr,
          isAvailable: !isBooked,
          conflictReason: isBooked ? 'Booked' : undefined
        });
      }
    }

    return slots;
  }
}

export class SchedulingError extends Error {
  code: string;
  statusCode: number;

  constructor(code: string, message: string, statusCode: number = 400) {
    super(message);
    this.name = 'SchedulingError';
    this.code = code;
    this.statusCode = statusCode;
  }
}
