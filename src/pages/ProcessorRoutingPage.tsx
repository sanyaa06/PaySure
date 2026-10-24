import React from 'react';
import { GitFork } from 'lucide-react';
import { EmptyState } from '../components/EmptyState';

export const ProcessorRoutingPage: React.FC = () => {
  return (
    <div className="space-y-6 max-w-6xl">
      <EmptyState
        icon={GitFork}
        title="Processor Routing Rules Not Configured"
        description="Smart multi-processor routing, fee-optimization logic, and automated health-checked failover between simulated gateway endpoints will be introduced in Phase 7."
        phaseNotice="Phase 7: Multi-Processor Routing & Smart Fallback"
        details={[
          { label: "Routing Strategy", value: "Priority, round-robin, and lowest-latency dispatch" },
          { label: "Active Probing", value: "Continuous synthetic heartbeat across processors" },
          { label: "Degradation Fallback", value: "Automatic rerouting away from degraded routes" },
          { label: "Simulated Processors", value: "Visa Direct, Mastercard Send, and Sandbox Gateways" }
        ]}
      />
    </div>
  );
};
