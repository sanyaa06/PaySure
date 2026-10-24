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

export interface PaymentRecord {
  id: string;
  payment_id: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  idempotency_key: string;
  captured_amount: number;
  refunded_amount: number;
  client_id?: string | null;
  request_hash?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PaymentEventRecord {
  id: string;
  payment_id: string;
  event_type: string;
  previous_status?: PaymentStatus | null;
  new_status: PaymentStatus;
  event_metadata: Record<string, unknown>;
  created_at: string;
}

export interface PaymentListResponse {
  items: PaymentRecord[];
  total: number;
  limit: number;
  offset: number;
}

export interface CreatePaymentInput {
  amount: number;
  currency: string;
  idempotency_key: string;
  client_id?: string | null;
}

export interface AuthorizePaymentInput {
  processor_outcome?: 'APPROVED' | 'DECLINED';
}

export interface RefundPaymentInput {
  amount: number;
}
