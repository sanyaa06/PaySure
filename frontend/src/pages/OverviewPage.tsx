import React, { useState } from 'react';
import { 
  CheckCircle2, 
  Layers, 
  Database, 
  GitBranch, 
  Server, 
  Terminal, 
  ShieldAlert,
  ArrowRight,
  Code
} from 'lucide-react';
import { HealthCheckResult, ReadinessCheckResult, PaymentStatus } from '../types';
import { getApiBaseUrl, setApiBaseUrl } from '../services/api';

interface OverviewPageProps {
  health: HealthCheckResult;
  readiness: ReadinessCheckResult;
  isChecking: boolean;
  onRefreshProbes: () => void;
}

export const OverviewPage: React.FC<OverviewPageProps> = ({
  health,
  readiness,
  isChecking,
  onRefreshProbes,
}) => {
  const [activeState, setActiveState] = useState<PaymentStatus>('CREATED');
  const [apiUrlInput, setApiUrlInput] = useState(getApiBaseUrl());

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

  return (
    <div className="space-y-8 max-w-6xl">
      {/* Platform Executive Banner */}
      <div className="p-6 bg-white border border-slate-200 rounded-lg shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-teal-700 mb-1">
              <span>Phase 1 Verified Foundation</span>
              <span className="text-slate-300" aria-hidden="true">·</span>
              <span>Modular Monolith</span>
            </div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              PaySure Payment Reliability &amp; Monitoring Platform
            </h1>
            <p className="text-sm text-slate-600 mt-1 max-w-2xl leading-relaxed">
              Engineered to demonstrate enterprise-grade correctness, idempotency, and observability under network failures, processor timeouts, and concurrent race conditions.
            </p>
          </div>

          <div className="shrink-0 p-3 bg-slate-50 border border-slate-200 rounded text-xs space-y-1">
            <div className="text-slate-500 font-medium">Compliance Boundary:</div>
            <div className="font-semibold text-slate-800 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-teal-600" />
              <span>Zero Cardholder Data (PCI DSS Scoped)</span>
            </div>
            <div className="text-slate-400 text-[11px]">All payments, gateways, and cards are simulated.</div>
          </div>
        </div>

        {/* System Spec Badges */}
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
            <span className="text-slate-400 block">Test Harness</span>
            <span className="font-semibold text-slate-800">pytest / HTTPX Client</span>
          </div>
        </div>
      </div>

      {/* Grid: Live Connection Diagnostics + Architecture Models */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Backend & DB Health Probe Card */}
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

            <p className="text-xs text-slate-600 mb-4 leading-relaxed">
              PaySure connects to the FastAPI backend to query the active liveness (<code className="bg-slate-100 px-1 py-0.5 rounded text-slate-700 font-mono">/health</code>) and readiness (<code className="bg-slate-100 px-1 py-0.5 rounded text-slate-700 font-mono">/ready</code>) probes.
            </p>

            {/* Probe Metrics Rows */}
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
                  <span className={`inline-block font-semibold ${
                    health.status === 'healthy' ? 'text-teal-700' : 'text-slate-500'
                  }`}>
                    {health.status === 'healthy' ? '200 OK' : 'Offline'}
                  </span>
                  {health.latencyMs !== undefined && (
                    <span className="block text-[10px] text-slate-400 font-mono tabular-nums">
                      {health.latencyMs}ms
                    </span>
                  )}
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded border border-slate-100 flex items-center justify-between">
                <div>
                  <span className="font-medium text-slate-800 block">Readiness Probe (/ready)</span>
                  <span className="text-slate-500 font-mono text-[11px]">
                    {readiness.status === 'ready' 
                      ? `PostgreSQL: ${readiness.database}` 
                      : readiness.error || 'Database ping (SELECT 1) failed'}
                  </span>
                </div>
                <div className="text-right">
                  <span className={`inline-block font-semibold ${
                    readiness.status === 'ready' ? 'text-teal-700' : 'text-slate-500'
                  }`}>
                    {readiness.status === 'ready' ? 'Ready' : 'Not Connected'}
                  </span>
                  {readiness.latencyMs !== undefined && (
                    <span className="block text-[10px] text-slate-400 font-mono tabular-nums">
                      {readiness.latencyMs}ms
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Backend URL Configuration Form */}
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
              Run <code className="text-slate-600 font-mono">docker compose up</code> or <code className="text-slate-600 font-mono">uvicorn backend.app.main:app</code> locally to connect.
            </span>
          </form>
        </div>

        {/* Database Relational Models Overview */}
        <div className="p-6 bg-white border border-slate-200 rounded-lg shadow-xs">
          <div className="flex items-center gap-2 mb-4">
            <Database className="w-4 h-4 text-teal-600" />
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
              Relational Schema Architecture
            </h2>
          </div>

          <div className="space-y-3 text-xs">
            {/* Payment Model */}
            <div className="p-3 rounded bg-slate-50 border border-slate-100">
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-slate-800">1. Payment Entity</span>
                <span className="font-mono text-[10px] text-slate-500">payments</span>
              </div>
              <p className="text-slate-600 mb-2 leading-relaxed">
                Primary financial entity with UUID primary key, integer minor units (<code className="font-mono text-slate-700">amount &gt; 0</code>), ISO 4217 currency, scoped idempotency key, and cumulative refund tracking.
              </p>
              <div className="text-[11px] text-slate-400 font-mono flex flex-wrap gap-x-3 gap-y-0.5">
                <span>id: UUID</span>
                <span>amount: BIGINT</span>
                <span>status: VARCHAR(32)</span>
                <span>idempotency_key: UK</span>
              </div>
            </div>

            {/* PaymentEvent Model */}
            <div className="p-3 rounded bg-slate-50 border border-slate-100">
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-slate-800">2. PaymentEvent (Audit Ledger)</span>
                <span className="font-mono text-[10px] text-slate-500">payment_events</span>
              </div>
              <p className="text-slate-600 mb-2 leading-relaxed">
                Immutable, append-only ledger tracking every state mutation, previous status, new status, and JSONB diagnostic metadata.
              </p>
              <div className="text-[11px] text-slate-400 font-mono flex flex-wrap gap-x-3 gap-y-0.5">
                <span>payment_id: FK</span>
                <span>event_type: VARCHAR(64)</span>
                <span>event_metadata: JSONB</span>
              </div>
            </div>

            {/* ProcessorAttempt Model */}
            <div className="p-3 rounded bg-slate-50 border border-slate-100">
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-slate-800">3. ProcessorAttempt (Gateway Log)</span>
                <span className="font-mono text-[10px] text-slate-500">processor_attempts</span>
              </div>
              <p className="text-slate-600 mb-2 leading-relaxed">
                Tracks outbound gateway attempts, processor latency, downstream timeouts, and error codes without prematurely marking the payment as failed.
              </p>
              <div className="text-[11px] text-slate-400 font-mono flex flex-wrap gap-x-3 gap-y-0.5">
                <span>processor_id: VARCHAR</span>
                <span>status: PENDING | TIMEOUT</span>
                <span>error_code</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Payment State Machine Inspector */}
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

        {/* State Selection Tabs */}
        <div className="flex flex-wrap gap-1.5 mb-6 p-1 bg-slate-100 rounded-md">
          {(Object.keys(stateDefinitions) as PaymentStatus[]).map((state) => {
            const isSelected = activeState === state;
            const def = stateDefinitions[state];
            return (
              <button
                key={state}
                onClick={() => setActiveState(state)}
                className={`px-3 py-1.5 text-xs font-mono rounded transition-colors whitespace-nowrap ${
                  isSelected
                    ? 'bg-white text-slate-900 font-bold shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>{state}</span>
                {def.isTerminal && (
                  <span className="ml-1.5 text-[9px] text-slate-400 font-sans uppercase">
                    Terminal
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Active State Details Panel */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs p-4 bg-slate-50 rounded-lg border border-slate-100">
          <div>
            <span className="font-semibold text-slate-700 block mb-1 uppercase tracking-wider text-[11px]">
              State Description
            </span>
            <p className="text-slate-600 leading-relaxed">
              {stateDefinitions[activeState].description}
            </p>
            <div className="mt-3">
              <span className="text-[11px] text-slate-500 font-medium block">Transition Trigger:</span>
              <span className="font-mono text-slate-700 text-[11px]">
                {stateDefinitions[activeState].trigger}
              </span>
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
              <li>Refund calculation enforces cumulative refund $\le$ captured amount.</li>
              <li>Timeouts on processors do NOT set payment to <code className="font-mono">FAILED</code>.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
