import React, { useEffect, useMemo, useState } from 'react';
import { Activity, Flame, ListChecks, RefreshCw, ShieldCheck } from 'lucide-react';
import { EmptyState } from '../components/EmptyState';
import { createChaosExperiment, listChaosExperiments, listChaosScenarios } from '../services/api';
import type { ChaosExperimentRecord, ChaosScenario } from '../types';

const defaultConfig = {
  scenario_id: 'duplicate-payment-request',
  target_operation: 'capture',
  delay_ms: 150,
  repetition_count: 2,
  concurrency_level: 2,
  maximum_attempts: 3,
  random_seed: 42,
};

export const ChaosLabPage: React.FC = () => {
  const [scenarios, setScenarios] = useState<ChaosScenario[]>([]);
  const [history, setHistory] = useState<ChaosExperimentRecord[]>([]);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>(defaultConfig.scenario_id);
  const [config, setConfig] = useState(defaultConfig);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<ChaosExperimentRecord | null>(null);

  useEffect(() => {
    void loadData();
  }, []);

  const selectedScenario = useMemo(
    () => scenarios.find((scenario) => scenario.id === selectedScenarioId) ?? scenarios[0],
    [scenarios, selectedScenarioId]
  );

  async function loadData() {
    try {
      const [scenarioResponse, experimentsResponse] = await Promise.all([
        listChaosScenarios(),
        listChaosExperiments(10, 0),
      ]);
      setScenarios(scenarioResponse);
      if (scenarioResponse.length > 0) {
        setSelectedScenarioId((current) => current || scenarioResponse[0].id);
      }
      setHistory(experimentsResponse.items);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load chaos scenarios.');
    }
  }

  async function runExperiment(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const result = await createChaosExperiment({ ...config, scenario_id: selectedScenarioId });
      setLastResult(result);
      await loadData();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Experiment execution failed.');
    } finally {
      setLoading(false);
    }
  }

  if (!scenarios.length) {
    return (
      <div className="space-y-6 max-w-6xl">
        <EmptyState
          icon={Flame}
          title="Chaos Engineering Lab"
          description="Loading available fault-injection scenarios from the real backend..."
          phaseNotice="Phase 4: Payment Chaos Lab"
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-600">Phase 4</p>
          <h2 className="mt-1 text-2xl font-bold text-slate-900">Payment Chaos Lab</h2>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-sm text-teal-700">
          <ShieldCheck className="h-4 w-4" />
          Deterministic backend execution
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
        <form onSubmit={runExperiment} className="space-y-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div>
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
              <Activity className="h-4 w-4 text-teal-600" />
              Scenario selection
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {scenarios.map((scenario) => (
                <button
                  key={scenario.id}
                  type="button"
                  onClick={() => setSelectedScenarioId(scenario.id)}
                  className={`rounded-xl border p-3 text-left transition ${
                    selectedScenario?.id === scenario.id
                      ? 'border-teal-500 bg-teal-50 ring-2 ring-teal-100'
                      : 'border-slate-200 bg-slate-50 hover:border-slate-300'
                  }`}
                >
                  <div className="text-sm font-semibold text-slate-900">{scenario.name}</div>
                  <div className="mt-1 text-xs text-slate-500">{scenario.failure_type}</div>
                </button>
              ))}
            </div>
          </div>

          {selectedScenario && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-base font-semibold text-slate-900">{selectedScenario.name}</div>
              <p className="mt-2 text-sm text-slate-600">{selectedScenario.description}</p>
              <p className="mt-2 text-xs font-medium uppercase tracking-[0.1em] text-sky-700">
                Expected response: {selectedScenario.expected_system_response}
              </p>
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm text-slate-700">
              target_operation
              <input
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-teal-500"
                value={config.target_operation}
                onChange={(event) => setConfig({ ...config, target_operation: event.target.value })}
              />
            </label>
            <label className="text-sm text-slate-700">
              delay_ms
              <input
                type="number"
                min={0}
                max={5000}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-teal-500"
                value={config.delay_ms}
                onChange={(event) => setConfig({ ...config, delay_ms: Number(event.target.value) })}
              />
            </label>
            <label className="text-sm text-slate-700">
              repetition_count
              <input
                type="number"
                min={1}
                max={20}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-teal-500"
                value={config.repetition_count}
                onChange={(event) => setConfig({ ...config, repetition_count: Number(event.target.value) })}
              />
            </label>
            <label className="text-sm text-slate-700">
              concurrency_level
              <input
                type="number"
                min={1}
                max={10}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-teal-500"
                value={config.concurrency_level}
                onChange={(event) => setConfig({ ...config, concurrency_level: Number(event.target.value) })}
              />
            </label>
            <label className="text-sm text-slate-700">
              maximum_attempts
              <input
                type="number"
                min={1}
                max={5}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-teal-500"
                value={config.maximum_attempts}
                onChange={(event) => setConfig({ ...config, maximum_attempts: Number(event.target.value) })}
              />
            </label>
            <label className="text-sm text-slate-700">
              random_seed
              <input
                type="number"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-teal-500"
                value={config.random_seed ?? ''}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  setConfig({ ...config, random_seed: nextValue === '' ? 0 : Number(nextValue) });
                }}
              />
            </label>
          </div>

          {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Flame className="h-4 w-4" />}
            {loading ? 'Running experiment...' : 'Run Experiment'}
          </button>
        </form>

        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <ListChecks className="h-4 w-4 text-sky-600" />
            Latest result
          </div>
          {lastResult ? (
            <div className="space-y-3 text-sm text-slate-600">
              <div>Scenario: {lastResult.scenario_id}</div>
              <div>Status: {lastResult.status}</div>
              <div>Verdict: {lastResult.final_verdict ?? 'pending'}</div>
              <div>Payments: {lastResult.related_payment_ids.join(', ') || 'none'}</div>
              {lastResult.error_summary && <div className="text-red-600">{lastResult.error_summary}</div>}
            </div>
          ) : (
            <div className="text-sm text-slate-500">No experiments have been executed yet.</div>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 text-lg font-semibold text-slate-900">Experiment history</div>
        {history.length === 0 ? (
          <div className="text-sm text-slate-500">No persisted chaos experiments yet.</div>
        ) : (
          <div className="space-y-3">
            {history.map((experiment) => (
              <div key={experiment.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-medium text-slate-800">{experiment.scenario_id}</div>
                  <span className="rounded-full bg-slate-200 px-2 py-1 text-xs font-medium uppercase tracking-wide text-slate-700">
                    {experiment.status}
                  </span>
                </div>
                <div className="mt-2 text-xs text-slate-500">
                  Started: {experiment.started_at ? new Date(experiment.started_at).toLocaleString() : 'n/a'}
                </div>
                <div className="mt-1 text-xs text-slate-500">Verdict: {experiment.final_verdict ?? 'pending'}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
