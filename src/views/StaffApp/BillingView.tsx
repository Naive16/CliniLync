/**
 * CLINILYNC Billing & Invoicing Management (/app/billing)
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { api } from '../../api/client.js';
import { Receipt, Plus, CreditCard, DollarSign, CheckCircle2, AlertCircle, X, Printer, Save } from 'lucide-react';

const formatMoney = (amount: unknown, currency = 'GBP') => `${currency} ${Number(amount || 0).toFixed(2)}`;

export const BillingView: React.FC = () => {
  const { activeOrganization, hasPermission } = useAuth();
  const [invoices, setInvoices] = useState<any[]>([]);
  const [patients, setPatients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedInvoice, setSelectedInvoice] = useState<any | null>(null);
  const [invoiceEdit, setInvoiceEdit] = useState({ dueDate: '', notes: '' });
  const [invoiceSaving, setInvoiceSaving] = useState(false);
  const [invoiceMessage, setInvoiceMessage] = useState<string | null>(null);

  // Create Invoice Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newInvoice, setNewInvoice] = useState({
    patientId: '',
    serviceDescription: 'Comprehensive Specialist Consultation',
    unitPrice: 180,
    quantity: 1,
    notes: 'Outpatient clinical encounter charge'
  });

  // Record Payment Modal State
  const [showPayModal, setShowPayModal] = useState(false);
  const [activeInvoiceForPay, setActiveInvoiceForPay] = useState<any | null>(null);
  const [paymentData, setPaymentData] = useState({
    amount: 0,
    paymentMethod: 'CARD',
    referenceNumber: '',
    notes: 'Settled at clinic desk'
  });

  useEffect(() => {
    loadBillingData();
  }, [activeOrganization?.id]);

  const loadBillingData = async () => {
    setLoading(true);
    try {
      const [invRes, patRes] = await Promise.all([
        api.getInvoices(),
        api.getPatients()
      ]);
      setInvoices(invRes.invoices || []);
      setPatients(patRes.patients || []);
      if ((patRes.patients as any[])?.length > 0 && !newInvoice.patientId) {
        setNewInvoice(prev => ({ ...prev, patientId: (patRes.patients as any[])[0].id }));
      }
    } catch (err) {
      console.error('Failed to load billing:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createInvoice({
        patientId: newInvoice.patientId,
        items: [
          {
            description: newInvoice.serviceDescription,
            unitPrice: Number(newInvoice.unitPrice),
            quantity: Number(newInvoice.quantity)
          }
        ],
        notes: newInvoice.notes
      });
      setShowCreateModal(false);
      await loadBillingData();
    } catch (err) {
      alert((err as Error).message);
    }
  };

  const handleOpenPayModal = (inv: any) => {
    setActiveInvoiceForPay(inv);
    setPaymentData({
      amount: inv.balance_due,
      paymentMethod: 'CARD',
      referenceNumber: `AUTH-${Math.floor(10000 + Math.random() * 90000)}`,
      notes: 'Terminal settlement'
    });
    setShowPayModal(true);
  };

  const openInvoice = (invoice: any) => {
    setSelectedInvoice(invoice);
    setInvoiceEdit({ dueDate: invoice.due_date || '', notes: invoice.notes || '' });
    setInvoiceMessage(null);
  };

  const saveInvoice = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedInvoice) return;
    setInvoiceSaving(true); setInvoiceMessage(null);
    try {
      const response = await api.updateInvoice(selectedInvoice.id, invoiceEdit);
      setSelectedInvoice({ ...selectedInvoice, ...response.invoice });
      setInvoices((current) => current.map((invoice) => invoice.id === selectedInvoice.id ? { ...invoice, ...response.invoice } : invoice));
      setInvoiceMessage('Invoice saved.');
    } catch (err) { setInvoiceMessage((err as Error).message || 'Invoice could not be saved.'); }
    finally { setInvoiceSaving(false); }
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeInvoiceForPay) return;
    try {
      await api.recordPayment(activeInvoiceForPay.id, paymentData);
      setShowPayModal(false);
      await loadBillingData();
    } catch (err) {
      alert((err as Error).message);
    }
  };

  // Summaries
  const totalBilled = invoices.reduce((acc, inv) => acc + Number(inv.total_amount), 0);
  const totalPaid = invoices.reduce((acc, inv) => acc + Number(inv.paid_amount), 0);
  const totalOutstanding = invoices.reduce((acc, inv) => acc + Number(inv.balance_due), 0);
  const invoiceCurrencies = Array.from(new Set(invoices.map((invoice) => invoice.currency || activeOrganization?.currency_code || 'GBP')));
  const summaryCurrency = invoiceCurrencies.length === 1 ? invoiceCurrencies[0] : activeOrganization?.currency_code || 'GBP';
  const mixedCurrencies = invoiceCurrencies.length > 1;

  return (
    <div className="cl-ui-page space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Billing & Financial Invoicing</h1>
          <p className="text-xs text-slate-500">
            {activeOrganization?.name} · Currency: {activeOrganization?.currency_code}
          </p>
        </div>

        {hasPermission('billing.create_invoice') && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg shadow-xs transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Generate Invoice</span>
          </button>
        )}
      </div>

      {/* Financial Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 bg-white rounded-lg border border-slate-200 shadow-xs space-y-1">
          <span className="text-xs text-slate-500">Total Billed to Date</span>
          <div className="text-2xl font-bold text-slate-900 font-mono tabular-nums">
            {mixedCurrencies ? 'Multiple currencies' : formatMoney(totalBilled, summaryCurrency)}
          </div>
          <div className="text-[11px] text-slate-400">{invoices.length} Invoices Issued</div>
        </div>

        <div className="p-4 bg-white rounded-lg border border-slate-200 shadow-xs space-y-1">
          <span className="text-xs text-slate-500">Collected Revenue</span>
          <div className="text-2xl font-bold text-emerald-700 font-mono tabular-nums">
            {mixedCurrencies ? 'Multiple currencies' : formatMoney(totalPaid, summaryCurrency)}
          </div>
          <div className="text-[11px] text-emerald-600">Settled Payments</div>
        </div>

        <div className="p-4 bg-white rounded-lg border border-slate-200 shadow-xs space-y-1">
          <span className="text-xs text-slate-500">Outstanding Balance</span>
          <div className="text-2xl font-bold text-amber-700 font-mono tabular-nums">
            {mixedCurrencies ? 'Multiple currencies' : formatMoney(totalOutstanding, summaryCurrency)}
          </div>
          <div className="text-[11px] text-amber-600">Accounts Receivable</div>
        </div>
      </div>

      {/* Invoices Table */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Invoices & Encounters</h2>
          <span className="text-xs font-mono text-slate-400">{invoices.length} Records</span>
        </div>

        {invoices.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-400">No invoices issued for this organization.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/50 text-slate-500 border-b border-slate-100">
                <tr>
                  <th className="px-5 py-2.5 font-medium">Invoice Number</th>
                  <th className="px-5 py-2.5 font-medium">Patient</th>
                  <th className="px-5 py-2.5 font-medium">Issue / Due Date</th>
                  <th className="px-5 py-2.5 font-medium text-right">Total Amount</th>
                  <th className="px-5 py-2.5 font-medium text-right">Balance Due</th>
                  <th className="px-5 py-2.5 font-medium">Status</th>
                  <th className="px-5 py-2.5 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invoices.map((inv) => {
                  const patName = inv.patient ? `${inv.patient.first_name} ${inv.patient.last_name}` : 'Patient';

                  return (
                    <tr key={inv.id} className="hover:bg-slate-50/60 transition-colors cursor-pointer" onClick={() => openInvoice(inv)}>
                      <td className="px-5 py-3 font-mono font-semibold text-slate-900">
                        {inv.invoice_number}
                      </td>
                      <td className="px-5 py-3">
                        <div className="font-semibold text-slate-900">{patName}</div>
                        <div className="text-[11px] text-slate-400 font-mono">{inv.patient?.mrn}</div>
                      </td>
                      <td className="px-5 py-3 font-mono tabular-nums text-slate-600">
                        <div>Issued: {inv.issue_date}</div>
                        <div className="text-[11px] text-slate-400">Due: {inv.due_date}</div>
                      </td>
                      <td className="px-5 py-3 text-right font-mono font-semibold text-slate-900 tabular-nums">
                        {formatMoney(inv.total_amount, inv.currency)}
                      </td>
                      <td className="px-5 py-3 text-right font-mono font-bold tabular-nums text-slate-800">
                        {formatMoney(inv.balance_due, inv.currency)}
                      </td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex items-center gap-1.5 text-xs ${
                          inv.status === 'PAID' ? 'text-emerald-700 font-medium' :
                          inv.status === 'PARTIALLY_PAID' ? 'text-amber-700 font-medium' :
                          'text-slate-700'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${
                            inv.status === 'PAID' ? 'bg-emerald-500' :
                            inv.status === 'PARTIALLY_PAID' ? 'bg-amber-500' :
                            'bg-slate-400'
                          }`} />
                          {inv.status.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        {inv.status !== 'PAID' && hasPermission('billing.record_payment') && (
                          <button
                            onClick={(event) => { event.stopPropagation(); handleOpenPayModal(inv); }}
                            className="px-2.5 py-1 text-xs font-medium text-teal-800 bg-teal-50 hover:bg-teal-100 rounded border border-teal-200 transition-colors"
                          >
                            Record Payment
                          </button>
                        )}
                        {inv.status === 'PAID' && (
                          <span className="text-slate-400 text-xs">Settled</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Generate Invoice Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50">
              <h3 className="font-bold text-slate-900 text-sm">Generate Clinical Invoice</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateInvoice} className="p-6 space-y-4 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Select Patient *</label>
                <select
                  value={newInvoice.patientId}
                  onChange={(e) => setNewInvoice({ ...newInvoice, patientId: e.target.value })}
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-600"
                >
                  {patients.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.first_name} {p.last_name} ({p.mrn})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Clinical Service Description</label>
                <input
                  type="text"
                  required
                  value={newInvoice.serviceDescription}
                  onChange={(e) => setNewInvoice({ ...newInvoice, serviceDescription: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Unit Price ({activeOrganization?.currency_code})</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={newInvoice.unitPrice}
                    onChange={(e) => setNewInvoice({ ...newInvoice, unitPrice: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-600 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Quantity</label>
                  <input
                    type="number"
                    min="1"
                    value={newInvoice.quantity}
                    onChange={(e) => setNewInvoice({ ...newInvoice, quantity: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-600 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Invoice Notes</label>
                <textarea
                  rows={2}
                  value={newInvoice.notes}
                  onChange={(e) => setNewInvoice({ ...newInvoice, notes: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-600"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-lg font-semibold"
                >
                  Create Invoice
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Record Payment Modal */}
      {showPayModal && activeInvoiceForPay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Record Payment Against Invoice</h3>
                <span className="font-mono text-xs text-slate-500">{activeInvoiceForPay.invoice_number}</span>
              </div>
              <button onClick={() => setShowPayModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleRecordPayment} className="p-6 space-y-4 text-xs">
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200/80 flex items-center justify-between">
                <span className="text-slate-600">Outstanding Balance:</span>
                <span className="font-mono font-bold text-slate-900 text-sm">
                  {formatMoney(activeInvoiceForPay.balance_due, activeInvoiceForPay.currency)}
                </span>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Payment Amount ({activeOrganization?.currency_code}) *</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={paymentData.amount}
                  onChange={(e) => setPaymentData({ ...paymentData, amount: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-600 font-mono"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Payment Method</label>
                <select
                  value={paymentData.paymentMethod}
                  onChange={(e) => setPaymentData({ ...paymentData, paymentMethod: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-600"
                >
                  <option value="CARD">Debit / Credit Card</option>
                  <option value="CASH">Cash</option>
                  <option value="INSURANCE">Insurance Claim</option>
                  <option value="WIRE">Bank Transfer</option>
                </select>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Reference / Authorization Code</label>
                <input
                  type="text"
                  value={paymentData.referenceNumber}
                  onChange={(e) => setPaymentData({ ...paymentData, referenceNumber: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-600 font-mono"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowPayModal(false)}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-lg font-semibold"
                >
                  Confirm Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selectedInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="invoice-print-sheet bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-200">
            <div className="invoice-print-actions flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50">
              <div><h3 className="font-bold text-slate-900">Invoice {selectedInvoice.invoice_number}</h3><p className="text-xs text-slate-500">Saved currency: {selectedInvoice.currency}</p></div>
              <div className="flex items-center gap-2"><button type="button" onClick={() => window.print()} className="px-3 py-2 text-xs font-semibold text-sky-800 border border-sky-200 rounded-lg hover:bg-sky-50"><Printer className="inline w-4 h-4 mr-1" />Print / PDF</button><button type="button" onClick={() => setSelectedInvoice(null)} className="text-slate-400 hover:text-slate-700" aria-label="Close invoice"><X className="w-5 h-5" /></button></div>
            </div>
            <form onSubmit={saveInvoice} className="p-6 space-y-5">
              {invoiceMessage && <div className="invoice-print-actions p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700" role="status">{invoiceMessage}</div>}
              <div className="grid gap-4 sm:grid-cols-2 text-sm"><div><span className="text-xs text-slate-500 block">Patient</span><strong>{selectedInvoice.patient ? `${selectedInvoice.patient.first_name} ${selectedInvoice.patient.last_name}` : 'Patient'}</strong><span className="block text-xs text-slate-500">{selectedInvoice.patient?.mrn || ''}</span></div><div className="sm:text-right"><span className="text-xs text-slate-500 block">Issue date</span><strong>{selectedInvoice.issue_date}</strong><span className="block text-xs text-slate-500">Status: {selectedInvoice.status.replace(/_/g, ' ')}</span></div></div>
              <div className="border border-slate-200 rounded-lg overflow-hidden"><table className="w-full text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="text-left px-4 py-2">Description</th><th className="text-right px-4 py-2">Qty</th><th className="text-right px-4 py-2">Amount</th></tr></thead><tbody>{(selectedInvoice.items || []).map((item: any) => <tr key={item.id} className="border-t border-slate-100"><td className="px-4 py-2">{item.description}</td><td className="px-4 py-2 text-right">{item.quantity}</td><td className="px-4 py-2 text-right">{formatMoney(item.total_price, selectedInvoice.currency)}</td></tr>)}</tbody></table></div>
              <div className="grid gap-2 justify-end text-sm text-right"><div>Subtotal: {formatMoney(selectedInvoice.subtotal, selectedInvoice.currency)}</div><div>Tax: {formatMoney(selectedInvoice.tax, selectedInvoice.currency)}</div><div className="font-bold text-base">Total: {formatMoney(selectedInvoice.total_amount, selectedInvoice.currency)}</div><div>Balance due: {formatMoney(selectedInvoice.balance_due, selectedInvoice.currency)}</div></div>
              <div className="invoice-print-actions grid gap-4 sm:grid-cols-2 border-t border-slate-100 pt-4"><label className="text-xs font-semibold text-slate-700">Due date<input type="date" value={invoiceEdit.dueDate} disabled={selectedInvoice.status === 'PAID'} onChange={(event) => setInvoiceEdit({ ...invoiceEdit, dueDate: event.target.value })} className="mt-1 w-full" /></label><label className="text-xs font-semibold text-slate-700">Notes<textarea rows={3} value={invoiceEdit.notes} disabled={selectedInvoice.status === 'PAID'} onChange={(event) => setInvoiceEdit({ ...invoiceEdit, notes: event.target.value })} className="mt-1 w-full" /></label></div>
              <div className="invoice-print-actions flex justify-end"><button type="submit" disabled={invoiceSaving || selectedInvoice.status === 'PAID' || !hasPermission('billing.update_invoice')} className="px-4 py-2 bg-sky-700 hover:bg-sky-800 text-white rounded-lg font-semibold text-xs"><Save className="inline w-4 h-4 mr-1" />{invoiceSaving ? 'Saving…' : 'Save invoice'}</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
