import React from 'react';
import { Flame } from 'lucide-react';
import { EmptyState } from '../components/EmptyState';

export const ChaosLabPage: React.FC = () => {
  return (
    <div className="space-y-6 max-w-6xl">
      <EmptyState
        icon={Flame}
        title="Chaos Engineering Lab Offline"
        description="Automated fault injection is currently deactivated. Synthetic network latency, jitter, packet drop, and simulated downstream processor timeouts will be unlocked in Phase 5."
        phaseNotice="Phase 5: Automated Fault Injection (Chaos Lab)"
        details={[
          { label: "Latency Simulation", value: "Configurable p50, p95, p99 network delay curves" },
          { label: "Packet Drop", value: "Simulate TCP reset, connection dropped mid-flight" },
          { label: "Processor Timeout", value: "Downstream read timeout to test double-charge prevention" },
          { label: "Circuit Breakers", value: "Automated failover trips on sustained gateway failure" }
        ]}
      />
    </div>
  );
};
