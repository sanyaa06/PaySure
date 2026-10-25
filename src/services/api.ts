import {
  ChaosExperimentRecord,
  ChaosListResponse,
  ChaosScenario,
  HealthCheckResult,
  MonitoringAlertsResponse,
  MonitoringLatency,
  MonitoringReliability,
  MonitoringSummary,
  MonitoringTimeSeriesBucket,
  PaymentEventRecord,
  PaymentListResponse,
  PaymentRecord,
  ProcessorOverviewRecord,
  ReadinessCheckResult,
  RoutingDecisionRecord,
  RoutingMetricRecord,
  RoutingPolicyRecord,
  RoutingSimulationRecord,
} from '../types';

// Default to localhost:8000 (FastAPI dev server) or override from Vite environment
export const DEFAULT_API_BASE_URL = 
  (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:8000';

let currentApiBaseUrl = DEFAULT_API_BASE_URL;

export function getApiBaseUrl(): string {
  return currentApiBaseUrl;
}

export function setApiBaseUrl(url: string): void {
  currentApiBaseUrl = url.trim().replace(/\/+$/, '');
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { Accept: 'application/json', ...(init?.headers || {}) },
    ...init,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(detail || `${res.status} ${res.statusText}`);
  }

  return (await res.json()) as T;
}

export async function checkBackendHealth(): Promise<HealthCheckResult> {
  const start = performance.now();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const res = await fetch(`${currentApiBaseUrl}/health`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const latencyMs = Math.round(performance.now() - start);

    if (res.ok) {
      const data = await res.json();
      return {
        status: 'healthy',
        version: data.version,
        environment: data.environment,
        timestamp: data.timestamp,
        latencyMs,
      };
    } else {
      return {
        status: 'unhealthy',
        latencyMs,
        error: `HTTP ${res.status}: ${res.statusText}`,
      };
    }
  } catch (err: any) {
    const latencyMs = Math.round(performance.now() - start);
    return {
      status: 'unreachable',
      latencyMs,
      error: err.name === 'AbortError' 
        ? 'Connection timed out after 4000ms'
        : (err.message || 'Unable to connect to backend server'),
    };
  }
}

export async function checkBackendReadiness(): Promise<ReadinessCheckResult> {
  const start = performance.now();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const res = await fetch(`${currentApiBaseUrl}/ready`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const latencyMs = Math.round(performance.now() - start);
    const data = await res.json().catch(() => ({}));

    if (res.ok) {
      return {
        status: 'ready',
        database: data.database || 'connected',
        timestamp: data.timestamp,
        latencyMs,
      };
    } else {
      return {
        status: 'unready',
        database: data.database || 'disconnected',
        timestamp: data.timestamp,
        latencyMs,
        error: data.error || `HTTP ${res.status} returned from readiness probe`,
      };
    }
  } catch (err: any) {
    const latencyMs = Math.round(performance.now() - start);
    return {
      status: 'unreachable',
      database: 'disconnected',
      latencyMs,
      error: err.name === 'AbortError'
        ? 'Connection timed out after 4000ms'
        : (err.message || 'Backend service unreachable'),
    };
  }
}

export async function fetchPaymentList(status?: string): Promise<PaymentListResponse> {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  params.set('limit', '20');
  params.set('offset', '0');
  return fetchJson<PaymentListResponse>(`${currentApiBaseUrl}/api/v1/payments?${params.toString()}`);
}

export async function createPayment(payload: Record<string, unknown>): Promise<PaymentRecord> {
  return fetchJson<PaymentRecord>(`${currentApiBaseUrl}/api/v1/payments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function fetchPaymentEvents(paymentId: string): Promise<PaymentEventRecord[]> {
  return fetchJson<PaymentEventRecord[]>(`${currentApiBaseUrl}/api/v1/payments/${paymentId}/events`);
}

export async function refundPayment(paymentId: string, payload: Record<string, unknown>): Promise<PaymentRecord> {
  return fetchJson<PaymentRecord>(`${currentApiBaseUrl}/api/v1/payments/${paymentId}/refund`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function cancelPayment(paymentId: string): Promise<PaymentRecord> {
  return fetchJson<PaymentRecord>(`${currentApiBaseUrl}/api/v1/payments/${paymentId}/cancel`, {
    method: 'POST',
  });
}

export async function fetchChaosScenarios(): Promise<ChaosScenario[]> {
  return fetchJson<ChaosScenario[]>(`${currentApiBaseUrl}/api/v1/chaos/scenarios`);
}

export async function fetchChaosHistory(limit = 10): Promise<ChaosListResponse> {
  return fetchJson<ChaosListResponse>(`${currentApiBaseUrl}/api/v1/chaos/experiments?limit=${limit}&offset=0`);
}

export async function createChaosExperiment(payload: Record<string, unknown>): Promise<ChaosExperimentRecord> {
  return fetchJson<ChaosExperimentRecord>(`${currentApiBaseUrl}/api/v1/chaos/experiments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function fetchChaosExperiment(id: string): Promise<ChaosExperimentRecord> {
  return fetchJson<ChaosExperimentRecord>(`${currentApiBaseUrl}/api/v1/chaos/experiments/${id}`);
}

export async function fetchMonitoringSummary(): Promise<MonitoringSummary> {
  return fetchJson<MonitoringSummary>(`${currentApiBaseUrl}/api/v1/monitoring/summary`);
}

export async function fetchMonitoringLatency(): Promise<MonitoringLatency> {
  return fetchJson<MonitoringLatency>(`${currentApiBaseUrl}/api/v1/monitoring/latency`);
}

export async function fetchMonitoringReliability(): Promise<MonitoringReliability> {
  return fetchJson<MonitoringReliability>(`${currentApiBaseUrl}/api/v1/monitoring/reliability`);
}

export async function fetchMonitoringTimeseries(window: string = '24h'): Promise<{ window: string; items: MonitoringTimeSeriesBucket[] }> {
  return fetchJson<{ window: string; items: MonitoringTimeSeriesBucket[] }>(`${currentApiBaseUrl}/api/v1/monitoring/transactions/timeseries?window=${window}`);
}

export async function fetchMonitoringAlerts(): Promise<MonitoringAlertsResponse> {
  return fetchJson<MonitoringAlertsResponse>(`${currentApiBaseUrl}/api/v1/monitoring/alerts`);
}

export async function fetchMonitoringHealth(): Promise<{ status: string; database: string; last_successful_refresh?: string }> {
  return fetchJson<{ status: string; database: string; last_successful_refresh?: string }>(`${currentApiBaseUrl}/api/v1/monitoring/health`);
}

export async function fetchProcessorPolicies(): Promise<RoutingPolicyRecord[]> {
  return fetchJson<RoutingPolicyRecord[]>(`${currentApiBaseUrl}/api/v1/routing/policies`);
}

export async function fetchProcessorOverview(): Promise<ProcessorOverviewRecord[]> {
  return fetchJson<ProcessorOverviewRecord[]>(`${currentApiBaseUrl}/api/v1/routing/processors`);
}

export async function fetchRoutingDecisions(limit = 20, offset = 0): Promise<RoutingDecisionRecord[]> {
  return fetchJson<RoutingDecisionRecord[]>(`${currentApiBaseUrl}/api/v1/routing/decisions?limit=${limit}&offset=${offset}`);
}

export async function fetchRoutingMetrics(): Promise<RoutingMetricRecord> {
  return fetchJson<RoutingMetricRecord>(`${currentApiBaseUrl}/api/v1/routing/metrics`);
}

export async function runRoutingSimulation(scenario = 'all_healthy', iterations = 25): Promise<RoutingSimulationRecord> {
  return fetchJson<RoutingSimulationRecord>(`${currentApiBaseUrl}/api/v1/routing/simulations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scenario, iterations }),
  });
}
