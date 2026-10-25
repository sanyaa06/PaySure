import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRightLeft, Copy, CreditCard, Filter, Loader2, Plus, Search, ShieldCheck, Sparkles } from 'lucide-react';
import { CopyButton } from '../components/CopyButton';
import { ErrorState } from '../components/ErrorState';
import { LoadingSkeleton } from '../components/LoadingSkeleton';
import { PageHeader } from '../components/PageHeader';
import { StatusBadge } from '../components/StatusBadge';
import { cancelPayment, createPayment, fetchPaymentEvents, fetchPaymentList, refundPayment } from '../services/api';
import { PaymentEventRecord, PaymentRecord } from '../types';

const formatCurrency = (amount: number, currency: string) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount / 100);

export const TransactionsPage: React.FC = () => {
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [selectedPaymentId, setSelectedPaymentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState('all');
  const [events, setEvents] = useState<PaymentEventRecord[]>([]);
  const [form, setForm] = useState({ amount: '4500', currency: 'USD', idempotency_key: '', client_id: 'ops-console' });

  const loadPayments = async () => {
    setLoading(true);
    try {
      const data = await fetchPaymentList(filterStatus === 'all' ? undefined : filterStatus);
      setPayments(data.items ?? []);
      if (!selectedPaymentId && data.items.length) setSelectedPaymentId(data.items[0].id);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load payments.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadPayments();
  }, [filterStatus]);

  useEffect(() => {
    if (!selectedPaymentId) return;
    let ignore = false;
    const loadEvents = async () => {
      try {
        const data = await fetchPaymentEvents(selectedPaymentId);
        if (!ignore) setEvents(data);
      } catch {
        if (!ignore) setEvents([]);
      }
    };
    void loadEvents();
    return () => { ignore = true; };
  }, [selectedPaymentId]);

  const selectedPayment = useMemo(
    () => payments.find((payment) => payment.id === selectedPaymentId) ?? payments[0] ?? null,
    [payments, selectedPaymentId],
  );

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const payload = {
        amount: Number(form.amount),
        currency: form.currency,
        idempotency_key: form.idempotency_key || `ops-${Date.now()}`,
        client_id: form.client_id || 'ops-console',
      };
      const created = await createPayment(payload);
      setSelectedPaymentId(created.id);
      setForm({ ...form, amount: '4500', idempotency_key: '' });
      await loadPayments();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Payment creation failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRefund = async () => {
    if (!selectedPayment) return;
    const confirmed = window.confirm('Process a refund for the selected payment?');
    if (!confirmed) return;
    try {
      await refundPayment(selectedPayment.id, { amount: Math.max(1, selectedPayment.captured_amount - selectedPayment.refunded_amount), idempotency_key: `refund-${Date.now()}` });
      await loadPayments();
    } catch (refundError) {
      setError(refundError instanceof Error ? refundError.message : 'Refund processing failed.');
    }
  };

  const handleCancel = async () => {
    if (!selectedPayment) return;
    const confirmed = window.confirm('Cancel the selected payment?');
    if (!confirmed) return;
    try {
      await cancelPayment(selectedPayment.id);
      await loadPayments();
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : 'Cancel request failed.');
    }
  };

  const remainingRefundable = selectedPayment ? Math.max(0, selectedPayment.captured_amount - selectedPayment.refunded_amount) : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Payments"
        title="Transaction Ledger"
        description="Create, audit, and review payment records with idempotent safeguards and state-aware lifecycle tracking."
      />

      {error && <ErrorState title="Payment request failed" message={error} />}

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.5fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="mb-4 flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-teal-600" />
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-700">Create Payment</h2>
          </div>

          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Amount</label>
              <input
                type="number"
                min="1"
                required
                value={form.amount}
                onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Currency</label>
                <select
                  value={form.currency}
                  onChange={(event) => setForm((current) => ({ ...current, currency: event.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10"
                >
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                  <option value="INR">INR</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Client ID</label>
                <input
                  value={form.client_id}
                  onChange={(event) => setForm((current) => ({ ...current, client_id: event.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Idempotency key</label>
              <input
                value={form.idempotency_key}
                onChange={(event) => setForm((current) => ({ ...current, idempotency_key: event.target.value }))}
                placeholder="Optional; generated automatically if blank"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {submitting ? 'Creating payment…' : 'Create Payment'}
            </button>
          </form>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 text-slate-500" />
              <span className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-700">Payment ledger</span>
            </div>

            <div className="flex items-center gap-3">
              <div className="relative">
                <Filter className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <select
                  value={filterStatus}
                  onChange={(event) => setFilterStatus(event.target.value)}
                  className="rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 py-2 text-sm text-slate-700 outline-none focus:border-teal-500"
                >
                  <option value="all">All statuses</option>
                  <option value="CREATED">Created</option>
                  <option value="AUTHORIZED">Authorized</option>
                  <option value="CAPTURED">Captured</option>
                  <option value="FAILED">Failed</option>
                  <option value="CANCELLED">Cancelled</option>
                  <option value="PARTIALLY_REFUNDED">Partially refunded</option>
                  <option value="REFUNDED">Refunded</option>
                </select>
              </div>
            </div>
          </div>

          {loading ? (
            <LoadingSkeleton rows={5} />
          ) : payments.length ? (
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-50 text-[11px] uppercase tracking-[0.12em] text-slate-500">
                    <tr>
                      <th className="px-3 py-2.5">Payment</th>
                      <th className="px-3 py-2.5">Amount</th>
                      <th className="px-3 py-2.5">Status</th>
                      <th className="px-3 py-2.5">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((payment) => (
                      <tr
                        key={payment.id}
                        className={['cursor-pointer border-t border-slate-200 transition hover:bg-slate-50', selectedPaymentId === payment.id ? 'bg-teal-50/40' : 'bg-white'].join(' ')}
                        onClick={() => setSelectedPaymentId(payment.id)}
                      >
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <span className="max-w-[150px] truncate font-mono text-[11px] text-slate-700">{payment.id}</span>
                            <CopyButton value={payment.id} label="Copy" />
                          </div>
                        </td>
                        <td className="px-3 py-2.5 font-medium text-slate-800">{formatCurrency(payment.amount, payment.currency)}</td>
                        <td className="px-3 py-2.5">
                          <StatusBadge
                            label={payment.status}
                            tone={payment.status === 'FAILED' ? 'danger' : payment.status === 'CAPTURED' || payment.status === 'REFUNDED' ? 'success' : payment.status === 'AUTHORIZED' ? 'info' : 'neutral'}
                          />
                        </td>
                        <td className="px-3 py-2.5 text-slate-500">{new Date(payment.created_at).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">No payments match the current filter.</div>
          )}
        </div>
      </div>

      {selectedPayment && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Selected payment</div>
              <div className="mt-1 flex items-center gap-2">
                <span className="font-mono text-sm text-slate-800">{selectedPayment.id}</span>
                <CopyButton value={selectedPayment.id} label="Copy ID" />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={handleRefund} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:border-slate-300 hover:bg-slate-50">
                <ArrowRightLeft className="h-4 w-4" />
                Refund
              </button>
              <button type="button" onClick={handleCancel} className="inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-100">
                <ShieldCheck className="h-4 w-4" />
                Cancel
              </button>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-[11px] uppercase tracking-[0.12em] text-slate-500">Amount</div>
              <div className="mt-2 text-lg font-semibold text-slate-900">{formatCurrency(selectedPayment.amount, selectedPayment.currency)}</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-[11px] uppercase tracking-[0.12em] text-slate-500">Captured</div>
              <div className="mt-2 text-lg font-semibold text-slate-900">{formatCurrency(selectedPayment.captured_amount, selectedPayment.currency)}</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-[11px] uppercase tracking-[0.12em] text-slate-500">Refunded</div>
              <div className="mt-2 text-lg font-semibold text-slate-900">{formatCurrency(selectedPayment.refunded_amount, selectedPayment.currency)}</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-[11px] uppercase tracking-[0.12em] text-slate-500">Status</div>
              <div className="mt-2"><StatusBadge label={selectedPayment.status} tone={selectedPayment.status === 'FAILED' ? 'danger' : selectedPayment.status === 'CAPTURED' || selectedPayment.status === 'REFUNDED' ? 'success' : 'neutral'} /></div>
            </div>
          </div>

          <div className="mt-5 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
            <div>
              <div className="mb-3 text-sm font-semibold text-slate-800">Audit timeline</div>
              <div className="space-y-3">
                {events.length ? events.map((event) => (
                  <div key={event.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <div className="font-medium text-slate-800">{event.event_type}</div>
                      <div className="text-[11px] text-slate-500">{new Date(event.created_at).toLocaleString()}</div>
                    </div>
                    <div className="mt-2 text-xs text-slate-600">
                      {event.previous_status ? `From ${event.previous_status} ` : ''}→ {event.new_status}
                    </div>
                  </div>
                )) : (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">No audit events available for this payment.</div>
                )}
              </div>
            </div>

            <div>
              <div className="mb-3 text-sm font-semibold text-slate-800">Details</div>
              <div className="space-y-3 text-sm text-slate-700">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="text-[11px] uppercase tracking-[0.12em] text-slate-500">Idempotency key</div>
                  <div className="mt-1 break-all font-mono text-xs text-slate-800">{selectedPayment.idempotency_key}</div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="text-[11px] uppercase tracking-[0.12em] text-slate-500">Remaining refundable</div>
                  <div className="mt-1 font-semibold text-slate-900">{formatCurrency(remainingRefundable, selectedPayment.currency)}</div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="text-[11px] uppercase tracking-[0.12em] text-slate-500">Client</div>
                  <div className="mt-1 text-slate-800">{selectedPayment.client_id ?? 'Unavailable'}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
