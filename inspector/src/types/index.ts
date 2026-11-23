export interface AnchorInfo {
  home_domain: string;
  network_passphrase: string;
  signing_public_key: string;
}

export interface OverviewCounts {
  sep12_customers: number;
  sep38_quotes: number;
  sep24_transactions: number;
  webhook_subscriptions: number;
  webhook_deliveries: number;
  buffered_requests: number;
}

export interface ChaosStats {
  total_inspected: number;
  injected_errors: number;
  injected_delays: number;
}

export interface ChaosSnapshot {
  enabled: boolean;
  target_prefix: string;
  latency_ms: number;
  error_rate: number;
  error_status: number;
  error_message: string;
  corrupt_json: boolean;
  stats: ChaosStats;
}

export interface ChaosConfigUpdate {
  enabled: boolean;
  target_prefix: string;
  latency_ms: number;
  error_rate: number;
  error_status: number;
  error_message: string;
  corrupt_json: boolean;
}

export interface AdminOverview {
  anchor: AnchorInfo;
  counts: OverviewCounts;
  chaos: ChaosSnapshot;
}

export interface TrafficEvent {
  id: string;
  timestamp: string;
  method: string;
  path: string;
  query: string;
  status_code: number;
  duration_ms: number;
  chaos_injected: boolean;
}

export interface TrafficLogResponse {
  events: TrafficEvent[];
  count: number;
  total_buffered: number;
  capacity: number;
}

export interface WebhookSubscription {
  id: string;
  url: string;
  events: string[];
  enabled: boolean;
  created_at: string;
  secret_preview?: string;
  secret?: string;
}

export interface WebhookDelivery {
  id: string;
  subscription_id: string;
  event_type: string;
  transaction_id: string;
  signature: string;
  status: "delivered" | "failed" | string;
  http_status: number | null;
  response_body: string | null;
  attempts: number;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface ProbeResult {
  url: string;
  status: number;
  statusText: string;
  durationMs: number;
  headers: Record<string, string>;
  body: string;
  isJson: boolean;
  timestamp: string;
  error?: string;
}

export interface HealthResponse {
  status: string;
  database: string;
  home_domain: string;
  stellar_network: string;
  anchor_signing_public_key: string;
}
