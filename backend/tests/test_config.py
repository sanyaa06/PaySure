import pytest
from app.core.config import Settings


def test_default_settings():
    settings = Settings()
    assert "PaySure" in settings.PROJECT_NAME
    assert settings.API_V1_STR == "/api/v1"
    assert settings.POSTGRES_PORT == 5432
    assert "postgresql://" in settings.sync_database_url


def test_database_url_override():
    custom_url = "postgresql://user:pass@dbhost:5433/custom_db"
    settings = Settings(DATABASE_URL=custom_url)
    assert settings.sync_database_url == custom_url


def test_cors_origins_parsing():
    settings = Settings(CORS_ORIGINS="http://example.com, https://app.example.com")
    assert "http://example.com" in settings.CORS_ORIGINS
    assert "https://app.example.com" in settings.CORS_ORIGINS


def test_invalid_postgres_port():
    with pytest.raises(Exception):
        Settings(POSTGRES_PORT="invalid_port_number")
