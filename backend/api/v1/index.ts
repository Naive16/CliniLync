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

export const v1ApiRouter = Router();

v1ApiRouter.use('/auth', v1AuthRouter);
v1ApiRouter.use('/organizations', v1OrgsRouter);
v1ApiRouter.use('/diagnostic', v1DiagnosticRouter);
v1ApiRouter.use('/me', v1MeRouter);
v1ApiRouter.use('/patients', v1PatientsRouter);
v1ApiRouter.use('/providers', v1ProvidersRouter);
v1ApiRouter.use('/departments', v1DepartmentsRouter);
v1ApiRouter.use('/appointments', v1AppointmentsRouter);
v1ApiRouter.use('/appointment-types', v1AppointmentTypesRouter);
v1ApiRouter.use('/specialties', v1SpecialtiesRouter);
v1ApiRouter.use('/encounters', v1EncountersRouter);
v1ApiRouter.use('/clinical-notes', v1ClinicalNotesRouter);
v1ApiRouter.use('/diagnoses', v1DiagnosesRouter);
v1ApiRouter.use('/care-plans', v1CarePlansRouter);
v1ApiRouter.use('/follow-up', v1FollowUpRouter);
v1ApiRouter.use('/clinical-alerts', v1ClinicalAlertsRouter);
v1ApiRouter.use('/clinical-rules', v1ClinicalRulesRouter);
v1ApiRouter.use('/terminology', v1TerminologyRouter);
v1ApiRouter.use('/medications', v1MedicationsRouter);
v1ApiRouter.use('/prescriptions', v1PrescriptionsRouter);
v1ApiRouter.use('/pharmacies', v1PharmaciesRouter);
v1ApiRouter.use('/patient-medications', v1PatientMedicationsRouter);
v1ApiRouter.use('/allergies', v1AllergiesRouter);
v1ApiRouter.use('/subscriptions', v1SubscriptionsRouter);


