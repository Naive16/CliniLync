/**
 * CLINILYNC Billing API Router
 */

import { Router, Response } from 'express';
import crypto from 'node:crypto';
import { getDatabaseClient } from '../../database/db.js';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth.js';
import { enforceTenantIsolation } from '../middleware/tenant.js';
import { originValidationMiddleware } from '../middleware/csrf.js';
import { requirePermission } from '../middleware/require-permission.js';
import { Permissions } from '../security/permissions.js';
import { AuditService } from '../security/audit.js';
import { Invoice, Patient } from '../types/domain.js';

export const billingRouter = Router();

billingRouter.use(authenticateToken);
billingRouter.use(enforceTenantIsolation);

// GET /api/billing/invoices - List invoices
billingRouter.get('/invoices', requirePermission(Permissions.BILLING_VIEW), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const db = getDatabaseClient();
  const patientId = req.query.patientId as string;

  let query = 'SELECT * FROM invoices WHERE organization_id = $1';
  const params: unknown[] = [context.activeOrganization.id];

  if (patientId) {
    query += ' AND patient_id = $2';
    params.push(patientId);
  }

  query += ' ORDER BY created_at DESC';

  const invRes = await db.query<Invoice>(query, params);
  const invoices = invRes.rows;

  // Enrich with patient details and line items
  const enriched = await Promise.all(
    invoices.map(async (inv) => {
      const patRes = await db.query<Patient>('SELECT id, first_name, last_name, mrn FROM patients WHERE id = $1', [inv.patient_id]);
      const itemsRes = await db.query('SELECT * FROM invoice_items WHERE invoice_id = $1', [inv.id]);
      const paymentsRes = await db.query('SELECT * FROM payments WHERE invoice_id = $1 ORDER BY payment_date DESC', [inv.id]);

      return {
        ...inv,
        patient: patRes.rows[0] || null,
        items: itemsRes.rows,
        payments: paymentsRes.rows
      };
    })
  );

  res.json({ invoices: enriched, total: enriched.length });
});

// POST /api/billing/invoices - Create invoice
billingRouter.post('/invoices', requirePermission(Permissions.BILLING_CREATE_INVOICE), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const db = getDatabaseClient();
  const { patientId, dueDate, items, notes } = req.body;

  if (!patientId || !items || !Array.isArray(items) || items.length === 0) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'patientId and items array are required' } });
    return;
  }

  const patient = await db.query<Patient>('SELECT id FROM patients WHERE id = $1 AND organization_id = $2 AND is_active = TRUE', [patientId, context.activeOrganization.id]);
  if (!patient.rows[0]) {
    res.status(400).json({ error: { code: 'PATIENT_NOT_FOUND', message: 'Patient is not in the active organization.' } });
    return;
  }

  const invoiceId = `inv_${crypto.randomUUID().substring(0, 8)}`;
  const invoiceNumber = `INV-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

  let subtotal = 0;
  for (const item of items) {
    const qty = Number(item.quantity) || 1;
    const price = Number(item.unitPrice) || 0;
    subtotal += qty * price;
  }

  const tax = 0;
  const discount = 0;
  const totalAmount = subtotal + tax - discount;
  const currency = context.activeOrganization.currency_code || 'GBP';

  const newInvoice: Invoice = {
    id: invoiceId,
    organization_id: context.activeOrganization.id,
    patient_id: patientId,
    invoice_number: invoiceNumber,
    issue_date: new Date().toISOString().split('T')[0],
    due_date: dueDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    subtotal,
    tax,
    discount,
    total_amount: totalAmount,
    paid_amount: 0,
    balance_due: totalAmount,
    currency,
    status: 'ISSUED',
    notes: notes || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  await db.query(
    `INSERT INTO invoices 
      (id, organization_id, patient_id, invoice_number, issue_date, due_date, subtotal, tax, discount, total_amount, paid_amount, balance_due, currency, status, notes, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
    [
      newInvoice.id,
      newInvoice.organization_id,
      newInvoice.patient_id,
      newInvoice.invoice_number,
      newInvoice.issue_date,
      newInvoice.due_date,
      newInvoice.subtotal,
      newInvoice.tax,
      newInvoice.discount,
      newInvoice.total_amount,
      newInvoice.paid_amount,
      newInvoice.balance_due,
      newInvoice.currency,
      newInvoice.status,
      newInvoice.notes,
      newInvoice.created_at,
      newInvoice.updated_at
    ]
  );

  // Insert line items
  for (const item of items) {
    const itemId = `item_${crypto.randomUUID().substring(0, 8)}`;
    const qty = Number(item.quantity) || 1;
    const unitPrice = Number(item.unitPrice) || 0;
    const totalPrice = qty * unitPrice;

    await db.query(
      `INSERT INTO invoice_items (id, invoice_id, service_id, description, quantity, unit_price, total_price)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [itemId, invoiceId, item.serviceId || null, item.description || 'Clinical Service', qty, unitPrice, totalPrice]
    );
  }

  AuditService.logEvent({
    organizationId: context.activeOrganization.id,
    actorId: context.user.id,
    actorRole: context.roles.map(r => r.code).join(','),
    action: 'billing.invoice_created',
    resourceType: 'Invoice',
    resourceId: newInvoice.id,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
    metadata: { invoiceNumber, totalAmount, patientId },
    severity: 'INFO'
  });

  res.status(201).json({ invoice: newInvoice });
});

// PATCH /api/billing/invoices/:id - Update editable invoice fields without changing its historical currency or totals.
billingRouter.patch('/invoices/:id', requirePermission(Permissions.BILLING_UPDATE_INVOICE), originValidationMiddleware, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const db = getDatabaseClient();
  const current = await db.query<Invoice>('SELECT * FROM invoices WHERE id = $1 AND organization_id = $2', [req.params.id, context.activeOrganization.id]);
  const invoice = current.rows[0];
  if (!invoice) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Invoice not found in this organization.' } });
    return;
  }
  if (invoice.status === 'PAID') {
    res.status(409).json({ error: { code: 'INVOICE_LOCKED', message: 'Paid invoices cannot be edited.' } });
    return;
  }
  const dueDate = typeof req.body.dueDate === 'string' ? req.body.dueDate.trim() : invoice.due_date;
  const notes = req.body.notes === null ? null : typeof req.body.notes === 'string' ? req.body.notes.trim().slice(0, 2000) : invoice.notes;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'dueDate must use YYYY-MM-DD format.' } });
    return;
  }
  await db.query('UPDATE invoices SET due_date = $1, notes = $2, updated_at = $3 WHERE id = $4 AND organization_id = $5', [dueDate, notes, new Date().toISOString(), invoice.id, context.activeOrganization.id]);
  const updated = await db.query<Invoice>('SELECT * FROM invoices WHERE id = $1 AND organization_id = $2', [invoice.id, context.activeOrganization.id]);
  await AuditService.logEvent({ organizationId: context.activeOrganization.id, actorId: context.user.id, actorRole: context.roles.map(role => role.code).join(','), action: 'billing.invoice_updated', resourceType: 'Invoice', resourceId: invoice.id, metadata: { fields: ['dueDate', 'notes'], currency: invoice.currency }, severity: 'INFO', ipAddress: req.ip, userAgent: req.get('user-agent') });
  res.json({ invoice: updated.rows[0] });
});

// POST /api/billing/invoices/:id/payments - Record payment
billingRouter.post('/invoices/:id/payments', requirePermission(Permissions.BILLING_RECORD_PAYMENT), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const db = getDatabaseClient();
  const invoiceId = req.params.id;
  const { amount, paymentMethod, referenceNumber, notes } = req.body;

  const invRes = await db.query<Invoice>('SELECT * FROM invoices WHERE id = $1 AND organization_id = $2', [
    invoiceId,
    context.activeOrganization.id
  ]);

  if (invRes.rows.length === 0) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Invoice not found in this organization' } });
    return;
  }

  const invoice = invRes.rows[0];
  const payAmount = Number(amount);

  if (isNaN(payAmount) || payAmount <= 0) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Payment amount must be greater than zero' } });
    return;
  }

  const newPaidAmount = Number(invoice.paid_amount) + payAmount;
  const newBalance = Math.max(0, Number(invoice.total_amount) - newPaidAmount);
  const newStatus = newBalance === 0 ? 'PAID' : 'PARTIALLY_PAID';

  const payId = `pay_${crypto.randomUUID().substring(0, 8)}`;
  const payNumber = `REC-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

  await db.query(
    `INSERT INTO payments 
      (id, organization_id, invoice_id, patient_id, payment_number, payment_date, amount, currency, payment_method, reference_number, notes, recorded_by, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [
      payId,
      context.activeOrganization.id,
      invoice.id,
      invoice.patient_id,
      payNumber,
      new Date().toISOString(),
      payAmount,
      invoice.currency,
      paymentMethod || 'CARD',
      referenceNumber || null,
      notes || null,
      context.user.id,
      new Date().toISOString()
    ]
  );

  await db.query(
    'UPDATE invoices SET paid_amount = $1, balance_due = $2, status = $3, updated_at = $4 WHERE id = $5 AND organization_id = $6',
    [newPaidAmount, newBalance, newStatus, new Date().toISOString(), invoice.id, context.activeOrganization.id]
  );

  AuditService.logEvent({
    organizationId: context.activeOrganization.id,
    actorId: context.user.id,
    actorRole: context.roles.map(r => r.code).join(','),
    action: 'billing.payment_recorded',
    resourceType: 'Payment',
    resourceId: payId,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
    metadata: { invoiceId: invoice.id, amountPaid: payAmount, remainingBalance: newBalance },
    severity: 'INFO'
  });

  res.json({
    success: true,
    paymentId: payId,
    newBalanceDue: newBalance,
    status: newStatus
  });
});
