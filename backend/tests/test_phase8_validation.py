import uuid

from app.services.processor_router import build_default_processors, benchmark_routing_strategies


def test_phase8_benchmark_reports_per_policy_summary():
    benchmark = benchmark_routing_strategies(build_default_processors(), iterations=20, concurrency=4)

    assert set(benchmark).issuperset({"round_robin", "lowest_latency", "reliability_aware"})
    for policy, result in benchmark.items():
        assert "summary" in result
        assert result["summary"]["total_requests"] >= 1
        assert result["summary"]["success_rate"] >= 0.0
        assert result["summary"]["average_latency_ms"] >= 0.0
        assert result["summary"]["failover_count"] >= 0


def test_phase8_benchmark_keeps_safe_failover_guard_in_summary():
    benchmark = benchmark_routing_strategies(build_default_processors(), iterations=12, concurrency=2)

    for policy, result in benchmark.items():
        assert "safe_failover_guard" in result
        assert result["safe_failover_guard"] in {True, False}
        assert "guard_reason" in result
