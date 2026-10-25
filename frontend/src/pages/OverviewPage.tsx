import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Database,
  GitBranch,
  Server,
  ShieldAlert,
  ArrowRight,
  TrendingUp,
  Activity,
  Gauge,
  Layers,
} from 'lucide-react';
import {
  HealthCheckResult,
  MonitoringDashboardData,
  PaymentStatus,
  ReadinessCheckResult,
} from '../types';
import { getApiBaseUrl, getMonitoringDashboard, setApiBaseUrl } from '../services/api';

interface OverviewPageProps {
  health: HealthCheckResult;
  readiness: ReadinessCheckResult;
  isChecking: boolean;
  onRefreshProbes: () => void;
}

const formatNumber = (value: number | null | undefined): string => {
  if (value === null || value === undefined) return '0';
  return new Intl.NumberFormat().format(value);
};

const formatPercent = (value: number | null | undefined): string => {
  if (value === null || value === undefined) return 'N/A';
  return `${value.toFixed(1)}%`;
};

export const OverviewPage: React.FC<OverviewPageProps> = ({
  health,
  readiness,
  isChecking,
  onRefreshProbes,
}) => {
  const [activeState, setActiveState] = useState<PaymentStatus>('CREATED');
  const [apiUrlInput, setApiUrlInput] = useState(getApiBaseUrl());
  const [dashboard, setDashboard] = useState<MonitoringDashboardData | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  useEffect(() => {
    const loadDashboard = async () => {
      setLoadingSummary(true);
      try {
        const nextDashboard = await getMonitoringDashboard();
        setDashboard(nextDashboard);
        setSummaryError(null);
      } catch (error) {
        setSummaryError(error instanceof Error ? error.message : 'Unable to load monitoring summary.');
      } finally {
        setLoadingSummary(false);
      }
    };

    void loadDashboard();
    const timer = window.setInterval(() => {
      void loadDashboard();
    }, 15000);

    return () => window.clearInterval(timer);
  }, []);

  const summary = dashboard?.summary;
  const reliability = dashboard?.reliability;
  const latency = dashboard?.latency;

  const stateDefinitions: Record<PaymentStatus, {
    description: string;
    isTerminal: boolean;
    validNextStates: PaymentStatus[];
    trigger: string;
  }> = {
    CREATED: {
      description: 'Transaction initialized with client idempotency key and amount in minor units. Awaiting gateway authorization.',
      isTerminal: false,
      validNextStates: ['AUTHORIZED', 'FAILED', 'CANCELLED'],
      trigger: 'Client POST /api/v1/payments/authorize',
    },
    AUTHORIZED: {
      description: 'Funds successfully held on customer credit/debit facility. Funds not yet settled to merchant account.',
      isTerminal: false,
      validNextStates: ['CAPTURED', 'CANCELLED', 'FAILED'],
      trigger: 'Processor returns authorization approval code',
    },
    CAPTURED: {
      description: 'Transaction settled and cleared. Funds transferred to merchant balance. Eligible for refunds.',
      isTerminal: false,
      validNextStates: ['PARTIALLY_REFUNDED', 'REFUNDED'],
      trigger: 'Merchant submits capture request',
    },
    PARTIALLY_REFUNDED: {
      description: 'A portion of settled funds has been returned to customer. Cumulative refund is strictly less than captured amount.',
      isTerminal: false,
      validNextStates: ['PARTIALLY_REFUNDED', 'REFUNDED'],
      trigger: 'Partial refund issued where cumulative < captured',
    },
    REFUNDED: {
      description: 'Full settled amount has been returned to cardholder. No further mutations permitted.',
      isTerminal: true,
      validNextStates: [],
      trigger: 'Final refund where cumulative == captured',
    },
    CANCELLED: {
      description: 'Authorization voided or transaction explicitly cancelled prior to settlement batch. Terminal state.',
      isTerminal: true,
      validNextStates: [],
      trigger: 'Pre-capture void or merchant cancellation',
    },
    FAILED: {
      description: 'Transaction rejected by issuing bank, risk engine, or card network (e.g. insufficient funds, stolen card). Terminal state.',
      isTerminal: true,
      validNextStates: [],
      trigger: 'Terminal processor decline code',
    },
  };

  const handleUpdateApiUrl = (e: React.FormEvent) => {
    e.preventDefault();
    setApiBaseUrl(apiUrlInput);
    onRefreshProbes();
  };

  const keyMetrics = useMemo(
    () => [
      {
        label: 'Total payments',
        value: formatNumber(summary?.total_payments),
        detail: 'Payment records tracked in the system',
        icon: Layers,
      },
      {
        label: 'Captured',
        value: formatNumber(summary?.total_captured_payments),
        detail: 'Settled and cleared transactions',
        icon: TrendingUp,
      },
      {
        label: 'Refunded',
        value: formatNumber(summary?.total_refunded_payments),
        detail: 'Full or partial settlement reversals',
        icon: ShieldAlert,
      },
      {
        label: 'P95 latency',
        value: latency?.p95_ms ? `${Math.round(latency.p95_ms)}ms` : 'N/A',
        detail: 'Gateway latency for recent executions',
        icon: Gauge,
      },
    ],
    [latency, summary],
  );

  return (
    <div className="space-y-8 max-w-6xl">
      <div className="p-6 bg-white border border-slate-200 rounded-lg shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-teal-700 mb-1">
              <span>Phase 6 • Frontend Integration</span>
              <span className="text-slate-300" aria-hidden="true">·</span>
              <span>Live operations</span>
            </div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              PaySure Payment Reliability &amp; Monitoring Platform
            </h1>
            <p className="text-sm text-slate-600 mt-1 max-w-2xl leading-relaxed">
              Real platform health, payment lifecycle integrity, and observability metrics are surfaced directly from the live API stack.
            </p>
          </div>

          <div className="shrink-0 p-3 bg-slate-50 border border-slate-200 rounded text-xs space-y-1">
            <div className="text-slate-500 font-medium">Operational posture:</div>
            <div className="font-semibold text-slate-800 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-teal-600" />
              <span>{health.status === 'healthy' ? 'Platform healthy' : health.status === 'unreachable' ? 'Offline locally' : 'Monitoring degraded'}</span>
            </div>
            <div className="text-slate-400 text-[11px]">All payments and gateways are simulated within a controlled test environment.</div>
          </div>
        </div>

        <div className="pt-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
          <div>
            <span className="text-slate-400 block">Backend Framework</span>
            <span className="font-semibold text-slate-800">Python 3.12 / FastAPI</span>
          </div>
          <div>
            <span className="text-slate-400 block">ORM &amp; Migrations</span>
            <span className="font-semibold text-slate-800">SQLAlchemy 2.x / Alembic</span>
          </div>
          <div>
            <span className="text-slate-400 block">Database Storage</span>
            <span className="font-semibold text-slate-800">PostgreSQL 16 (ACID)</span>
          </div>
          <div>
            <span className="text-slate-400 block">Monitoring</span>
            <span className="font-semibold text-slate-800">Prometheus / Grafana</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {keyMetrics.map(({ label, value, detail, icon: Icon }) => (
          <div key={label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>{label}</span>
              <Icon className="h-4 w-4 text-teal-600" />
            </div>
            <div className="mt-3 text-2xl font-semibold text-slate-900">{value}</div>
            <div className="mt-1 text-xs text-slate-500">{detail}</div>
          </div>
        ))}
      </div>

      {summaryError && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Monitoring summary unavailable: {summaryError}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="p-6 bg-white border border-slate-200 rounded-lg shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Server className="w-4 h-4 text-teal-600" />
                <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                  Live Service Diagnostics
                </h2>
              </div>
              <button
                onClick={onRefreshProbes}
                disabled={isChecking}
                className="text-xs text-teal-700 hover:text-teal-800 font-medium disabled:opacity-50"
              >
                {isChecking ? 'Pinging...' : 'Re-test Now'}
              </button>
            </div>

            <div className="space-y-3 mb-4 text-xs">
              <div className="p-3 bg-slate-50 rounded border border-slate-100 flex items-center justify-between">
                <div>
                  <span className="font-medium text-slate-800 block">Liveness Probe (/health)</span>
                  <span className="text-slate-500 font-mono text-[11px]">
                    {health.status === 'healthy'
                      ? `v${health.version || '1.0.0'} · env: ${health.environment || 'development'}`
                      : health.error || 'Server unreachable at target URL'}
                  </span>
                </div>
                <div className="text-right">
                  <span className={`inline-block font-semibold ${health.status === 'healthy' ? 'text-teal-700' : 'text-slate-500'}`}>
                    {health.status === 'healthy' ? '200 OK' : 'Offline'}
                  </span>
                  {health.latencyMs !== undefined && (
                    <span className="block text-[10px] text-slate-400 font-mono tabular-nums">{health.latencyMs}ms</span>
                  )}
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded border border-slate-100 flex items-center justify-between">
                <div>
                  <span className="font-medium text-slate-800 block">Readiness Probe (/ready)</span>
                  <span className="text-slate-500 font-mono text-[11px]">
                    {readiness.status === 'ready' ? `PostgreSQL: ${readiness.database}` : readiness.error || 'Database ping failed'}
                  </span>
                </div>
                <div className="text-right">
                  <span className={`inline-block font-semibold ${readiness.status === 'ready' ? 'text-teal-700' : 'text-slate-500'}`}>
                    {readiness.status === 'ready' ? 'Ready' : 'Not Connected'}
                  </span>
                  {readiness.latencyMs !== undefined && (
                    <span className="block text-[10px] text-slate-400 font-mono tabular-nums">{readiness.latencyMs}ms</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          <form onSubmit={handleUpdateApiUrl} className="pt-3 border-t border-slate-100">
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
              Backend Endpoint URL
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={apiUrlInput}
                onChange={(e) => setApiUrlInput(e.target.value)}
                placeholder="http://localhost:8000"
                className="flex-1 px-3 py-1.5 text-xs font-mono bg-slate-50 border border-slate-200 rounded focus:outline-none focus:border-teal-500"
              />
              <button
                type="submit"
                className="px-3 py-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded transition-colors"
              >
                Apply &amp; Ping
              </button>
            </div>
            <span className="block text-[11px] text-slate-400 mt-1">
              Use the local Dockerized backend or a configured FastAPI target.
            </span>
          </form>
        </div>

        <div className="p-6 bg-white border border-slate-200 rounded-lg shadow-xs">
          <div className="flex items-center gap-2 mb-4">
            <Database className="w-4 h-4 text-teal-600" />
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
              Live Reliability Snapshot
            </h2>
          </div>

          <div className="space-y-3 text-xs">
            <div className="p-3 rounded bg-slate-50 border border-slate-100">
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-slate-800">Processor success rate</span>
                <span className="font-mono text-[10px] text-slate-500">{formatPercent(reliability?.processor_success_rate)}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-emerald-500"
                  style={{ width: `${Math.min(reliability?.processor_success_rate ?? 0, 100)}%` }}
                />
              </div>
            </div>

            <div className="p-3 rounded bg-slate-50 border border-slate-100">
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-slate-800">Processor failure rate</span>
                <span className="font-mono text-[10px] text-slate-500">{formatPercent(reliability?.processor_failure_rate)}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-amber-500"
                  style={{ width: `${Math.min(reliability?.processor_failure_rate ?? 0, 100)}%` }}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-slate-600">
              <div className="rounded bg-slate-50 p-3 border border-slate-100">
                <div className="text-[11px] text-slate-500">Timeouts</div>
                <div className="mt-1 text-lg font-semibold text-slate-900">{reliability?.timeout_count ?? 0}</div>
              </div>
              <div className="rounded bg-slate-50 p-3 border border-slate-100">
                <div className="text-[11px] text-slate-500">Retries</div>
                <div className="mt-1 text-lg font-semibold text-slate-900">{reliability?.retry_count ?? 0}</div>
              </div>
              <div className="rounded bg-slate-50 p-3 border border-slate-100">
                <div className="text-[11px] text-slate-500">Chaos completed</div>
                <div className="mt-1 text-lg font-semibold text-slate-900">{summary?.completed_chaos_experiments ?? 0}</div>
              </div>
              <div className="rounded bg-slate-50 p-3 border border-slate-100">
                <div className="text-[11px] text-slate-500">Open issues</div>
                <div className="mt-1 text-lg font-semibold text-slate-900">{summary?.unresolved_processor_operations ?? 0}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="p-6 bg-white border border-slate-200 rounded-lg shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 pb-4 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <GitBranch className="w-4 h-4 text-teal-600" />
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                Payment Finite State Machine Specification
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Select a state to inspect allowable transitions, terminal status, and invariant enforcement rules.
            </p>
          </div>

          <div className="text-xs text-slate-400 font-mono">
            7 Canonical States · 3 Terminal States
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5 mb-6 p-1 bg-slate-100 rounded-md">
          {(Object.keys(stateDefinitions) as PaymentStatus[]).map((state) => {
            const isSelected = activeState === state;
            const def = stateDefinitions[state];
            return (
              <button
                key={state}
                type="button"
                onClick={() => setActiveState(state)}
                className={`px-3 py-1.5 text-xs font-mono rounded transition-colors whitespace-nowrap ${
                  isSelected ? 'bg-white text-slate-900 font-bold shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>{state}</span>
                {def.isTerminal && (
                  <span className="ml-1.5 text-[9px] text-slate-400 font-sans uppercase">Terminal</span>
                )}
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs p-4 bg-slate-50 rounded-lg border border-slate-100">
          <div>
            <span className="font-semibold text-slate-700 block mb-1 uppercase tracking-wider text-[11px]">
              State Description
            </span>
            <p className="text-slate-600 leading-relaxed">{stateDefinitions[activeState].description}</p>
            <div className="mt-3">
              <span className="text-[11px] text-slate-500 font-medium block">Transition Trigger:</span>
              <span className="font-mono text-slate-700 text-[11px]">{stateDefinitions[activeState].trigger}</span>
            </div>
          </div>

          <div>
            <span className="font-semibold text-slate-700 block mb-1 uppercase tracking-wider text-[11px]">
              Allowable Direct Transitions
            </span>
            {stateDefinitions[activeState].validNextStates.length > 0 ? (
              <div className="space-y-1.5">
                {stateDefinitions[activeState].validNextStates.map((next) => (
                  <div key={next} className="flex items-center gap-2 p-1.5 bg-white border border-slate-200 rounded font-mono text-[11px]">
                    <ArrowRight className="w-3 h-3 text-teal-600" />
                    <span className="font-semibold text-slate-800">{next}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-2.5 bg-white border border-slate-200 rounded text-slate-500 italic">
                Terminal state. No further transitions permitted.
              </div>
            )}
          </div>

          <div>
            <span className="font-semibold text-slate-700 block mb-1 uppercase tracking-wider text-[11px]">
              Guaranteed Invariants
            </span>
            <ul className="space-y-1 text-slate-600 list-disc list-inside">
              <li>Strict directed graph: illegal jumps raise <code className="font-mono">InvalidStateTransitionError</code> (HTTP 409).</li>
              <li>Terminal states (<code className="font-mono">FAILED</code>, <code className="font-mono">CANCELLED</code>, <code className="font-mono">REFUNDED</code>) cannot mutate.</li>
              <li>Refund calculation enforces cumulative refund ≤ captured amount.</li>
              <li>Timeouts on processors do NOT set payment to <code className="font-mono">FAILED</code>.</li>
            </ul>
          </div>
        </div>
      </div>

      {loadingSummary && !dashboard && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-xs">
          Loading live monitoring snapshot…
        </div>
      )}
    </div>
  );
};

