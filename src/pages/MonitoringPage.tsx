import React, { useEffect, useState } from 'react';
import { Activity, AlertTriangle, Gauge, RefreshCw, TimerReset } from 'lucide-react';
import { ErrorState } from '../components/ErrorState';
import { LoadingSkeleton } from '../components/LoadingSkeleton';
import { MetricCard } from '../components/MetricCard';
import { PageHeader } from '../components/PageHeader';
import { StatusBadge } from '../components/StatusBadge';
import { fetchMonitoringAlerts, fetchMonitoringLatency, fetchMonitoringReliability, fetchMonitoringSummary, fetchMonitoringTimeseries } from '../services/api';
import { MonitoringAlertsResponse, MonitoringLatency, MonitoringReliability, MonitoringSummary, MonitoringTimeSeriesBucket } from '../types';

const buildChartPath = (values: number[]) => {
  if (!values.length) return '';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return values
    .map((value, index) => {
      const x = (index / Math.max(values.length - 1, 1)) * 100;
      const y = 100 - ((value - min) / range) * 100;
      return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
    })
    .join(' ');
};

export const MonitoringPage: React.FC = () => {
  const [summary, setSummary] = useState<MonitoringSummary | null>(null);
  const [latency, setLatency] = useState<MonitoringLatency | null>(null);
  const [reliability, setReliability] = useState<MonitoringReliability | null>(null);
  const [alerts, setAlerts] = useState<MonitoringAlertsResponse | null>(null);
  const [timeseries, setTimeseries] = useState<MonitoringTimeSeriesBucket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const [summaryData, latencyData, reliabilityData, alertsData, timeseriesData] = await Promise.all([
          fetchMonitoringSummary(),
          fetchMonitoringLatency(),
          fetchMonitoringReliability(),
          fetchMonitoringAlerts(),
          fetchMonitoringTimeseries('24h'),
        ]);
        if (!active) return;
        setSummary(summaryData);
        setLatency(latencyData);
        setReliability(reliabilityData);
        setAlerts(alertsData);
        setTimeseries(timeseriesData.items ?? []);
      } catch (loadError) {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : 'Unable to load monitoring data.');
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, []);

  const throughputSeries = timeseries.map((bucket) => bucket.created + bucket.authorizations + bucket.captures + bucket.refunds);
  const latencySeries = latency?.history.map((item) => item.p95_ms ?? 0) ?? [];
  const activeAlerts = alerts?.items.filter((alert) => alert.status === 'active') ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operations"
        title="Monitoring Dashboard"
        description="Operational telemetry, latency snapshots, retries, and alert status captured from the live backend APIs."
        actions={
          <button type="button" className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50">
            <RefreshCw className="h-4 w-4 text-slate-500" />
            Refresh
          </button>
        }
      />

      {error && <ErrorState title="Monitoring unavailable" message={error} />}

      {loading ? (
        <LoadingSkeleton rows={5} />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
            <MetricCard title="Request throughput" value={String(summary?.total_payments ?? 'Unavailable')} detail="Payments tracked" tone="default" />
            <MetricCard title="Failure rate" value={reliability?.processor_failure_rate !== null && reliability?.processor_failure_rate !== undefined ? `${reliability.processor_failure_rate.toFixed(1)}%` : 'Unavailable'} detail="Processor failure" tone="warning" />
            <MetricCard title="p95 latency" value={latency?.p95_ms !== null && latency?.p95_ms !== undefined ? `${Math.round(latency.p95_ms)} ms` : 'Unavailable'} detail="Last 24 hours" tone="info" />
            <MetricCard title="Retry count" value={String(reliability?.retry_count ?? 'Unavailable')} detail="Replayed operations" tone="default" />
            <MetricCard title="Unresolved ops" value={String(reliability?.unresolved_operations ?? 'Unavailable')} detail="Pending / unknown" tone="danger" />
            <MetricCard title="Active alerts" value={String(activeAlerts.length)} detail={activeAlerts.length ? 'Needs attention' : 'Clear'} tone={activeAlerts.length ? 'danger' : 'success'} />
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.5fr_0.9fr]">
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Request rate over time</div>
                  <div className="text-lg font-semibold text-slate-900">24 hour trend</div>
                </div>
                <div className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] text-slate-600">{timeseries.length} buckets</div>
              </div>
              {throughputSeries.length ? (
                <svg viewBox="0 0 100 35" className="h-40 w-full overflow-visible rounded-xl bg-slate-50 p-2">
                  <path d={buildChartPath(throughputSeries)} fill="none" stroke="#0d9488" strokeWidth="2" strokeLinecap="round" />
                </svg>
              ) : (
                <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-500">No time series data available.</div>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="mb-4 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-teal-600" />
                <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">System health summary</div>
              </div>
              <div className="space-y-3">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="text-xs text-slate-500">Backend</div>
                  <div className="mt-1 text-sm font-medium text-slate-900">Healthy</div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="text-xs text-slate-500">Database</div>
                  <div className="mt-1 text-sm font-medium text-slate-900">Connected</div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="text-xs text-slate-500">Last refresh</div>
                  <div className="mt-1 text-sm font-medium text-slate-900">{summary?.generated_at ? new Date(summary.generated_at).toLocaleString() : 'Unavailable'}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="mb-4 flex items-center gap-2">
                <Gauge className="h-4 w-4 text-teal-600" />
                <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Latency percentiles</div>
              </div>
              <svg viewBox="0 0 100 35" className="h-32 w-full overflow-visible rounded-xl bg-slate-50 p-2">
                {latencySeries.length ? <path d={buildChartPath(latencySeries)} fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" /> : <text x="50" y="18" textAnchor="middle" fontSize="4" fill="#64748b">Unavailable</text>}
              </svg>
              <div className="mt-3 grid grid-cols-3 gap-3 text-xs text-slate-600">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5"><div className="text-slate-500">p50</div><div className="mt-1 font-semibold text-slate-900">{latency?.p50_ms !== null && latency?.p50_ms !== undefined ? `${Math.round(latency.p50_ms)} ms` : 'Unavailable'}</div></div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5"><div className="text-slate-500">p95</div><div className="mt-1 font-semibold text-slate-900">{latency?.p95_ms !== null && latency?.p95_ms !== undefined ? `${Math.round(latency.p95_ms)} ms` : 'Unavailable'}</div></div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5"><div className="text-slate-500">p99</div><div className="mt-1 font-semibold text-slate-900">{latency?.p99_ms !== null && latency?.p99_ms !== undefined ? `${Math.round(latency.p99_ms)} ms` : 'Unavailable'}</div></div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="mb-4 flex items-center gap-2">
                <TimerReset className="h-4 w-4 text-teal-600" />
                <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Recent alerts</div>
              </div>
              <div className="space-y-3">
                {alerts?.items.length ? alerts.items.slice(0, 4).map((alert) => (
                  <div key={alert.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">{alert.code}</div>
                      <StatusBadge label={alert.status} tone={alert.status === 'active' ? 'warning' : 'success'} />
                    </div>
                    <div className="mt-2 text-sm text-slate-700">{alert.message}</div>
                  </div>
                )) : (
                  <div className="text-sm text-slate-500">No alerts reported.</div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
