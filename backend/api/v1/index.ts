/**
 * CLINILYNC Version 1 (v1) Master API Router
 * 
 * Base path: /api/v1
 * All endpoints conform to:
 * - Success envelope: { data: {}, meta: {} }
 * - Error envelope: { error: { code: string, message: string } }
 */

import { Router } from 'express';
import { v1AuthRouter } from './auth.router.js';
import { v1OrgsRouter } from './organizations.router.js';
import { v1DiagnosticRouter } from './diagnostic.router.js';
import { v1MeRouter } from './me.router.js';
import { v1PatientsRouter } from './patients.router.js';
import { v1ProvidersRouter } from './providers.router.js';
import { v1DepartmentsRouter } from './departments.router.js';
import { v1AppointmentsRouter } from './appointments.router.js';
import { v1AppointmentTypesRouter } from './appointment-types.router.js';
import { v1SpecialtiesRouter } from './specialties.router.js';
import { v1EncountersRouter } from './encounters.router.js';
import { v1ClinicalNotesRouter } from './clinical-notes.router.js';
import { v1MedicationsRouter } from './medications.router.js';
import { v1PrescriptionsRouter } from './prescriptions.router.js';
import { v1PharmaciesRouter } from './pharmacies.router.js';
import { v1PatientMedicationsRouter } from './patient-medications.router.js';
import { v1AllergiesRouter } from './allergies.router.js';
import { v1DiagnosesRouter } from './diagnoses.router.js';
import { v1CarePlansRouter } from './care-plans.router.js';
import { v1FollowUpRouter } from './follow-up.router.js';
import { v1ClinicalAlertsRouter, v1ClinicalRulesRouter } from './clinical-alerts.router.js';
import { v1TerminologyRouter } from './terminology.router.js';
import { v1SubscriptionsRouter } from './subscriptions.router.js';
import { v1NotificationsRouter } from './notifications.router.js';
import { v1OnboardingRouter } from './onboarding.router.js';
import { patientPortalRouter } from './patient-portal.router.js';
import { requireActiveOrganization } from '../../middleware/onboarding-guard.js';
import { requireStaffAccount } from '../../middleware/auth.js';

export const v1ApiRouter = Router();

v1ApiRouter.use('/auth', v1AuthRouter);
v1ApiRouter.use('/patient-portal', patientPortalRouter);
v1ApiRouter.use('/organizations', requireStaffAccount, v1OrgsRouter);
v1ApiRouter.use('/diagnostic', requireStaffAccount, v1DiagnosticRouter);
v1ApiRouter.use('/me', v1MeRouter);
v1ApiRouter.use('/patients', requireStaffAccount, requireActiveOrganization, v1PatientsRouter);
v1ApiRouter.use('/providers', requireStaffAccount, requireActiveOrganization, v1ProvidersRouter);
v1ApiRouter.use('/departments', requireStaffAccount, requireActiveOrganization, v1DepartmentsRouter);
v1ApiRouter.use('/appointments', requireStaffAccount, requireActiveOrganization, v1AppointmentsRouter);
v1ApiRouter.use('/appointment-types', requireStaffAccount, requireActiveOrganization, v1AppointmentTypesRouter);
v1ApiRouter.use('/specialties', requireStaffAccount, requireActiveOrganization, v1SpecialtiesRouter);
v1ApiRouter.use('/encounters', requireStaffAccount, requireActiveOrganization, v1EncountersRouter);
v1ApiRouter.use('/clinical-notes', requireStaffAccount, requireActiveOrganization, v1ClinicalNotesRouter);
v1ApiRouter.use('/diagnoses', requireStaffAccount, requireActiveOrganization, v1DiagnosesRouter);
v1ApiRouter.use('/care-plans', requireStaffAccount, requireActiveOrganization, v1CarePlansRouter);
v1ApiRouter.use('/follow-up', requireStaffAccount, requireActiveOrganization, v1FollowUpRouter);
v1ApiRouter.use('/clinical-alerts', requireStaffAccount, requireActiveOrganization, v1ClinicalAlertsRouter);
v1ApiRouter.use('/clinical-rules', requireStaffAccount, requireActiveOrganization, v1ClinicalRulesRouter);
v1ApiRouter.use('/terminology', requireStaffAccount, requireActiveOrganization, v1TerminologyRouter);
v1ApiRouter.use('/medications', requireStaffAccount, requireActiveOrganization, v1MedicationsRouter);
v1ApiRouter.use('/prescriptions', requireStaffAccount, requireActiveOrganization, v1PrescriptionsRouter);
v1ApiRouter.use('/pharmacies', requireStaffAccount, requireActiveOrganization, v1PharmaciesRouter);
v1ApiRouter.use('/patient-medications', requireStaffAccount, requireActiveOrganization, v1PatientMedicationsRouter);
v1ApiRouter.use('/allergies', requireStaffAccount, requireActiveOrganization, v1AllergiesRouter);
v1ApiRouter.use('/subscriptions', requireStaffAccount, requireActiveOrganization, v1SubscriptionsRouter);
v1ApiRouter.use('/notifications', requireStaffAccount, requireActiveOrganization, v1NotificationsRouter);
v1ApiRouter.use('/onboarding', v1OnboardingRouter);


