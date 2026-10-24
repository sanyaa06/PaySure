import { HealthCheckResult, ReadinessCheckResult } from '../types';

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
