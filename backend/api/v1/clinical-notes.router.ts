/**
 * CLINILYNC Clinical Notes API Router (v1)
 * 
 * Base path: /api/v1/clinical-notes
 * 
 * Enforces:
 * 1. Multi-Tenant Organization Isolation
 * 2. Immutable Signed State & Concurrency Protection
 * 3. Atomic Amendment History and Version Preservation
 * 4. Granular RBAC Permissions
 */

import { Router, Response } from 'express';
import { getDatabaseClient } from '../../../database/db.js';
import { authenticateToken, AuthenticatedRequest, requirePermission } from '../../middleware/auth.js';
import { Permissions } from '../../security/permissions.js';
import { ClinicalNote, User, ClinicalNoteVersion } from '../../types/domain.js';
import { ClinicalService, ClinicalError } from '../../services/clinical.service.js';

export const v1ClinicalNotesRouter = Router();

v1ClinicalNotesRouter.use(authenticateToken);

/**
 * GET /api/v1/clinical-notes/:noteId
 * Get a single clinical note and its version history count
 */
v1ClinicalNotesRouter.get('/:noteId', requirePermission(Permissions.CLINICAL_NOTE_VIEW), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const db = getDatabaseClient();
  const { noteId } = req.params;

  const noteRes = await db.query<ClinicalNote>(
    'SELECT * FROM clinical_notes WHERE id = $1 AND organization_id = $2',
    [noteId, context.activeOrganization.id]
  );

  if (!noteRes.rows.length) {
    res.status(404).json({ error: { code: 'NOTE_NOT_FOUND', message: 'Clinical note not found.' } });
    return;
  }

  const note = noteRes.rows[0];

  // Fetch author & signer details
  const [authorRes, signerRes, versionsRes] = await Promise.all([
    db.query<User>('SELECT id, first_name, last_name, email FROM users WHERE id = $1', [note.author_id]),
    note.signed_by_user_id ? db.query<User>('SELECT id, first_name, last_name, email FROM users WHERE id = $1', [note.signed_by_user_id]) : Promise.resolve({ rows: [] }),
    db.query<ClinicalNoteVersion>('SELECT * FROM clinical_note_versions WHERE note_id = $1 AND organization_id = $2 ORDER BY version_number ASC', [noteId, context.activeOrganization.id])
  ]);

  res.json({
    data: {
      note,
      author: authorRes.rows[0] || null,
      signer: signerRes.rows[0] || null,
      versions: versionsRes.rows
    }
  });
});

/**
 * PATCH /api/v1/clinical-notes/:noteId
 * Update a draft clinical note with optimistic locking
 */
v1ClinicalNotesRouter.patch('/:noteId', requirePermission(Permissions.CLINICAL_NOTE_UPDATE_DRAFT), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const { noteId } = req.params;

  try {
    const updated = await ClinicalService.updateDraftNote({
      organizationId: context.activeOrganization.id,
      noteId,
      expectedVersion: req.body.expectedVersion !== undefined ? Number(req.body.expectedVersion) : undefined,
      chiefComplaint: req.body.chiefComplaint,
      historyOfPresentIllness: req.body.historyOfPresentIllness,
      pastMedicalHistory: req.body.pastMedicalHistory,
      surgicalHistory: req.body.surgicalHistory,
      familySocialHistory: req.body.familySocialHistory,
      reviewOfSystems: req.body.reviewOfSystems,
      physicalExamination: req.body.physicalExamination,
      assessment: req.body.assessment,
      plan: req.body.plan,
      followUpInstructions: req.body.followUpInstructions,
      userId: context.user.id,
      userRole: context.roles[0]?.code,
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    res.json({ data: { note: updated } });
  } catch (err) {
    if (err instanceof ClinicalError) {
      res.status(err.statusCode).json({ error: { code: err.code, message: err.message } });
      return;
    }
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to update clinical note.' } });
  }
});

/**
 * POST /api/v1/clinical-notes/:noteId/sign
 * Sign and finalize a clinical note
 */
v1ClinicalNotesRouter.post('/:noteId/sign', requirePermission(Permissions.CLINICAL_NOTE_SIGN), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const { noteId } = req.params;

  try {
    const signedNote = await ClinicalService.signNote(
      context.activeOrganization.id,
      noteId,
      context.user.id,
      context.roles[0]?.code,
      req.ip,
      req.get('user-agent')
    );

    res.json({ data: { note: signedNote } });
  } catch (err) {
    if (err instanceof ClinicalError) {
      res.status(err.statusCode).json({ error: { code: err.code, message: err.message } });
      return;
    }
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to sign clinical note.' } });
  }
});

/**
 * POST /api/v1/clinical-notes/:noteId/amend
 * Amend a signed clinical note with traceable version archival
 */
v1ClinicalNotesRouter.post('/:noteId/amend', requirePermission(Permissions.CLINICAL_NOTE_AMEND), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const { noteId } = req.params;
  const { amendmentReason, ...updates } = req.body;

  if (!amendmentReason || !String(amendmentReason).trim()) {
    res.status(400).json({ error: { code: 'AMENDMENT_REASON_REQUIRED', message: 'A valid clinical justification for amending signed documentation is required.' } });
    return;
  }

  try {
    const amendedNote = await ClinicalService.amendNote({
      organizationId: context.activeOrganization.id,
      noteId,
      amendmentReason: String(amendmentReason).trim(),
      chiefComplaint: updates.chiefComplaint,
      historyOfPresentIllness: updates.historyOfPresentIllness,
      pastMedicalHistory: updates.pastMedicalHistory,
      surgicalHistory: updates.surgicalHistory,
      familySocialHistory: updates.familySocialHistory,
      reviewOfSystems: updates.reviewOfSystems,
      physicalExamination: updates.physicalExamination,
      assessment: updates.assessment,
      plan: updates.plan,
      followUpInstructions: updates.followUpInstructions,
      userId: context.user.id,
      userRole: context.roles[0]?.code,
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    res.json({ data: { note: amendedNote } });
  } catch (err) {
    if (err instanceof ClinicalError) {
      res.status(err.statusCode).json({ error: { code: err.code, message: err.message } });
      return;
    }
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to amend clinical note.' } });
  }
});

/**
 * GET /api/v1/clinical-notes/:noteId/versions
 * Get the immutable audit history of all signed/amended versions of this note
 */
v1ClinicalNotesRouter.get('/:noteId/versions', requirePermission(Permissions.CLINICAL_NOTE_VIEW), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const { noteId } = req.params;

  try {
    const versions = await ClinicalService.getNoteVersions(context.activeOrganization.id, noteId);
    res.json({ data: { versions, total: versions.length } });
  } catch (err) {
    if (err instanceof ClinicalError) {
      res.status(err.statusCode).json({ error: { code: err.code, message: err.message } });
      return;
    }
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to retrieve note versions.' } });
  }
});
