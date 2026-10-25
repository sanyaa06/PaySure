import React from 'react';
import { GitFork, Route } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';

export const ProcessorRoutingPage: React.FC = () => {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Upcoming"
        title="Processor Routing"
        description="This phase is not implemented in the current backend or UI scope. The page is intentionally kept as a polished placeholder without fabricated routing metrics."
      />

      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex items-center gap-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-slate-700">
            <Route className="h-5 w-5" />
          </div>
          <div>
            <div className="text-lg font-semibold text-slate-900">Routing engine deferred</div>
            <div className="text-sm text-slate-600">No processor health data or routing controls are presented because this feature is intentionally out of scope for the current build.</div>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
            <div className="text-[11px] uppercase tracking-[0.12em] text-slate-500">Routing mode</div>
            <div className="mt-2 font-medium text-slate-900">Not configured</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
            <div className="text-[11px] uppercase tracking-[0.12em] text-slate-500">Fallback policy</div>
            <div className="mt-2 font-medium text-slate-900">Unavailable</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
            <div className="text-[11px] uppercase tracking-[0.12em] text-slate-500">Processor health</div>
            <div className="mt-2 font-medium text-slate-900">Unavailable</div>
          </div>
        </div>
      </div>
    </div>
  );
};
