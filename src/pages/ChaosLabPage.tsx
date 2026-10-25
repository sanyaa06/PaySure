import React, { useEffect, useMemo, useState } from 'react';
import { Activity, Clock3, Flame, Loader2, RefreshCw, TimerReset } from 'lucide-react';
import { ErrorState } from '../components/ErrorState';
import { LoadingSkeleton } from '../components/LoadingSkeleton';
import { PageHeader } from '../components/PageHeader';
import { StatusBadge } from '../components/StatusBadge';
import { createChaosExperiment, fetchChaosHistory, fetchChaosScenarios, fetchChaosExperiment } from '../services/api';
import { ChaosExperimentRecord, ChaosScenario } from '../types';

const formatDuration = (start?: string | null, end?: string | null) => {
  if (!start) return 'Unavailable';
  const begin = new Date(start).getTime();
  const finish = end ? new Date(end).getTime() : Date.now();
  const durationMs = finish - begin;
  return `${Math.max(durationMs, 0)} ms`;
};

const scenarioLabels: Record<string, string> = {
  target_operation: 'Target Operation',
  delay_ms: 'Simulated Delay (ms)',
  repetition_count: 'Number of Repetitions',
  concurrency_level: 'Concurrent Requests',
  maximum_attempts: 'Maximum Retry Attempts',
  random_seed: 'Random Seed',
};

export const ChaosLabPage: React.FC = () => {
  const [scenarios, setScenarios] = useState<ChaosScenario[]>([]);
  const [history, setHistory] = useState<ChaosExperimentRecord[]>([]);
  const [selectedScenario, setSelectedScenario] = useState<string>('duplicate-payment-request');
  const [latestExperiment, setLatestExperiment] = useState<ChaosExperimentRecord | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState({
    target_operation: 'capture',
    delay_ms: 0,
    repetition_count: 2,
    concurrency_level: 2,
    maximum_attempts: 3,
    random_seed: 42,
  });

  const selectedScenarioMeta = useMemo(
    () => scenarios.find((scenario) => scenario.id === selectedScenario) ?? scenarios[0],
    [scenarios, selectedScenario],
  );

  const load = async () => {
    setLoading(true);
    try {
      const [scenarioData, historyData] = await Promise.all([fetchChaosScenarios(), fetchChaosHistory(10)]);
      setScenarios(scenarioData);
      setHistory(historyData.items || []);
      if (!historyData.items?.length) {
        setLatestExperiment(null);
      } else {
        setLatestExperiment(historyData.items[0]);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load Chaos Lab data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!latestExperiment || latestExperiment.status !== 'RUNNING') return;
    const timer = window.setTimeout(async () => {
      try {
        const refreshed = await fetchChaosExperiment(latestExperiment.id);
        setLatestExperiment(refreshed);
        setHistory((current) => {
          const next = current.filter((item) => item.id !== refreshed.id);
          return [refreshed, ...next];
        });
      } catch {
        // ignore transient polling failures; the user sees the current backend status
      }
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [latestExperiment]);

  const runExperiment = async () => {
    setIsRunning(true);
    setError(null);
    try {
      const payload = { scenario_id: selectedScenario, ...config };
      const created = await createChaosExperiment(payload);
      setLatestExperiment(created);
      setHistory((current) => [created, ...current]);
      await load();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Experiment execution failed.');
    } finally {
      setIsRunning(false);
    }
  };

  const detail = latestExperiment;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Failure injection"
        title="Chaos Lab"
        description="Run controlled experiments against the payment workflow and review invariants, retries, and fault outcomes with preserved historical evidence."
      />

      {error && <ErrorState title="Chaos execution failed" message={error} />}

      {loading ? (
        <LoadingSkeleton rows={5} />
      ) : (
        <>
          <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="mb-4 flex items-center gap-2">
                <Flame className="h-4 w-4 text-teal-600" />
                <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">Scenario selection</div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                {scenarios.map((scenario) => (
                  <button
                    key={scenario.id}
                    type="button"
                    onClick={() => setSelectedScenario(scenario.id)}
                    className={[
                      'rounded-xl border p-3 text-left transition',
                      selectedScenario === scenario.id ? 'border-teal-500 bg-teal-50/40' : 'border-slate-200 bg-slate-50 hover:border-slate-300',
                    ].join(' ')}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium text-slate-800">{scenario.name}</div>
                      <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-600">{scenario.failure_type}</span>
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-slate-600">{scenario.description}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TimerReset className="h-4 w-4 text-teal-600" />
                  <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">Experiment configuration</div>
                </div>
                <StatusBadge label={selectedScenarioMeta?.failure_type ?? 'scenario'} tone="info" />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {Object.entries(config).map(([key, value]) => (
                  <label key={key} className="block text-sm text-slate-700">
                    <span className="mb-1 block text-xs font-medium text-slate-600">{scenarioLabels[key] ?? key}</span>
                    <input
                      type="number"
                      value={value as number}
                      onChange={(event) => setConfig((current) => ({ ...current, [key]: Number(event.target.value) }))}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10"
                    />
                  </label>
                ))}
              </div>

              <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                {selectedScenarioMeta?.expected_system_response ?? 'No scenario response defined.'}
              </div>

              <button
                type="button"
                onClick={() => void runExperiment()}
                disabled={isRunning}
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Activity className="h-4 w-4" />}
                {isRunning ? 'Running experiment…' : 'Run Experiment'}
              </button>
            </div>
          </div>

          <div className="grid gap-6 xl:grid-cols-[1fr_1.2fr]">
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="mb-4 flex items-center gap-2">
                <Clock3 className="h-4 w-4 text-teal-600" />
                <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">Latest result</div>
              </div>

              {detail ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <StatusBadge label={detail.status} tone={detail.status === 'COMPLETED' ? 'success' : detail.status === 'FAILED' ? 'danger' : 'info'} />
                    <StatusBadge label={detail.final_verdict ?? 'PENDING'} tone={detail.final_verdict === 'PASS' ? 'success' : detail.final_verdict === 'FAIL' ? 'danger' : 'neutral'} />
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.12em] text-slate-500">Scenario</div>
                        <div className="mt-1 font-medium text-slate-900">{detail.scenario_id}</div>
                      </div>
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.12em] text-slate-500">Experiment ID</div>
                        <div className="mt-1 font-mono text-[11px] text-slate-900">{detail.id}</div>
                      </div>
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.12em] text-slate-500">Started</div>
                        <div className="mt-1 text-slate-900">{detail.started_at ? new Date(detail.started_at).toLocaleString() : 'Unavailable'}</div>
                      </div>
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.12em] text-slate-500">Duration</div>
                        <div className="mt-1 text-slate-900">{formatDuration(detail.started_at, detail.completed_at)}</div>
                      </div>
                    </div>
                  </div>

                  {detail.related_payment_ids.length ? (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                      <div className="text-[11px] uppercase tracking-[0.12em] text-slate-500">Related payment IDs</div>
                      <div className="mt-2 space-y-1 font-mono text-[11px] text-slate-900">
                        {detail.related_payment_ids.map((id) => <div key={id}>{id}</div>)}
                      </div>
                    </div>
                  ) : null}

                  {detail.error_summary && (
                    <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{detail.error_summary}</div>
                  )}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">No experiment has been run yet.</div>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="mb-4 flex items-center gap-2">
                <RefreshCw className="h-4 w-4 text-teal-600" />
                <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">Execution timeline</div>
              </div>
              {detail?.events?.length ? (
                <div className="space-y-3">
                  {detail.events.map((event) => (
                    <div key={event.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-medium text-slate-800">{event.event_type}</div>
                        <div className="text-[11px] text-slate-500">{new Date(event.timestamp).toLocaleString()}</div>
                      </div>
                      <div className="mt-2 text-xs text-slate-600">{event.description}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">No backend events available yet.</div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="mb-4 flex items-center gap-2">
              <Activity className="h-4 w-4 text-teal-600" />
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">Invariant verification</div>
            </div>

            {detail?.invariant_results?.length ? (
              <div className="space-y-3">
                {detail.invariant_results.map((result) => (
                  <div key={result.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <div className="font-medium text-slate-800">{result.invariant_name}</div>
                      <StatusBadge label={result.verdict} tone={result.verdict === 'PASS' ? 'success' : result.verdict === 'FAIL' ? 'danger' : 'neutral'} />
                    </div>
                    <div className="grid gap-2 text-xs text-slate-600 md:grid-cols-2">
                      <div><span className="font-medium text-slate-700">Expected:</span> {result.expected_condition}</div>
                      <div><span className="font-medium text-slate-700">Observed:</span> {result.observed_condition}</div>
                    </div>
                    <div className="mt-2 text-xs text-slate-600"><span className="font-medium text-slate-700">Evidence:</span> {JSON.stringify(result.evidence)}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">No invariant results generated yet.</div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="mb-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">Experiment history</div>
            {history.length ? (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-50 text-[11px] uppercase tracking-[0.12em] text-slate-500">
                    <tr>
                      <th className="px-3 py-2.5">Scenario</th>
                      <th className="px-3 py-2.5">Started</th>
                      <th className="px-3 py-2.5">Duration</th>
                      <th className="px-3 py-2.5">Status</th>
                      <th className="px-3 py-2.5">Verdict</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((experiment) => (
                      <tr key={experiment.id} className="cursor-pointer border-t border-slate-200 hover:bg-slate-50" onClick={() => setLatestExperiment(experiment)}>
                        <td className="px-3 py-2.5 font-medium text-slate-800">{experiment.scenario_id}</td>
                        <td className="px-3 py-2.5 text-slate-600">{experiment.started_at ? new Date(experiment.started_at).toLocaleString() : 'Unavailable'}</td>
                        <td className="px-3 py-2.5 text-slate-600">{formatDuration(experiment.started_at, experiment.completed_at)}</td>
                        <td className="px-3 py-2.5"><StatusBadge label={experiment.status} tone={experiment.status === 'COMPLETED' ? 'success' : experiment.status === 'FAILED' ? 'danger' : 'info'} /></td>
                        <td className="px-3 py-2.5"><StatusBadge label={experiment.final_verdict ?? 'PENDING'} tone={experiment.final_verdict === 'PASS' ? 'success' : experiment.final_verdict === 'FAIL' ? 'danger' : 'neutral'} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">No experiment history available.</div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
