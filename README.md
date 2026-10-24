# PaySure — Payment Reliability, Testing & Monitoring Platform

[![Backend CI](https://github.com/paysure/paysure/actions/workflows/backend-ci.yml/badge.svg)](.github/workflows/backend-ci.yml)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115.0-009688.svg)](https://fastapi.tiangolo.com)
[![SQLAlchemy](https://img.shields.io/badge/SQLAlchemy-2.0.35-red.svg)](https://www.sqlalchemy.org)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-blue.svg)](https://www.postgresql.org)
[![React](https://img.shields.io/badge/React-19-61dafb.svg)](https://react.dev)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)

> **Notice**: This repository is currently in **Phase 1: Architecture & Project Foundation**. All payment transactions and processor networks in PaySure are simulated for reliability, fault-injection, and observability engineering. No actual bank credentials, cardholder data, or money transfers are handled.

---

## 1. Project Overview

**PaySure** is a simulated payment-processing platform engineered to demonstrate how enterprise financial systems maintain correctness, idempotency, and observability under failure.

The full platform will support:
- Payment authorization, capture, and refunds with mathematical invariant enforcement
- Strictly idempotent APIs with request fingerprint deduplication
- Safe retries, distributed locking, and concurrency control
- Processor timeout detection and reconciliation without double-charging
- Automated chaos fault injection (latency, jitter, packet drop, gateway failures)
- Live observability metrics (P99 latency, error budget burn, idempotency collisions)
- Multi-processor routing with automatic health-checked fallback

---

## 2. Phase 1 Scope & Architecture

Phase 1 provides the foundational architecture:
1. **FastAPI Backend Core**: Environment configuration via Pydantic Settings, request correlation middleware (`X-Request-ID`), structured error responses, and dependency-injected database sessions with connection pool pre-pinging.
2. **PostgreSQL Relational Schema**: SQLAlchemy 2.0 models for `Payment`, `PaymentEvent` (audit trail), and `ProcessorAttempt` with UUID keys, integer minor units, and timezone-aware timestamps.
3. **Database Migrations**: Alembic setup with `001_initial_schema.py` migration script.
4. **Payment State Machine**: Deterministic Finite State Machine with transition matrix, terminal state guards, and partial refund math.
5. **System Probes**: Liveness probe (`/health`) and database connectivity readiness probe (`/ready`).
6. **Docker & Container Orchestration**: Multi-stage `Dockerfile`s and `docker-compose.yml` with PostgreSQL 16 health checks and service dependencies.
7. **Test Suite**: Pytest test suite covering health, readiness, configuration, constraints, and state transitions.
8. **Frontend Dashboard Shell**: Polished fintech SaaS interface built with React, Vite, and Tailwind CSS with navigation and live connection testing.

---

## 3. Quickstart with Docker Compose

To spin up the complete local environment (PostgreSQL 16, FastAPI backend, and React dashboard):

```bash
# 1. Clone repository
git clone https://github.com/your-org/paysure.git
cd paysure

# 2. Copy environment template
cp .env.example .env

# 3. Build and launch all services with Docker Compose
docker compose up --build
```

Services will be available at:
- **Frontend Dashboard**: [http://localhost:3000](http://localhost:3000)
- **Backend API Root**: [http://localhost:8000](http://localhost:8000)
- **Interactive OpenAPI Docs**: [http://localhost:8000/docs](http://localhost:8000/docs)
- **Database Readiness Check**: [http://localhost:8000/ready](http://localhost:8000/ready)

---

## 4. Local Manual Setup (Without Docker)

### 4.1 Backend & Database Setup
Requirements: **Python 3.12+** and a running **PostgreSQL 16** instance.

```bash
# 1. Create and activate Python virtual environment
python3 -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

# 2. Install backend dependencies
pip install -r backend/requirements.txt

# 3. Set environment variables (or ensure .env exists)
export POSTGRES_SERVER=localhost
export POSTGRES_PORT=5432
export POSTGRES_USER=postgres
export POSTGRES_PASSWORD=postgres
export POSTGRES_DB=paysure_db

# 4. Run database migrations with Alembic
cd backend
alembic upgrade head
cd ..

# 5. Start the FastAPI development server
uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8000
```

### 4.2 Running the Test Suite
```bash
# Execute pytest suite with verbose output
pytest backend/tests -v
```

### 4.3 Frontend Setup
Requirements: **Node.js 20+** and **npm**.

```bash
# Install dependencies
npm install

# Start Vite development server
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) to view the PaySure dashboard shell.

---

## 5. Directory Structure

```text
paysure/
├── backend/
│   ├── app/
│   │   ├── main.py                  # FastAPI application entrypoint
│   │   ├── api/
│   │   │   └── v1/
│   │   │       ├── router.py        # API v1 route aggregator
│   │   │       └── endpoints/
│   │   │           ├── health.py    # Liveness probe
│   │   │           └── readiness.py # DB ping readiness probe
│   │   ├── core/
│   │   │   ├── config.py            # Pydantic environment configuration
│   │   │   ├── errors.py            # Structured error responses
│   │   │   └── state_machine.py     # Payment FSM and validation rules
│   │   ├── models/
│   │   │   ├── base.py              # Mixins (UUID, Timestamps)
│   │   │   ├── payment.py           # Core Payment entity
│   │   │   ├── payment_event.py     # Audit event ledger
│   │   │   └── processor_attempt.py # Gateway interaction records
│   │   ├── schemas/
│   │   │   ├── health.py            # Health/Readiness response schemas
│   │   │   └── common.py            # Standard API response structures
│   │   ├── services/                # Domain services (Phase 2+)
│   │   └── db/
│   │       ├── base.py              # SQLAlchemy 2.0 DeclarativeBase
│   │       └── session.py           # Engine & sessionmaker dependency
│   ├── alembic/
│   │   ├── env.py                   # Alembic environment runner
│   │   ├── script.py.mako           # Migration template
│   │   └── versions/
│   │       └── 001_initial_schema.py# Initial DDL migration
│   ├── tests/
│   │   ├── conftest.py              # Test fixtures and SQLite in-memory DB
│   │   ├── test_health.py           # Health endpoint tests
│   │   ├── test_readiness.py        # Readiness & DB failure tests
│   │   ├── test_config.py           # Settings and configuration tests
│   │   ├── test_models.py           # Model constraint & relationship tests
│   │   └── test_state_machine.py    # State machine transition matrix tests
│   ├── requirements.txt             # Python dependencies
│   ├── Dockerfile                   # Multi-stage Python 3.12 Dockerfile
│   └── alembic.ini                  # Alembic CLI configuration
├── frontend/                        # Frontend source package
├── src/                             # React application source (Vite root)
├── docs/
│   ├── architecture.md              # System design and topology
│   ├── database-design.md           # Entity relationships, schemas, and indexing
│   ├── payment-state-machine.md     # FSM transition table and invariants
│   └── development-roadmap.md       # 8-phase implementation plan
├── .github/
│   └── workflows/
│       └── backend-ci.yml           # GitHub Actions CI workflow
├── docker-compose.yml               # Multi-container orchestration
├── .env.example                     # Environment template
├── .gitignore                       # Git exclusion rules
└── README.md                        # Project documentation
```

---

## 6. Phase 1 Explicit Limitations

Per the project roadmap, the following features are **strictly out of scope for Phase 1**:
- **Payment Operations**: No payment creation, authorization, capture, void, or refund endpoints exist in this phase.
- **Card Network / Gateway Integrations**: All processors are simulated; no active network calls are made.
- **Chaos & Fault Injection**: Network delay, jitter, and error-injection hooks will be implemented in Phase 5.
- **Distributed Locking & Idempotency Storage**: Redis distributed locks and persistent idempotency TTL caches will be introduced in Phase 3.
- **Telemetry Pipelines**: Prometheus / OpenTelemetry exporters and live dashboards will be introduced in Phase 6.
