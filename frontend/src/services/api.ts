import {
  AuthorizePaymentInput,
  CreatePaymentInput,
  HealthCheckResult,
  PaymentEventRecord,
  ChaosExperimentListResponse,
  ChaosExperimentRecord,
  ChaosScenario,
  MonitoringDashboardData,
  PaymentListResponse,
  PaymentRecord,
  ReadinessCheckResult,
  RefundPaymentInput,
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

function parseErrorMessage(payload: any): string {
  if (!payload) {
    return 'Request failed.';
  }

  if (typeof payload.detail === 'string') {
    return payload.detail;
  }

  if (Array.isArray(payload.detail)) {
    return payload.detail
      .map((item: any) => item.msg || item.error || JSON.stringify(item))
      .join('; ');
  }

  if (payload.message) {
    return payload.message;
  }

  if (payload.error_code) {
    return `${payload.error_code}: ${payload.message || 'Request failed.'}`;
  }

  if (payload.errors) {
    return Array.isArray(payload.errors)
      ? payload.errors.map((item: any) => item.msg || JSON.stringify(item)).join('; ')
      : JSON.stringify(payload.errors);
  }

  return 'Request failed.';
}

async function requestJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${currentApiBaseUrl}${path}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  let payload: any = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { raw: text };
    }
  }

  if (!response.ok) {
    throw new Error(parseErrorMessage(payload));
  }

  return payload as T;
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

export async function getMonitoringDashboard(): Promise<MonitoringDashboardData> {
  const [summary, timeseries, reliability, latency, stuck, alerts] = await Promise.all([
    requestJson<any>('/api/v1/monitoring/summary'),
    requestJson<any>('/api/v1/monitoring/transactions/timeseries?window=24h'),
    requestJson<any>('/api/v1/monitoring/reliability'),
    requestJson<any>('/api/v1/monitoring/latency'),
    requestJson<any>('/api/v1/monitoring/stuck-operations'),
    requestJson<any>('/api/v1/monitoring/alerts'),
  ]);

  return {
    summary,
    timeseries,
    reliability,
    latency,
    stuck,
    alerts,
  };
}

export async function listPayments(params: { status?: string; limit?: number; offset?: number } = {}): Promise<PaymentListResponse> {
  const query = new URLSearchParams();

  if (params.status) {
    query.set('status', params.status);
  }
  if (params.limit) {
    query.set('limit', String(params.limit));
  }
  if (params.offset) {
    query.set('offset', String(params.offset));
  }

  const queryString = query.toString();
  return requestJson<PaymentListResponse>(`/api/v1/payments${queryString ? `?${queryString}` : ''}`);
}

export async function createPayment(payload: CreatePaymentInput): Promise<PaymentRecord> {
  return requestJson<PaymentRecord>('/api/v1/payments', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function getPayment(paymentId: string): Promise<PaymentRecord> {
  return requestJson<PaymentRecord>(`/api/v1/payments/${paymentId}`);
}

export async function authorizePayment(paymentId: string, payload: AuthorizePaymentInput = { processor_outcome: 'APPROVED' }): Promise<PaymentRecord> {
  return requestJson<PaymentRecord>(`/api/v1/payments/${paymentId}/authorize`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function capturePayment(paymentId: string): Promise<PaymentRecord> {
  return requestJson<PaymentRecord>(`/api/v1/payments/${paymentId}/capture`, {
    method: 'POST',
  });
}

export async function cancelPayment(paymentId: string): Promise<PaymentRecord> {
  return requestJson<PaymentRecord>(`/api/v1/payments/${paymentId}/cancel`, {
    method: 'POST',
  });
}

export async function refundPayment(paymentId: string, payload: RefundPaymentInput): Promise<PaymentRecord> {
  return requestJson<PaymentRecord>(`/api/v1/payments/${paymentId}/refund`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function getPaymentEvents(paymentId: string): Promise<PaymentEventRecord[]> {
  return requestJson<PaymentEventRecord[]>(`/api/v1/payments/${paymentId}/events`);
}

export async function listChaosScenarios(): Promise<ChaosScenario[]> {
  return requestJson<ChaosScenario[]>('/api/v1/chaos/scenarios');
}

export async function listChaosExperiments(limit = 20, offset = 0): Promise<ChaosExperimentListResponse> {
  return requestJson<ChaosExperimentListResponse>(`/api/v1/chaos/experiments?limit=${limit}&offset=${offset}`);
}

export async function createChaosExperiment(payload: Record<string, unknown>): Promise<ChaosExperimentRecord> {
  return requestJson<ChaosExperimentRecord>('/api/v1/chaos/experiments', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function getChaosExperiment(experimentId: string): Promise<ChaosExperimentRecord> {
  return requestJson<ChaosExperimentRecord>(`/api/v1/chaos/experiments/${experimentId}`);
}

