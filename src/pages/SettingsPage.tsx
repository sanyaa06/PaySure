import React, { useState } from 'react';
import { Check, Database, FolderCog, KeyRound, Server, ShieldCheck } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { getApiBaseUrl, setApiBaseUrl } from '../services/api';
import { HealthCheckResult, ReadinessCheckResult } from '../types';

interface SettingsPageProps {
  onRefreshProbes: () => void;
  health: HealthCheckResult;
  readiness: ReadinessCheckResult;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({ onRefreshProbes, health, readiness }) => {
  const [apiUrl, setApiUrl] = useState(getApiBaseUrl());
  const [saved, setSaved] = useState(false);

  const handleSave = (event: React.FormEvent) => {
    event.preventDefault();
    setApiBaseUrl(apiUrl);
    setSaved(true);
    onRefreshProbes();
    window.setTimeout(() => setSaved(false), 2200);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Configuration"
        title="System Configuration"
        description="Read-only operational settings and the current live backend target used by the frontend."
      />

      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="mb-4 flex items-center gap-2">
            <Server className="h-4 w-4 text-teal-600" />
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">Backend connectivity</div>
          </div>

          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Backend base URL</label>
              <input
                value={apiUrl}
                onChange={(event) => setApiUrl(event.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-mono text-slate-800 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10"
              />
            </div>

            <button type="submit" className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800">
              {saved ? <Check className="h-4 w-4 text-teal-300" /> : <Server className="h-4 w-4" />}
              {saved ? 'Saved & refreshed' : 'Save endpoint'}
            </button>
          </form>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="mb-4 flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-teal-600" />
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">Read-only environment summary</div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-[11px] uppercase tracking-[0.12em] text-slate-500">Environment</div>
              <div className="mt-2 text-sm font-medium text-slate-900">{health.environment ?? 'development'}</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-[11px] uppercase tracking-[0.12em] text-slate-500">API version</div>
              <div className="mt-2 text-sm font-medium text-slate-900">{health.version ?? 'Unavailable'}</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-[11px] uppercase tracking-[0.12em] text-slate-500">Backend status</div>
              <div className="mt-2 text-sm font-medium text-slate-900">{health.status}</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-[11px] uppercase tracking-[0.12em] text-slate-500">Database status</div>
              <div className="mt-2 text-sm font-medium text-slate-900">{readiness.status}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="mb-4 flex items-center gap-2">
            <Database className="h-4 w-4 text-teal-600" />
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">Database</div>
          </div>
          <div className="space-y-2 text-sm text-slate-600">
            <div>Engine: PostgreSQL 16</div>
            <div>Pool: configured by backend runtime</div>
            <div>Read-only view: enabled</div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="mb-4 flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-teal-600" />
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">Idempotency</div>
          </div>
          <div className="space-y-2 text-sm text-slate-600">
            <div>Unique idempotency key required</div>
            <div>Duplicate payload checks enabled</div>
            <div>Request hash verified on create</div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="mb-4 flex items-center gap-2">
            <FolderCog className="h-4 w-4 text-teal-600" />
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">Monitoring</div>
          </div>
          <div className="space-y-2 text-sm text-slate-600">
            <div>Latency metrics: available</div>
            <div>Alert summaries: available</div>
            <div>Read-only configuration only</div>
          </div>
        </div>
      </div>
    </div>
  );
};
