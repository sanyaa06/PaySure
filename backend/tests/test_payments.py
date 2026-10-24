import uuid

import pytest


def test_create_payment_success(client):
    payload = {
        "amount": 150000,
        "currency": "INR",
        "idempotency_key": "demo-payment-001",
    }
    response = client.post("/api/v1/payments", json=payload)
    assert response.status_code == 201, response.text
    data = response.json()
    assert data["amount"] == 150000
    assert data["currency"] == "INR"
    assert data["status"] == "CREATED"
    assert data["idempotency_key"] == "demo-payment-001"
    assert data["payment_id"]


def test_create_payment_invalid_amount(client):
    response = client.post("/api/v1/payments", json={
        "amount": 0,
        "currency": "USD",
        "idempotency_key": "invalid-amount",
    })
    assert response.status_code == 422, response.text


def test_create_payment_unsupported_currency(client):
    response = client.post("/api/v1/payments", json={
        "amount": 1000,
        "currency": "GBP",
        "idempotency_key": "unsupported-currency",
    })
    assert response.status_code == 422, response.text


def test_duplicate_idempotency_key_rejected(client):
    payload = {"amount": 2000, "currency": "USD", "idempotency_key": "dup-key"}
    first = client.post("/api/v1/payments", json=payload)
    assert first.status_code == 201
    second = client.post("/api/v1/payments", json={**payload, "amount": 3000})
    assert second.status_code == 409, second.text


def test_authorize_payment_success(client):
    create = client.post("/api/v1/payments", json={
        "amount": 120000,
        "currency": "USD",
        "idempotency_key": "auth-001",
    })
    payment_id = create.json()["payment_id"]
    response = client.post(f"/api/v1/payments/{payment_id}/authorize", json={"processor_outcome": "APPROVED"})
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "AUTHORIZED"


def test_authorize_payment_declined(client):
    create = client.post("/api/v1/payments", json={
        "amount": 120000,
        "currency": "EUR",
        "idempotency_key": "auth-decline-001",
    })
    payment_id = create.json()["payment_id"]
    response = client.post(f"/api/v1/payments/{payment_id}/authorize", json={"processor_outcome": "DECLINED"})
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "FAILED"


def test_capture_payment_success(client):
    create = client.post("/api/v1/payments", json={
        "amount": 90000,
        "currency": "USD",
        "idempotency_key": "capture-001",
    })
    payment_id = create.json()["payment_id"]
    client.post(f"/api/v1/payments/{payment_id}/authorize", json={"processor_outcome": "APPROVED"})
    response = client.post(f"/api/v1/payments/{payment_id}/capture")
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["status"] == "CAPTURED"
    assert payload["captured_amount"] == 90000


def test_duplicate_capture_rejected(client):
    create = client.post("/api/v1/payments", json={
        "amount": 50000,
        "currency": "INR",
        "idempotency_key": "capture-dup",
    })
    payment_id = create.json()["payment_id"]
    client.post(f"/api/v1/payments/{payment_id}/authorize", json={"processor_outcome": "APPROVED"})
    first = client.post(f"/api/v1/payments/{payment_id}/capture")
    assert first.status_code == 200
    second = client.post(f"/api/v1/payments/{payment_id}/capture")
    assert second.status_code == 409, second.text


def test_cancel_payment_success(client):
    create = client.post("/api/v1/payments", json={
        "amount": 35000,
        "currency": "USD",
        "idempotency_key": "cancel-001",
    })
    payment_id = create.json()["payment_id"]
    response = client.post(f"/api/v1/payments/{payment_id}/cancel")
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "CANCELLED"


def test_full_refund_success(client):
    create = client.post("/api/v1/payments", json={
        "amount": 200000,
        "currency": "USD",
        "idempotency_key": "refund-full",
    })
    payment_id = create.json()["payment_id"]
    client.post(f"/api/v1/payments/{payment_id}/authorize", json={"processor_outcome": "APPROVED"})
    client.post(f"/api/v1/payments/{payment_id}/capture")
    response = client.post(f"/api/v1/payments/{payment_id}/refund", json={"amount": 200000})
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["status"] == "REFUNDED"
    assert data["refunded_amount"] == 200000


def test_partial_refund_success(client):
    create = client.post("/api/v1/payments", json={
        "amount": 200000,
        "currency": "EUR",
        "idempotency_key": "refund-partial",
    })
    payment_id = create.json()["payment_id"]
    client.post(f"/api/v1/payments/{payment_id}/authorize", json={"processor_outcome": "APPROVED"})
    client.post(f"/api/v1/payments/{payment_id}/capture")
    response = client.post(f"/api/v1/payments/{payment_id}/refund", json={"amount": 70000})
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["status"] == "PARTIALLY_REFUNDED"
    assert data["refunded_amount"] == 70000


def test_retrieve_payment_and_events(client):
    create = client.post("/api/v1/payments", json={
        "amount": 50000,
        "currency": "INR",
        "idempotency_key": "events-001",
    })
    payment_id = create.json()["payment_id"]
    client.post(f"/api/v1/payments/{payment_id}/authorize", json={"processor_outcome": "APPROVED"})
    response = client.get(f"/api/v1/payments/{payment_id}")
    assert response.status_code == 200, response.text
    assert response.json()["id"] == payment_id
    events = client.get(f"/api/v1/payments/{payment_id}/events")
    assert events.status_code == 200, events.text
    assert len(events.json()) >= 2


def test_list_payments_with_pagination(client):
    for index in range(3):
        client.post("/api/v1/payments", json={
            "amount": 1000 + index,
            "currency": "USD",
            "idempotency_key": f"list-{index}",
        })
    response = client.get("/api/v1/payments?limit=2&offset=0")
    assert response.status_code == 200, response.text
    data = response.json()
    assert len(data["items"]) <= 2
    assert data["total"] >= 3


def test_nonexistent_payment_404(client):
    response = client.get("/api/v1/payments/00000000-0000-0000-0000-000000000000")
    assert response.status_code == 404, response.text
