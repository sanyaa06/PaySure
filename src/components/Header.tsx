import React from 'react';
import { NavigationTab, HealthCheckResult, ReadinessCheckResult } from '../types';
import { RefreshCw, Server, Database, Menu } from 'lucide-react';

interface HeaderProps {
  currentTab: NavigationTab;
  health: HealthCheckResult;
  readiness: ReadinessCheckResult;
  isChecking: boolean;
  onRefreshProbes: () => void;
  onToggleSidebar: () => void;
}

const TAB_TITLES: Record<NavigationTab, { title: string }> = {
  overview: { title: 'Platform Overview' },
  transactions: { title: 'Transaction Ledger' },
  'chaos-lab': { title: 'Chaos Engineering Lab' },
  monitoring: { title: 'Monitoring & Metrics' },
  'processor-routing': { title: 'Processor Routing' },
  settings: { title: 'System Configuration' },
};

const formatLastChecked = (value?: string) => {
  if (!value) return 'Checking…';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Checking…' : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

export const Header: React.FC<HeaderProps> = ({ currentTab, health, readiness, isChecking, onRefreshProbes, onToggleSidebar }) => {
  const meta = TAB_TITLES[currentTab];
  const backendLabel = health.status === 'healthy' ? 'Healthy' : health.status === 'unreachable' ? 'Offline' : 'Unhealthy';
  const databaseLabel = readiness.status === 'ready' ? 'Ready' : readiness.status === 'unreachable' ? 'Offline' : 'Unready';

  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-slate-200 bg-white/90 px-4 backdrop-blur-sm md:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          aria-label="Toggle navigation"
          onClick={onToggleSidebar}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-700 transition hover:border-slate-300 hover:bg-slate-100 lg:hidden"
        >
          <Menu className="h-4 w-4" />
        </button>

        <div className="min-w-0">
          <div className="truncate text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">PaySure / {meta.title}</div>
          <div className="text-base font-semibold tracking-tight text-slate-900">{meta.title}</div>
        </div>
      </div>

      <div className="flex items-center gap-3 overflow-hidden">
        <div className="hidden items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] text-slate-600 md:flex">
          <Server className="h-3.5 w-3.5 text-slate-500" />
          <span>Backend</span>
          <span className={health.status === 'healthy' ? 'font-semibold text-teal-700' : 'font-semibold text-amber-700'}>{backendLabel}</span>
        </div>

        <div className="hidden items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] text-slate-600 md:flex">
          <Database className="h-3.5 w-3.5 text-slate-500" />
          <span>DB</span>
          <span className={readiness.status === 'ready' ? 'font-semibold text-teal-700' : 'font-semibold text-amber-700'}>{databaseLabel}</span>
        </div>

        <div className="hidden text-[11px] text-slate-500 xl:block">Last checked: {formatLastChecked(health.timestamp || readiness.timestamp)}</div>

        <button
          type="button"
          onClick={onRefreshProbes}
          disabled={isChecking}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw className={['h-3.5 w-3.5', isChecking ? 'animate-spin text-teal-600' : 'text-slate-500'].join(' ')} />
          <span>{isChecking ? 'Checking…' : 'Check Probes'}</span>
        </button>
      </div>
    </header>
  );
};
