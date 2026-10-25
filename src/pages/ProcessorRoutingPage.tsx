import React, { useEffect, useState } from 'react';
import { Activity, Gauge, GitFork, RefreshCcw, Route } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import {
  fetchProcessorOverview,
  fetchProcessorPolicies,
  fetchRoutingDecisions,
  fetchRoutingMetrics,
  runRoutingSimulation,
} from '../services/api';
import type {
  ProcessorOverviewRecord,
  RoutingDecisionRecord,
  RoutingMetricRecord,
  RoutingPolicyRecord,
  RoutingSimulationRecord,
} from '../types';

export const ProcessorRoutingPage: React.FC = () => {
  const [processors, setProcessors] = useState<ProcessorOverviewRecord[]>([]);
  const [policies, setPolicies] = useState<RoutingPolicyRecord[]>([]);
  const [decisions, setDecisions] = useState<RoutingDecisionRecord[]>([]);
  const [metrics, setMetrics] = useState<RoutingMetricRecord | null>(null);
  const [simulation, setSimulation] = useState<RoutingSimulationRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const [processorData, policyData, decisionData, metricData] = await Promise.all([
          fetchProcessorOverview(),
          fetchProcessorPolicies(),
          fetchRoutingDecisions(5, 0),
          fetchRoutingMetrics(),
        ]);
        setProcessors(processorData);
        setPolicies(policyData);
        setDecisions(decisionData);
        setMetrics(metricData);
        const simulationData = await runRoutingSimulation('all_healthy', 25);
        setSimulation(simulationData);
        setError(null);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Unable to load routing state.');
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Phase 7"
        title="Processor Routing"
        description="Adaptive multi-processor dispatch, circuit-breaker health checks, and safe failover decisions are active in the backend and surfaced here with real routing telemetry."
      />

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {error}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">Processors</span>
            <Route className="h-4 w-4 text-sky-600" />
          </div>
          <div className="mt-3 text-3xl font-semibold text-slate-900">{processors.length}</div>
          <div className="text-sm text-slate-600">active simulated gateways</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">Policies</span>
            <Gauge className="h-4 w-4 text-teal-600" />
          </div>
          <div className="mt-3 text-3xl font-semibold text-slate-900">{policies.length}</div>
          <div className="text-sm text-slate-600">routing strategies</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">Latest outcome</span>
            <Activity className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="mt-3 text-3xl font-semibold text-slate-900">{decisions[0]?.outcome ?? 'N/A'}</div>
          <div className="text-sm text-slate-600">most recent routing decision</div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-900">Processor overview</h3>
            <RefreshCcw className="h-4 w-4 text-slate-400" />
          </div>
          <div className="space-y-3">
            {loading ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">Loading processor telemetry…</div>
            ) : processors.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">No processor data available.</div>
            ) : (
              processors.map((processor) => (
                <div key={processor.processor_id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-base font-semibold text-slate-900">{processor.display_name}</div>
                      <div className="text-xs uppercase tracking-[0.12em] text-slate-500">{processor.status}</div>
                    </div>
                    <div className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700">
                      {processor.availability * 100}% available
                    </div>
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-3 text-sm text-slate-600">
                    <div><span className="block text-[11px] uppercase tracking-[0.12em] text-slate-500">Success rate</span>{processor.success_rate * 100}%</div>
                    <div><span className="block text-[11px] uppercase tracking-[0.12em] text-slate-500">Latency</span>{processor.latency_ms} ms</div>
                    <div><span className="block text-[11px] uppercase tracking-[0.12em] text-slate-500">Currencies</span>{processor.supported_currencies.join(', ')}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="text-lg font-semibold text-slate-900">Routing policy</h3>
          <div className="mt-4 space-y-3">
            {policies.map((policy) => (
              <div key={policy.policy} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-sm font-semibold text-slate-900">{policy.name}</div>
                <div className="mt-1 text-sm text-slate-600">{policy.description}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="text-lg font-semibold text-slate-900">Routing decision history</h3>
          <div className="mt-4 space-y-3">
            {decisions.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">No routing decisions recorded yet.</div>
            ) : (
              decisions.map((decision) => (
                <div key={decision.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-slate-900">{decision.processor_id}</div>
                    <div className="rounded-full bg-sky-100 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-sky-700">{decision.routing_policy}</div>
                  </div>
                  <div className="mt-2 text-xs text-slate-600">{decision.selection_reason}</div>
                  <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
                    <span>Payment: {decision.payment_id.slice(0, 8)}</span>
                    <span>Outcome: {decision.outcome ?? 'unknown'}</span>
                    <span>Latency: {decision.actual_latency_ms ?? decision.estimated_latency_ms ?? 'n/a'} ms</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="text-lg font-semibold text-slate-900">Routing analytics</h3>
          <div className="mt-4 space-y-3 text-sm text-slate-700">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-[11px] uppercase tracking-[0.12em] text-slate-500">Total decisions</div>
              <div className="mt-2 text-xl font-semibold text-slate-900">{metrics?.total_decisions ?? 0}</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-[11px] uppercase tracking-[0.12em] text-slate-500">Benchmark</div>
              <div className="mt-2 text-sm text-slate-900">{simulation?.scenario ?? 'all_healthy'}</div>
              <div className="mt-1 text-xs text-slate-600">{JSON.stringify(simulation?.benchmark ?? {})}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
