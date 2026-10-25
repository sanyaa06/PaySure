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
  payment_id?: string;
  amount: number;
  currency: string;
  status: string;
  idempotency_key: string;
  captured_amount: number;
  refunded_amount: number;
  client_id?: string | null;
  request_hash?: string | null;
  created_at: string;
  updated_at: string;
  message?: string;
}

export interface PaymentEventRecord {
  id: string;
  payment_id: string;
  event_type: string;
  previous_status?: string | null;
  new_status: string;
  event_metadata: Record<string, any>;
  created_at: string;
}

export interface ChaosScenario {
  id: string;
  name: string;
  description: string;
  failure_type: string;
  expected_system_response: string;
}

export interface ChaosExperimentRecord {
  id: string;
  scenario_id: string;
  status: string;
  configuration: Record<string, any>;
  started_at?: string | null;
  completed_at?: string | null;
  final_verdict?: string | null;
  related_payment_ids: string[];
  error_summary?: string | null;
  events?: ChaosEventRecord[];
  invariant_results?: ChaosInvariantRecord[];
}

export interface ChaosEventRecord {
  id: string;
  experiment_id: string;
  timestamp: string;
  event_type: string;
  description: string;
  metadata: Record<string, any>;
}

export interface ChaosInvariantRecord {
  id: string;
  experiment_id: string;
  invariant_name: string;
  expected_condition: string;
  observed_condition: string;
  verdict: string;
  evidence: Record<string, any>;
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
  recent_chaos: Array<{ id: string; scenario_id: string; status: string; final_verdict?: string | null; completed_at?: string | null }>;
  generated_at?: string;
}

export interface MonitoringLatency {
  window: string;
  p50_ms?: number | null;
  p95_ms?: number | null;
  p99_ms?: number | null;
  history: Array<{ timestamp: string; p95_ms?: number | null }>;
  note?: string;
  generated_at?: string;
}

export interface MonitoringAlert {
  id: string;
  code: string;
  severity: string;
  status: string;
  message: string;
  observed: number | string;
  threshold: number | string;
  created_at: string;
}

export interface MonitoringTimeSeriesBucket {
  timestamp: string;
  created: number;
  authorizations: number;
  captures: number;
  refunds: number;
  failed: number;
}

export interface MonitoringReliability {
  processor_success_rate?: number | null;
  processor_failure_rate?: number | null;
  timeout_count: number;
  retry_count: number;
  retry_exhaustion_count: number;
  reconciliation_attempts: number;
  reconciliation_success_count: number;
  unresolved_operations: number;
  duplicate_operations_prevented: number;
  chaos_experiments_completed: number;
  chaos_invariant_failures: number;
  generated_at?: string;
}

export interface MonitoringAlertsResponse {
  items: MonitoringAlert[];
  generated_at?: string;
  summary: {
    total_alerts: number;
    active_alerts: number;
    resolved_alerts: number;
    total_transactions_sampled: number;
  };
}

export interface ProcessorOverviewRecord {
  processor_id: string;
  display_name: string;
  status: string;
  availability: number;
  success_rate: number;
  latency_ms: number;
  supported_currencies: string[];
  supported_operations: string[];
  last_health_check?: string | null;
}

export interface RoutingPolicyRecord {
  policy: string;
  name: string;
  description: string;
}

export interface RoutingDecisionRecord {
  id: string;
  payment_id: string;
  logical_operation_id: string;
  processor_id: string;
  routing_policy: string;
  selection_reason: string;
  observed_processor_health?: string | null;
  estimated_latency_ms?: number | null;
  outcome?: string | null;
  actual_latency_ms?: number | null;
  created_at: string;
}

export interface RoutingMetricRecord {
  total_decisions: number;
  processors: ProcessorOverviewRecord[];
  policies: string[];
  benchmark: Record<string, any>;
}

export interface RoutingSimulationRecord {
  scenario: string;
  benchmark: Record<string, any>;
  processors: ProcessorOverviewRecord[];
}

export interface PaymentListResponse {
  items: PaymentRecord[];
  total: number;
  limit: number;
  offset: number;
}

export interface ChaosListResponse {
  items: ChaosExperimentRecord[];
  total: number;
  limit: number;
  offset: number;
}
