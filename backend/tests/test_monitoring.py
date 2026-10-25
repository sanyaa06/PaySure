import uuid
from datetime import datetime, timedelta, timezone

from app.models.payment import Payment
from app.models.processor_attempt import ProcessorAttempt


def test_monitoring_summary_returns_real_counts(client, db_session):
    db_session.add(Payment(
        amount=1000,
        currency="USD",
        status="CREATED",
        idempotency_key="monitoring-created",
        client_id="demo-client",
    ))
    db_session.add(Payment(
        amount=2500,
        currency="USD",
        status="AUTHORIZED",
        idempotency_key="monitoring-authorized",
        client_id="demo-client",
    ))
    db_session.add(Payment(
        amount=2500,
        currency="USD",
        status="CAPTURED",
        idempotency_key="monitoring-captured",
        client_id="demo-client",
        captured_amount=2500,
    ))
    db_session.commit()

    response = client.get('/api/v1/monitoring/summary')
    assert response.status_code == 200
    body = response.json()
    assert body['total_payments'] >= 3
    assert 'payments_by_status' in body
    assert body['payments_by_status'].get('CREATED', 0) >= 1


def test_metrics_endpoint_exposes_prometheus_metrics(client):
    response = client.get('/metrics')
    assert response.status_code == 200
    content = response.text
    assert 'paysure_http_requests_total' in content
    assert 'paysure_payment_operations_total' in content
    assert 'paysure_routing_decisions_total' in content
    assert 'paysure_processor_attempts_total' in content
    assert 'paysure_circuit_breaker_transitions_total' in content


def test_stuck_operations_detects_stale_created_payment(client, db_session):
    stale = Payment(
        amount=900,
        currency="USD",
        status="CREATED",
        idempotency_key="stale-created",
        client_id="demo-client",
        created_at=datetime.now(timezone.utc) - timedelta(minutes=5),
    )
    db_session.add(stale)
    db_session.commit()

    response = client.get('/api/v1/monitoring/stuck-operations')
    assert response.status_code == 200
    body = response.json()
    assert len(body['items']) >= 1
    assert body['items'][0]['current_state'] == 'CREATED'


def test_reliability_endpoints_use_real_data(client, db_session):
    db_session.add(ProcessorAttempt(
        payment_id=uuid.uuid4(),
        processor_id='primary',
        status='TIMEOUT',
        error_code='READ_TIMEOUT',
        started_at=datetime.now(timezone.utc) - timedelta(minutes=2),
        completed_at=datetime.now(timezone.utc),
    ))
    db_session.commit()

    response = client.get('/api/v1/monitoring/reliability')
    assert response.status_code == 200
    body = response.json()
    assert body['timeout_count'] >= 1 or body['processor_failure_rate'] is not None


def test_monitoring_timeseries_aggregates_actual_payment_volume(client, db_session):
    now = datetime.now(timezone.utc)
    for index in range(3):
        db_session.add(Payment(
            amount=1500 + index,
            currency='USD',
            status='CREATED' if index % 2 == 0 else 'AUTHORIZED',
            idempotency_key=f'timeseries-{index}',
            client_id='demo-client',
            created_at=now - timedelta(minutes=25 + index),
        ))
    db_session.commit()

    response = client.get('/api/v1/monitoring/transactions/timeseries?window=1h')
    assert response.status_code == 200
    body = response.json()
    assert body['window'] == '1h'
    assert sum(item['created'] for item in body['items']) >= 3


def test_monitoring_latency_reports_percentiles(client, db_session):
    now = datetime.now(timezone.utc)
    records = [
        ('p1', 250.0),
        ('p2', 500.0),
        ('p3', 1200.0),
        ('p4', 2200.0),
        ('p5', 4200.0),
    ]
    for processor_id, ms in records:
        db_session.add(ProcessorAttempt(
            payment_id=uuid.uuid4(),
            processor_id=processor_id,
            status='SUCCESS',
            started_at=now - timedelta(seconds=10),
            completed_at=now - timedelta(milliseconds=int(1000 - ms)),
        ))
    db_session.commit()

    response = client.get('/api/v1/monitoring/latency')
    assert response.status_code == 200
    body = response.json()
    assert body['p50_ms'] is not None
    assert body['p95_ms'] is not None
    assert body['p99_ms'] is not None
    assert body['p95_ms'] >= 1200


def test_monitoring_alerts_trigger_on_real_conditions(client, db_session):
    now = datetime.now(timezone.utc)
    for index in range(6):
        db_session.add(Payment(
            amount=2000 + index,
            currency='USD',
            status='FAILED' if index >= 4 else 'CREATED',
            idempotency_key=f'alert-{index}',
            client_id='demo-client',
            created_at=now - timedelta(minutes=15),
        ))
    db_session.commit()

    response = client.get('/api/v1/monitoring/alerts')
    assert response.status_code == 200
    body = response.json()
    alert_types = {item['code'] for item in body['items']}
    assert 'high_failure_rate' in alert_types or 'high_p95_latency' in alert_types or 'unresolved_operations' in alert_types


def test_monitoring_handles_empty_data_gracefully(client):
    response = client.get('/api/v1/monitoring/summary')
    assert response.status_code == 200
    body = response.json()
    assert body['total_payments'] == 0

    latency_response = client.get('/api/v1/monitoring/latency')
    assert latency_response.status_code == 200
    latency_body = latency_response.json()
    assert latency_body['p50_ms'] is None
    assert latency_body['p95_ms'] is None
    assert latency_body['p99_ms'] is None
