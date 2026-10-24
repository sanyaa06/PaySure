export type NavigationTab = 
  | 'overview'
  | 'transactions'
  | 'chaos-lab'
  | 'monitoring'
  | 'processor-routing'
  | 'settings';

export interface HealthCheckResult {
  status: 'healthy' | 'unhealthy' | 'checking' | 'unreachable';
  version?: string;
  environment?: string;
  timestamp?: string;
  latencyMs?: number;
  error?: string;
}

export interface ReadinessCheckResult {
  status: 'ready' | 'unready' | 'checking' | 'unreachable';
  database?: string;
  timestamp?: string;
  latencyMs?: number;
  error?: string;
}

export type PaymentStatus = 
  | 'CREATED'
  | 'AUTHORIZED'
  | 'CAPTURED'
  | 'FAILED'
  | 'CANCELLED'
  | 'PARTIALLY_REFUNDED'
  | 'REFUNDED';
