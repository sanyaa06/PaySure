import React from 'react';
import { NavigationTab, HealthCheckResult, ReadinessCheckResult } from '../types';
import { RefreshCw, Server, Database } from 'lucide-react';

interface HeaderProps {
  currentTab: NavigationTab;
  health: HealthCheckResult;
  readiness: ReadinessCheckResult;
  isChecking: boolean;
  onRefreshProbes: () => void;
}

const TAB_TITLES: Record<NavigationTab, { title: string; subtitle: string }> = {
  overview: {
    title: 'Platform Overview',
    subtitle: 'Operational health, platform summary, and executive dashboards',
  },
  transactions: {
    title: 'Transaction Ledger',
    subtitle: 'Payment lifecycle, audit history, and ledger operations',
  },
  'chaos-lab': {
    title: 'Chaos Engineering Lab',
    subtitle: 'Fault injection and integrity verification across user flows',
  },
  monitoring: {
    title: 'Observability & Metrics',
    subtitle: 'Real-time reliability metrics, latency, and threshold alerts',
  },
  'processor-routing': {
    title: 'Processor Routing',
    subtitle: 'Upcoming Phase 7 capability: routing and failover orchestration',
  },
  settings: {
    title: 'System Configuration',
    subtitle: 'Runtime settings, API endpoints, and operational controls',
  },
};

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  health,
  readiness,
  isChecking,
  onRefreshProbes,
}) => {
  const meta = TAB_TITLES[currentTab];

  return (
    <header className="h-16 px-8 bg-white border-b border-slate-200 flex items-center justify-between shrink-0">
      <div className="flex items-center gap-3">
        <div className="text-sm text-slate-500 font-medium">
          <span>PaySure</span>
          <span className="mx-2 text-slate-300">/</span>
          <span className="text-slate-900 font-semibold">{meta.title}</span>
        </div>
      </div>

      <div className="flex items-center gap-4 text-xs">
        <div className="flex items-center gap-2 text-slate-600">
          <Server className="w-3.5 h-3.5 text-slate-400" />
          <span>Backend:</span>
          <span className={`font-medium ${
            health.status === 'healthy'
              ? 'text-teal-700 font-semibold'
              : health.status === 'unreachable'
                ? 'text-slate-500'
                : 'text-amber-700'
          }`}>
            {health.status === 'healthy' ? 'Healthy (200 OK)' : health.status === 'unreachable' ? 'Disconnected (Local)' : 'Unhealthy'}
          </span>
        </div>

        <span className="text-slate-300" aria-hidden="true">·</span>

        <div className="flex items-center gap-2 text-slate-600">
          <Database className="w-3.5 h-3.5 text-slate-400" />
          <span>PostgreSQL:</span>
          <span className={`font-medium ${
            readiness.status === 'ready'
              ? 'text-teal-700 font-semibold'
              : readiness.status === 'unreachable'
                ? 'text-slate-500'
                : 'text-amber-700'
          }`}>
            {readiness.status === 'ready' ? 'Connected (Ready)' : readiness.status === 'unreachable' ? 'Offline' : 'Unready'}
          </span>
        </div>

        <button
          type="button"
          onClick={onRefreshProbes}
          disabled={isChecking}
          title="Query /health and /ready backend probes"
          className="ml-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-teal-500/70"
        >
          <RefreshCw className={`w-3 h-3 ${isChecking ? 'animate-spin text-teal-600' : ''}`} />
          <span>{isChecking ? 'Checking...' : 'Check Probes'}</span>
        </button>
      </div>
    </header>
  );
};
