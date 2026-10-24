import React from 'react';
import { Activity } from 'lucide-react';
import { EmptyState } from '../components/EmptyState';

export const MonitoringPage: React.FC = () => {
  return (
    <div className="space-y-6 max-w-6xl">
      <EmptyState
        icon={Activity}
        title="Observability Engine Waiting for Traffic"
        description="Real-time transaction telemetry, P95/P99 latency distribution histograms, idempotency collision rates, and SLA error budget tracking will be introduced in Phase 6."
        phaseNotice="Phase 6: Observability, Metrics & Telemetry"
        details={[
          { label: "Latency Metrics", value: "Prometheus histogram buckets for authorization & capture" },
          { label: "Collision Tracking", value: "Real-time rate of client idempotency deduplication" },
          { label: "SLA Burn Rate", value: "Multi-window error budget burn rate alerting" },
          { label: "Export Formats", value: "OpenTelemetry / Prometheus standard metric format" }
        ]}
      />
    </div>
  );
};
