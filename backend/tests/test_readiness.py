from unittest.mock import MagicMock
from fastapi.testclient import TestClient
from app.db.session import get_db
from app.main import app


def test_readiness_probe_success(client: TestClient):
    response = client.get("/ready")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ready"
    assert data["database"] == "connected"
    assert "latency_ms" in data
    assert data["latency_ms"] >= 0


def test_readiness_probe_v1_success(client: TestClient):
    response = client.get("/api/v1/ready")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ready"
    assert data["database"] == "connected"


def test_readiness_probe_database_failure():
    """Simulates database connection outage to verify 503 status code and payload."""
    def broken_db():
        mock_session = MagicMock()
        mock_session.execute.side_effect = Exception("FATAL: connection to server lost")
        yield mock_session

    app.dependency_overrides[get_db] = broken_db
    with TestClient(app) as local_client:
        response = local_client.get("/ready")
        assert response.status_code == 503
        data = response.json()
        assert data["status"] == "unready"
        assert data["database"] == "disconnected"
        assert "FATAL" in data["error"]
    app.dependency_overrides.clear()
