import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Database,
  Gauge,
  Server,
  ShieldAlert,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { checkBackendHealth, checkBackendReadiness, getMonitoringDashboard } from '../services/api';
import { MonitoringDashboardData } from '../types';

const formatPercent = (value: number | null | undefined): string => {
  if (value === null || value === undefined) return 'N/A';
  return `${value.toFixed(1)}%`;
};

const formatNumber = (value: number | null | undefined): string => {
  if (value === null || value === undefined) return 'N/A';
  return new Intl.NumberFormat().format(value);
};

const formatMs = (value: number | null | undefined): string => {
  if (value === null || value === undefined) return 'N/A';
  return `${Math.round(value)}ms`;
};

const StatusPill: React.FC<{ label: string; tone: 'healthy' | 'warning' | 'critical' | 'neutral' }> = ({ label, tone }) => {
  const tones = {
    healthy: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
    warning: 'bg-amber-100 text-amber-700 border border-amber-200',
    critical: 'bg-rose-100 text-rose-700 border border-rose-200',
    neutral: 'bg-slate-100 text-slate-700 border border-slate-200',
  };

  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${tones[tone]}`}>{label}</span>;
};

export const MonitoringPage: React.FC = () => {
  const [data, setData] = useState<MonitoringDashboardData | null>(null);
  const [health, setHealth] = useState<{ status: string; message: string }>({ status: 'checking', message: 'Checking backend' });
  const [readiness, setReadiness] = useState<{ status: string; message: string }>({ status: 'checking', message: 'Checking database' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const [dashboard, backendHealth, backendReadiness] = await Promise.all([
        getMonitoringDashboard(),
        checkBackendHealth(),
        checkBackendReadiness(),
      ]);

      setData(dashboard);
      setError(null);
      setHealth({
        status: backendHealth.status,
        message: backendHealth.status === 'healthy' ? 'FastAPI is responding' : backendHealth.error || 'Backend unavailable',
      });
      setReadiness({
        status: backendReadiness.status,
        message: backendReadiness.status === 'ready' ? 'Database connected' : backendReadiness.error || 'Database disconnected',
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load monitoring dashboard data.');
      setHealth({ status: 'unreachable', message: 'Monitoring backend unavailable' });
      setReadiness({ status: 'unreachable', message: 'Database unavailable' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
    const timer = window.setInterval(() => {
      void loadDashboard();
    }, 7000);
    return () => window.clearInterval(timer);
  }, [loadDashboard]);

  const overallFailureRate = useMemo(() => {
    if (!data) return null;
    return data.reliability.processor_failure_rate ?? null;
  }, [data]);

  const activeAlerts = data?.alerts.items.filter((item) => item.status === 'active') ?? [];

  if (error && !data) {
    return (
      <div className="max-w-4xl space-y-6">
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <WifiOff className="h-5 w-5 text-rose-600" />
            <div>
              <h2 className="text-lg font-semibold text-rose-800">Monitoring disconnected</h2>
              <p className="text-sm text-rose-700">{error}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const chartMax = Math.max(1, ...((data?.timeseries.items ?? []).map((item) => item.created)), 1);

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Phase 5 • Monitoring</p>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">Live reliability dashboard</h1>
        </div>
        <div className="flex items-center gap-2">
          <StatusPill label={health.status === 'healthy' ? 'Backend connected' : health.status === 'unreachable' ? 'Backend offline' : 'Checking backend'} tone={health.status === 'healthy' ? 'healthy' : health.status === 'unreachable' ? 'critical' : 'neutral'} />
          <StatusPill label={readiness.status === 'ready' ? 'Database healthy' : readiness.status === 'unreachable' ? 'Database offline' : 'Checking DB'} tone={readiness.status === 'ready' ? 'healthy' : readiness.status === 'unreachable' ? 'critical' : 'neutral'} />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-500"><span>Transactions</span><Database className="h-4 w-4 text-teal-600" /></div>
          <div className="mt-3 text-2xl font-semibold text-slate-900">{formatNumber(data?.summary.total_payments ?? 0)}</div>
          <div className="mt-1 text-xs text-slate-500">Total payment records</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-500"><span>Success rate</span><CheckCircle2 className="h-4 w-4 text-emerald-600" /></div>
          <div className="mt-3 text-2xl font-semibold text-slate-900">{formatPercent(data?.reliability.processor_success_rate ?? null)}</div>
          <div className="mt-1 text-xs text-slate-500">Processor performance</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-500"><span>Failure rate</span><ShieldAlert className="h-4 w-4 text-amber-600" /></div>
          <div className="mt-3 text-2xl font-semibold text-slate-900">{formatPercent(overallFailureRate)}</div>
          <div className="mt-1 text-xs text-slate-500">Observed gateway errors</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-500"><span>p95 latency</span><Gauge className="h-4 w-4 text-indigo-600" /></div>
          <div className="mt-3 text-2xl font-semibold text-slate-900">{formatMs(data?.latency.p95_ms ?? null)}</div>
          <div className="mt-1 text-xs text-slate-500">90th percentile latency</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-500"><span>Unresolved</span><Server className="h-4 w-4 text-sky-600" /></div>
          <div className="mt-3 text-2xl font-semibold text-slate-900">{formatNumber(data?.summary.unresolved_processor_operations ?? 0)}</div>
          <div className="mt-1 text-xs text-slate-500">Pending or unknown ops</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-500"><span>Alerts</span><AlertTriangle className="h-4 w-4 text-rose-600" /></div>
          <div className="mt-3 text-2xl font-semibold text-slate-900">{formatNumber(data?.alerts.summary.active_alerts ?? 0)}</div>
          <div className="mt-1 text-xs text-slate-500">Active threshold conditions</div>
        </div>
      </div>

      {loading && !data ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">Loading monitoring dataset…</div>
      ) : null}

      {data ? (
        <>
          <div className="grid gap-6 xl:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Transaction volume</h2>
                <span className="text-xs text-slate-500">Last 24h</span>
              </div>
              <div className="flex h-48 items-end gap-2">
                {(data.timeseries.items ?? []).map((item) => {
                  const height = Math.max((item.created / chartMax) * 100, item.created > 0 ? 12 : 0);
                  return (
                    <div key={item.timestamp} className="flex flex-1 flex-col items-center justify-end gap-2">
                      <div className="w-full rounded-t-md bg-gradient-to-t from-teal-500 to-cyan-400" style={{ height: `${height}%` }} title={`Created: ${item.created}`} />
                      <span className="text-[10px] text-slate-400">{new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Latency trend</h2>
                <span className="text-xs text-slate-500">p95 over time</span>
              </div>
              <div className="flex h-48 items-end gap-2">
                {(data.latency.history ?? []).map((point) => {
                  const value = point.p95_ms ?? 0;
                  const maxLatency = Math.max(1, ...data.latency.history.map((entry) => entry.p95_ms ?? 0));
                  const height = Math.max((value / maxLatency) * 100, 10);
                  return (
                    <div key={point.timestamp} className="flex flex-1 flex-col items-center justify-end gap-2">
                      <div className="w-full rounded-t-md bg-gradient-to-t from-violet-500 to-indigo-400" style={{ height: `${height}%` }} title={`p95: ${formatMs(value)}`} />
                      <span className="text-[10px] text-slate-400">{new Date(point.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Reliability breakdown</h2>
              <div className="mt-5 space-y-4">
                <div>
                  <div className="mb-1 flex items-center justify-between text-xs text-slate-500"><span>Success</span><span>{formatPercent(data.reliability.processor_success_rate)}</span></div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(data.reliability.processor_success_rate ?? 0, 100)}%` }} /></div>
                </div>
                <div>
                  <div className="mb-1 flex items-center justify-between text-xs text-slate-500"><span>Failure</span><span>{formatPercent(data.reliability.processor_failure_rate)}</span></div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-amber-500" style={{ width: `${Math.min(data.reliability.processor_failure_rate ?? 0, 100)}%` }} /></div>
                </div>
                <div className="grid gap-3 sm:grid-cols-3 pt-2 text-sm text-slate-600">
                  <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-500">Timeouts</div><div className="mt-1 text-xl font-semibold text-slate-900">{data.reliability.timeout_count}</div></div>
                  <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-500">Retries</div><div className="mt-1 text-xl font-semibold text-slate-900">{data.reliability.retry_count}</div></div>
                  <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-500">Unresolved</div><div className="mt-1 text-xl font-semibold text-slate-900">{data.reliability.unresolved_operations}</div></div>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Alert status</h2>
              <div className="mt-4 space-y-3">
                {(activeAlerts.length ? activeAlerts : data.alerts.items).slice(0, 4).map((alert) => (
                  <div key={alert.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-medium text-slate-800">{alert.code.replace(/_/g, ' ')}</div>
                      <StatusPill label={alert.status} tone={alert.status === 'active' ? (alert.severity === 'critical' ? 'critical' : 'warning') : 'healthy'} />
                    </div>
                    <p className="mt-2 text-xs text-slate-600">{alert.message}</p>
                  </div>
                ))}
                {(!activeAlerts.length && !data.alerts.items.length) && (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">No active alerts. System is within the configured thresholds.</div>
                )}
              </div>
            </div>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Stuck operations</h2>
              <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-3 py-2">Payment</th>
                      <th className="px-3 py-2">State</th>
                      <th className="px-3 py-2">Age</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.stuck.items ?? []).slice(0, 6).map((item) => (
                      <tr key={item.operation_id} className="border-t border-slate-200">
                        <td className="px-3 py-2 font-mono text-xs text-slate-700">{item.related_payment_id.slice(0, 8)}</td>
                        <td className="px-3 py-2">{item.current_state}</td>
                        <td className="px-3 py-2 text-slate-600">{Math.round(item.time_in_current_state_seconds / 60)}m</td>
                      </tr>
                    ))}
                    {!data.stuck.items.length && (
                      <tr>
                        <td colSpan={3} className="px-3 py-5 text-center text-sm text-slate-500">No stalled operations detected.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Recent Chaos Lab results</h2>
              <div className="mt-4 space-y-3">
                {(data.summary.recent_chaos ?? []).slice(0, 5).map((experiment) => (
                  <div key={experiment.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <div>
                      <div className="text-sm font-medium text-slate-800">{experiment.scenario_id}</div>
                      <div className="text-xs text-slate-500">{experiment.status}</div>
                    </div>
                    <StatusPill label={experiment.final_verdict ?? experiment.status} tone={experiment.final_verdict === 'FAIL' ? 'critical' : experiment.final_verdict === 'PASS' ? 'healthy' : 'neutral'} />
                  </div>
                ))}
                {!data.summary.recent_chaos.length && (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">No Chaos Lab results yet.</div>
                )}
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
};
