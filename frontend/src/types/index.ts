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

export interface ChaosScenario {
  id: string;
  name: string;
  description: string;
  failure_type: string;
  expected_system_response: string;
}

export interface ChaosExperimentConfig {
  scenario_id: string;
  target_operation?: string;
  delay_ms?: number;
  repetition_count?: number;
  concurrency_level?: number;
  maximum_attempts?: number;
  random_seed?: number | null;
}

export interface ChaosExperimentEventRecord {
  id: string;
  experiment_id: string;
  timestamp: string;
  event_type: string;
  description: string;
  metadata: Record<string, unknown>;
}

export interface ChaosInvariantResultRecord {
  id: string;
  experiment_id: string;
  invariant_name: string;
  expected_condition: string;
  observed_condition: string;
  verdict: string;
  evidence: Record<string, unknown>;
}

export interface ChaosExperimentRecord {
  id: string;
  scenario_id: string;
  status: string;
  configuration: Record<string, unknown>;
  started_at?: string | null;
  completed_at?: string | null;
  final_verdict?: string | null;
  related_payment_ids: string[];
  error_summary?: string | null;
  events?: ChaosExperimentEventRecord[];
  invariant_results?: ChaosInvariantResultRecord[];
}

export interface ChaosExperimentListResponse {
  items: ChaosExperimentRecord[];
  total: number;
  limit: number;
  offset: number;
}

export interface MonitoringSummary {
  total_payments: number;
  payments_by_status: Record<string, number>;
  total_authorized_payments: number;
  total_captured_payments: number;
  total_refunded_payments: number;
  total_failed_payments: number;
  unresolved_processor_operations: number;
  completed_chaos_experiments: number;
  failed_chaos_experiments: number;
  recent_chaos: Array<{
    id: string;
    scenario_id: string;
    status: string;
    final_verdict?: string | null;
    completed_at?: string | null;
  }>;
  generated_at: string;
}

export interface MonitoringTimeseriesItem {
  timestamp: string;
  created: number;
  authorizations: number;
  captures: number;
  refunds: number;
  failed: number;
}

export interface MonitoringLatencyResponse {
  window: string;
  p50_ms: number | null;
  p95_ms: number | null;
  p99_ms: number | null;
  history: Array<{ timestamp: string; p95_ms: number | null }>;
  note: string;
  generated_at: string;
}

export interface MonitoringReliabilityResponse {
  processor_success_rate: number | null;
  processor_failure_rate: number | null;
  timeout_count: number;
  retry_count: number;
  retry_exhaustion_count: number;
  reconciliation_attempts: number;
  reconciliation_success_count: number;
  unresolved_operations: number;
  duplicate_operations_prevented: number;
  chaos_experiments_completed: number;
  chaos_invariant_failures: number;
  generated_at: string;
}

export interface MonitoringAlertItem {
  id: string;
  code: string;
  severity: 'info' | 'warning' | 'critical';
  status: 'active' | 'resolved';
  message: string;
  observed: number | string | null;
  threshold: number | string | null;
  created_at: string;
}

export interface MonitoringAlertResponse {
  items: MonitoringAlertItem[];
  summary: {
    total_alerts: number;
    active_alerts: number;
    resolved_alerts: number;
    total_transactions_sampled: number;
  };
  generated_at: string;
}

export interface MonitoringStuckOperation {
  operation_id: string;
  related_payment_id: string;
  current_state: string;
  time_in_current_state_seconds: number;
  reason_flagged: string;
  last_activity_timestamp: string;
}

export interface MonitoringDashboardData {
  summary: MonitoringSummary;
  timeseries: { window: string; bucket_size: string; items: MonitoringTimeseriesItem[] };
  reliability: MonitoringReliabilityResponse;
  latency: MonitoringLatencyResponse;
  stuck: { items: MonitoringStuckOperation[]; generated_at: string };
  alerts: MonitoringAlertResponse;
}

