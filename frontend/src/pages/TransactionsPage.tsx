import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Filter, Receipt, Search, CircleDollarSign, RefreshCcw, ShieldCheck, ArrowRightLeft } from 'lucide-react';
import { PaymentEventRecord, PaymentRecord, PaymentStatus } from '../types';
import {
  authorizePayment,
  cancelPayment,
  capturePayment,
  createPayment,
  getPayment,
  getPaymentEvents,
  listPayments,
  refundPayment,
} from '../services/api';

const PAYMENT_STATUSES: Array<'ALL' | PaymentStatus> = [
  'ALL',
  'CREATED',
  'AUTHORIZED',
  'CAPTURED',
  'FAILED',
  'CANCELLED',
  'PARTIALLY_REFUNDED',
  'REFUNDED',
];

const STATUS_STYLES: Record<PaymentStatus, string> = {
  CREATED: 'bg-slate-100 text-slate-700 ring-slate-200',
  AUTHORIZED: 'bg-amber-100 text-amber-700 ring-amber-200',
  CAPTURED: 'bg-blue-100 text-blue-700 ring-blue-200',
  FAILED: 'bg-rose-100 text-rose-700 ring-rose-200',
  CANCELLED: 'bg-zinc-200 text-zinc-700 ring-zinc-300',
  PARTIALLY_REFUNDED: 'bg-violet-100 text-violet-700 ring-violet-200',
  REFUNDED: 'bg-emerald-100 text-emerald-700 ring-emerald-200',
};

const formatMinorAmount = (amount: number, currency: string): string => {
  try {
    const numericAmount = Number(amount) / 100;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(numericAmount);
  } catch {
    return `${amount} ${currency}`;
  }
};

const formatDateTime = (value?: string | null): string => {
  if (!value) {
    return '—';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
};

const generateIdempotencyKey = (): string => {
  return `txn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
};

export const TransactionsPage: React.FC = () => {
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [selectedStatus, setSelectedStatus] = useState<'ALL' | PaymentStatus>('ALL');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [selectedPaymentId, setSelectedPaymentId] = useState<string | null>(null);
  const [selectedPayment, setSelectedPayment] = useState<PaymentRecord | null>(null);
  const [paymentEvents, setPaymentEvents] = useState<PaymentEventRecord[]>([]);
  const [eventLoading, setEventLoading] = useState(false);
  const [createForm, setCreateForm] = useState({
    amount: '1000',
    currency: 'USD',
    idempotencyKey: generateIdempotencyKey(),
    clientId: 'paysure-frontend',
  });

  const loadPayments = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await listPayments({
        status: selectedStatus === 'ALL' ? undefined : selectedStatus,
        limit: pageSize,
        offset: page * pageSize,
      });

      setPayments(response.items);
      setTotal(response.total);

      if (!response.items.length) {
        setSelectedPaymentId(null);
        setSelectedPayment(null);
        setPaymentEvents([]);
        return;
      }

      const nextSelection = selectedPaymentId && response.items.some((payment) => payment.id === selectedPaymentId)
        ? selectedPaymentId
        : response.items[0].id;

      setSelectedPaymentId(nextSelection);
      await loadPaymentDetail(nextSelection);
    } catch (loadError: any) {
      setError(loadError.message || 'Unable to load payments.');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, selectedPaymentId, selectedStatus]);

  const loadPaymentDetail = useCallback(async (paymentId: string) => {
    setEventLoading(true);
    try {
      const [payment, events] = await Promise.all([
        getPayment(paymentId),
        getPaymentEvents(paymentId),
      ]);
      setSelectedPayment(payment);
      setPaymentEvents(events);
    } catch (detailError: any) {
      setError(detailError.message || 'Unable to load payment details.');
    } finally {
      setEventLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPayments();
  }, [page, pageSize, selectedStatus]);

  const pageCount = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [pageSize, total]);

  const handleCreatePayment = async (event: React.FormEvent) => {
    event.preventDefault();
    setCreating(true);
    setError(null);
    setSuccess(null);

    try {
      const amount = Number(createForm.amount);
      if (!Number.isInteger(amount) || amount <= 0) {
        throw new Error('Amount must be a positive integer value in minor units.');
      }

      const payment = await createPayment({
        amount,
        currency: createForm.currency,
        idempotency_key: createForm.idempotencyKey.trim() || generateIdempotencyKey(),
        client_id: createForm.clientId.trim() || 'paysure-frontend',
      });

      setSuccess(`Payment ${payment.id} created successfully.`);
      setSelectedStatus('ALL');
      setPage(0);
      setSelectedPaymentId(payment.id);
      await loadPaymentDetail(payment.id);
      await loadPayments();
    } catch (createError: any) {
      setError(createError.message || 'Payment creation failed.');
    } finally {
      setCreating(false);
    }
  };

  const handleMutation = async (action: 'authorize' | 'capture' | 'cancel' | 'refund-full' | 'refund-partial', payment: PaymentRecord) => {
    setPendingAction(`${action}:${payment.id}`);
    setError(null);
    setSuccess(null);

    try {
      if (action === 'authorize') {
        await authorizePayment(payment.id, { processor_outcome: 'APPROVED' });
        setSuccess(`Payment ${payment.id} was authorized.`);
      }

      if (action === 'capture') {
        await capturePayment(payment.id);
        setSuccess(`Payment ${payment.id} was captured.`);
      }

      if (action === 'cancel') {
        await cancelPayment(payment.id);
        setSuccess(`Payment ${payment.id} was cancelled.`);
      }

      if (action === 'refund-full') {
        const remaining = payment.captured_amount - payment.refunded_amount;
        if (remaining <= 0) {
          throw new Error('This payment has no refundable balance remaining.');
        }
        await refundPayment(payment.id, { amount: remaining });
        setSuccess(`Payment ${payment.id} was fully refunded.`);
      }

      if (action === 'refund-partial') {
        const remaining = payment.captured_amount - payment.refunded_amount;
        if (remaining <= 0) {
          throw new Error('This payment has no refundable balance remaining.');
        }

        const rawAmount = window.prompt(
          `Enter partial refund amount in minor units (max ${remaining}):`,
          String(Math.min(remaining, 100)),
        );

        if (rawAmount === null) {
          return;
        }

        const refundAmount = Number(rawAmount);
        if (!Number.isInteger(refundAmount) || refundAmount <= 0 || refundAmount > remaining) {
          throw new Error(`Refund amount must be between 1 and ${remaining}.`);
        }

        await refundPayment(payment.id, { amount: refundAmount });
        setSuccess(`Partial refund of ${refundAmount} minor units was processed.`);
      }

      await loadPayments();
      if (selectedPaymentId) {
        await loadPaymentDetail(selectedPaymentId);
      }
    } catch (mutationError: any) {
      setError(mutationError.message || 'Payment action failed.');
    } finally {
      setPendingAction(null);
    }
  };

  const availableActions = (payment: PaymentRecord): Array<{ key: 'authorize' | 'capture' | 'cancel' | 'refund-full' | 'refund-partial'; label: string }> => {
    const actions: Array<{ key: 'authorize' | 'capture' | 'cancel' | 'refund-full' | 'refund-partial'; label: string }> = [];

    if (payment.status === 'CREATED') {
      actions.push({ key: 'authorize', label: 'Authorize' });
    }

    if (payment.status === 'AUTHORIZED') {
      actions.push({ key: 'capture', label: 'Capture' });
      actions.push({ key: 'cancel', label: 'Cancel' });
    }

    if (payment.status === 'CAPTURED' || payment.status === 'PARTIALLY_REFUNDED') {
      const remaining = payment.captured_amount - payment.refunded_amount;
      if (remaining > 0) {
        actions.push({ key: 'refund-full', label: 'Refund full' });
        actions.push({ key: 'refund-partial', label: 'Refund partial' });
      }
    }

    return actions;
  };

  return (
    <div className="space-y-6 max-w-7xl">
      <form onSubmit={handleCreatePayment} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end">
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium uppercase tracking-[0.12em] text-slate-500">Amount</label>
            <input
              type="number"
              min={1}
              step={1}
              value={createForm.amount}
              onChange={(event) => setCreateForm((current) => ({ ...current, amount: event.target.value }))}
              className="w-full rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none ring-0 transition focus:border-sky-400 focus:bg-white"
              placeholder="1000"
            />
          </div>

          <div className="w-full xl:max-w-[180px]">
            <label className="mb-1 block text-xs font-medium uppercase tracking-[0.12em] text-slate-500">Currency</label>
            <select
              value={createForm.currency}
              onChange={(event) => setCreateForm((current) => ({ ...current, currency: event.target.value }))}
              className="w-full rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:bg-white"
            >
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="INR">INR</option>
            </select>
          </div>

          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium uppercase tracking-[0.12em] text-slate-500">Idempotency key</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={createForm.idempotencyKey}
                onChange={(event) => setCreateForm((current) => ({ ...current, idempotencyKey: event.target.value }))}
                className="w-full rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:bg-white"
                placeholder="txn-1234"
              />
              <button
                type="button"
                onClick={() => setCreateForm((current) => ({ ...current, idempotencyKey: generateIdempotencyKey() }))}
                className="rounded border border-slate-200 bg-slate-100 px-3 py-2 text-xs font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-200"
              >
                Generate
              </button>
            </div>
          </div>

          <div className="w-full xl:max-w-[220px]">
            <label className="mb-1 block text-xs font-medium uppercase tracking-[0.12em] text-slate-500">Client ID</label>
            <input
              type="text"
              value={createForm.clientId}
              onChange={(event) => setCreateForm((current) => ({ ...current, clientId: event.target.value }))}
              className="w-full rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:bg-white"
              placeholder="paysure-frontend"
            />
          </div>

          <button
            type="submit"
            disabled={creating}
            className="inline-flex items-center justify-center rounded bg-sky-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:bg-sky-400"
          >
            {creating ? 'Creating...' : 'Create payment'}
          </button>
        </div>
      </form>

      {error && (
        <div className="rounded border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {success}
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-slate-700">
            <Receipt className="h-4 w-4 text-sky-600" />
            <span className="text-sm font-semibold">Payment ledger</span>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <div className="pointer-events-none rounded border border-slate-200 bg-slate-50 px-3 py-2 pl-9 text-xs text-slate-500">
                Live filter
              </div>
            </div>

            <div className="flex items-center gap-2 rounded border border-slate-200 bg-slate-50 px-2 py-2 text-xs text-slate-600">
              <Filter className="h-3.5 w-3.5 text-slate-500" />
              <select
                value={selectedStatus}
                onChange={(event) => {
                  setSelectedStatus(event.target.value as 'ALL' | PaymentStatus);
                  setPage(0);
                }}
                className="bg-transparent text-sm text-slate-700 outline-none"
              >
                {PAYMENT_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status === 'ALL' ? 'All statuses' : status}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="rounded border border-slate-200 bg-slate-50 px-4 py-8 text-sm text-slate-500">
            Loading transaction data...
          </div>
        ) : payments.length === 0 ? (
          <div className="rounded border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
            No payments found for the selected status.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                  <th className="px-3 py-3 font-medium">Payment ID</th>
                  <th className="px-3 py-3 font-medium">Amount</th>
                  <th className="px-3 py-3 font-medium">Status</th>
                  <th className="px-3 py-3 font-medium">Created</th>
                  <th className="px-3 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => (
                  <tr
                    key={payment.id}
                    className={`cursor-pointer border-b border-slate-100 transition hover:bg-slate-50 ${selectedPaymentId === payment.id ? 'bg-sky-50/60' : ''}`}
                    onClick={() => {
                      setSelectedPaymentId(payment.id);
                      void loadPaymentDetail(payment.id);
                    }}
                  >
                    <td className="px-3 py-3 font-mono text-xs text-slate-700">{payment.id}</td>
                    <td className="px-3 py-3">
                      <div className="font-medium text-slate-800">{formatMinorAmount(payment.amount, payment.currency)}</div>
                      <div className="text-[11px] text-slate-500">{payment.currency}</div>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ${STATUS_STYLES[payment.status]}`}>
                        {payment.status}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-slate-600">{formatDateTime(payment.created_at)}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-2">
                        {availableActions(payment).map((action) => (
                          <button
                            key={`${payment.id}-${action.key}`}
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              void handleMutation(action.key, payment);
                            }}
                            disabled={pendingAction === `${action.key}:${payment.id}`}
                            className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-700 transition hover:border-sky-300 hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {pendingAction === `${action.key}:${payment.id}` ? 'Working...' : action.label}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && payments.length > 0 && (
          <div className="mt-4 flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs text-slate-500">
              Showing {Math.min(page * pageSize + 1, total)}-{Math.min((page + 1) * pageSize, total)} of {total}
            </div>
            <div className="flex items-center gap-2">
              <select
                value={pageSize}
                onChange={(event) => {
                  setPageSize(Number(event.target.value));
                  setPage(0);
                }}
                className="rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-700"
              >
                <option value={5}>5/page</option>
                <option value={10}>10/page</option>
                <option value={20}>20/page</option>
              </select>
              <button
                type="button"
                onClick={() => setPage((current) => Math.max(0, current - 1))}
                disabled={page === 0}
                className="rounded border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Prev
              </button>
              <button
                type="button"
                onClick={() => setPage((current) => Math.min(current + 1, pageCount - 1))}
                disabled={page >= pageCount - 1}
                className="rounded border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex items-center gap-2 text-slate-700">
          <CircleDollarSign className="h-4 w-4 text-sky-600" />
          <span className="text-sm font-semibold">Payment details</span>
        </div>

        {!selectedPayment ? (
          <div className="rounded border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-sm text-slate-500">
            Select a payment to view its details and event history.
          </div>
        ) : (
          <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                <div className="rounded border border-slate-200 bg-slate-50 p-3">
                  <div className="text-[11px] uppercase tracking-[0.12em] text-slate-500">ID</div>
                  <div className="mt-1 break-all font-mono text-xs text-slate-700">{selectedPayment.id}</div>
                </div>
                <div className="rounded border border-slate-200 bg-slate-50 p-3">
                  <div className="text-[11px] uppercase tracking-[0.12em] text-slate-500">Amount</div>
                  <div className="mt-1 text-sm font-semibold text-slate-800">{formatMinorAmount(selectedPayment.amount, selectedPayment.currency)}</div>
                </div>
                <div className="rounded border border-slate-200 bg-slate-50 p-3">
                  <div className="text-[11px] uppercase tracking-[0.12em] text-slate-500">Status</div>
                  <div className="mt-1">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ${STATUS_STYLES[selectedPayment.status]}`}>
                      {selectedPayment.status}
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded border border-slate-200 bg-slate-50 p-3">
                  <div className="text-[11px] uppercase tracking-[0.12em] text-slate-500">Captured</div>
                  <div className="mt-1 font-medium text-slate-800">{formatMinorAmount(selectedPayment.captured_amount, selectedPayment.currency)}</div>
                </div>
                <div className="rounded border border-slate-200 bg-slate-50 p-3">
                  <div className="text-[11px] uppercase tracking-[0.12em] text-slate-500">Refunded</div>
                  <div className="mt-1 font-medium text-slate-800">{formatMinorAmount(selectedPayment.refunded_amount, selectedPayment.currency)}</div>
                </div>
                <div className="rounded border border-slate-200 bg-slate-50 p-3">
                  <div className="text-[11px] uppercase tracking-[0.12em] text-slate-500">Remaining refundable</div>
                  <div className="mt-1 font-medium text-slate-800">
                    {formatMinorAmount(Math.max(selectedPayment.captured_amount - selectedPayment.refunded_amount, 0), selectedPayment.currency)}
                  </div>
                </div>
                <div className="rounded border border-slate-200 bg-slate-50 p-3">
                  <div className="text-[11px] uppercase tracking-[0.12em] text-slate-500">Idempotency key</div>
                  <div className="mt-1 break-all text-xs text-slate-700">{selectedPayment.idempotency_key}</div>
                </div>
              </div>

              <div className="rounded border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                <div className="mb-1 text-[11px] uppercase tracking-[0.12em] text-slate-500">Metadata</div>
                <div className="flex flex-col gap-1">
                  <div><span className="font-medium">Client ID:</span> {selectedPayment.client_id || '—'}</div>
                  <div><span className="font-medium">Created:</span> {formatDateTime(selectedPayment.created_at)}</div>
                  <div><span className="font-medium">Updated:</span> {formatDateTime(selectedPayment.updated_at)}</div>
                  <div><span className="font-medium">Request hash:</span> {selectedPayment.request_hash || '—'}</div>
                </div>
              </div>
            </div>

            <div>
              <div className="mb-3 flex items-center gap-2 text-slate-700">
                <RefreshCcw className="h-4 w-4 text-sky-600" />
                <span className="text-sm font-semibold">Audit trail</span>
              </div>

              {eventLoading ? (
                <div className="rounded border border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-500">
                  Loading audit events...
                </div>
              ) : paymentEvents.length === 0 ? (
                <div className="rounded border border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-500">
                  No audit events recorded for this payment.
                </div>
              ) : (
                <div className="max-h-[430px] space-y-3 overflow-y-auto pr-1">
                  {paymentEvents.map((event) => (
                    <div key={event.id} className="rounded border border-slate-200 bg-slate-50 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-semibold text-slate-800">{event.event_type}</span>
                        <span className="text-[10px] uppercase tracking-[0.12em] text-slate-500">{formatDateTime(event.created_at)}</span>
                      </div>

                      <div className="mt-2 text-[11px] text-slate-600">
                        {event.previous_status ? (
                          <div>{event.previous_status} → {event.new_status}</div>
                        ) : (
                          <div>{event.new_status}</div>
                        )}
                      </div>

                      {event.event_metadata && Object.keys(event.event_metadata).length > 0 && (
                        <pre className="mt-2 overflow-x-auto rounded bg-white p-2 text-[10px] leading-5 text-slate-700">
                          {JSON.stringify(event.event_metadata, null, 2)}
                        </pre>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
