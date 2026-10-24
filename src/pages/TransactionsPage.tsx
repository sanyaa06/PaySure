import React from 'react';
import { Receipt, Search, Filter } from 'lucide-react';
import { EmptyState } from '../components/EmptyState';

export const TransactionsPage: React.FC = () => {
  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header controls bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-white border border-slate-200 rounded-lg shadow-xs">
        <div className="flex items-center gap-2 flex-1 max-w-md">
          <div className="relative w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              disabled
              placeholder="Search by Payment ID or Idempotency Key..."
              className="w-full pl-9 pr-4 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded text-slate-400 cursor-not-allowed"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            disabled
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-400 bg-slate-50 border border-slate-200 rounded cursor-not-allowed"
          >
            <Filter className="w-3.5 h-3.5" />
            <span>Filter by Status</span>
          </button>
        </div>
      </div>

      {/* Honest Empty State for Phase 1 */}
      <EmptyState
        icon={Receipt}
        title="No Transactions Recorded"
        description="The transaction ledger is empty. Payment authorization, settlement capture, and audit event streaming will be implemented in Phase 2."
        phaseNotice="Phase 2: Core Payment Operations (Pending Approval)"
        details={[
          { label: "Core Endpoints", value: "POST /api/v1/payments/authorize, /capture, /refund" },
          { label: "Precision", value: "Integer minor units (e.g. cents) with zero float drift" },
          { label: "Audit Ledger", value: "Append-only payment_events recording all mutations" },
          { label: "State Transitions", value: "Validated against mathematical FSM table" }
        ]}
      />
    </div>
  );
};
