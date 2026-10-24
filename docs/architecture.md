# PaySure System Architecture — Phase 1

## 1. Overview & System Mission

**PaySure** is a simulated payment reliability, testing, and monitoring platform. Its primary mission is to demonstrate how financial transaction systems maintain **strict correctness, idempotency, and observability under failure conditions**.

In high-throughput payment rails (such as Visa Direct or merchant acquirers), network partitions, downstream processor timeouts, transient gateway spikes, and race conditions are daily occurrences. PaySure models these operational realities without risking real financial balances or storing sensitive cardholder information (PCI DSS boundary compliance).

---

## 2. Architectural Paradigm: Modular Monolith

Phase 1 establishes a **Modular Monolith** architecture. 

### Why Modular Monolith for Phase 1?
1. **Elimination of Distributed Transaction Overhead**: In the foundation phase, keeping core entities (`Payment`, `PaymentEvent`, `ProcessorAttempt`) within a single database and transactional boundary ensures ACID guarantees, preventing fractured state while state machines and idempotency algorithms are hardened.
2. **Strict Module Encapsulation**: Domain capabilities are segregated into distinct modules (`core`, `models`, `schemas`, `services`, `api`, `db`). Cross-boundary invocations must go through explicit service interfaces and schema contracts.
3. **Pave the Way for Future Extraction**: When transaction volume or fault-injection workloads demand horizontal scalability in future phases, discrete boundaries (e.g., Chaos Engine, Metrics Aggregator) can be split into isolated microservices without major domain model rewrites.

---

## 3. High-Level Component Topology

```text
+-----------------------------------------------------------------------------------+
|                                 Client Applications                               |
|        React 19 Dashboard (Vite / Tailwind CSS)    /    External HTTP Clients      |
+------------------------------------------+----------------------------------------+
                                           |
                                HTTP/JSON  | (REST v1 / OpenAPI)
                                           v
+-----------------------------------------------------------------------------------+
|                        PaySure FastAPI Application (Port 8000)                    |
|                                                                                   |
|  +-----------------------------------------------------------------------------+  |
|  |                          Request Tracing Middleware                         |  |
|  |                 (Injects / Propagates X-Request-ID Header)                  |  |
|  +---------------------------------------+-------------------------------------+  |
|                                          |                                        |
|  +---------------------------------------v-------------------------------------+  |
|  |                             API v1 Layer                                    |  |
|  |           /health (Liveness)            /ready (DB Active Ping)             |  |
|  |           /payments (Phase 2+)          /chaos (Phase 5+)                   |  |
|  +---------------------------------------+-------------------------------------+  |
|                                          |                                        |
|  +---------------------------------------v-------------------------------------+  |
|  |                         Core & Domain Service Layer                         |  |
|  |  +-----------------------------+     +-----------------------------------+  |  |
|  |  |    Payment State Machine    |     |   Structured Error Handling       |  |  |
|  |  | (Strict Transition Table)   |     |   (Machine-readable error codes)  |  |  |
|  |  +-----------------------------+     +-----------------------------------+  |  |
|  +---------------------------------------+-------------------------------------+  |
|                                          |                                        |
|  +---------------------------------------v-------------------------------------+  |
|  |                   Data Access Layer (SQLAlchemy 2.0 ORM)                    |  |
|  |          - Payments                  - PaymentEvents (Audit Trail)          |  |
|  |          - ProcessorAttempts         - Connection Pool (pre-ping enabled)   |  |
|  +---------------------------------------+-------------------------------------+  |
+------------------------------------------+----------------------------------------+
                                           |
                                           | PostgreSQL Protocol (Port 5432)
                                           v
+-----------------------------------------------------------------------------------+
|                         PostgreSQL 16 Database Cluster                            |
|             (ACID Transactions, Timezone-Aware Timestamps, JSONB Audit)            |
+-----------------------------------------------------------------------------------+
```

---

## 4. Key Architectural Subsystems (Phase 1)

### 4.1 Application Entrypoint & Middleware Pipeline
- **Entrypoint**: `backend/app/main.py` bootstraps the FastAPI application using asynchronous lifespan management.
- **Correlation ID Middleware**: Every inbound request is assigned a `X-Request-ID` UUID (or inherits one from upstream gateways). This ID propagates across all logging and structured error payloads, enabling end-to-end distributed tracing.
- **CORS Management**: Permissive yet strictly configurable development headers for frontend origins (`localhost:3000`, `localhost:5173`).

### 4.2 Error Handling & Uniform Schema
All operational and validation exceptions conform to a unified contract:
```json
{
  "error_code": "INVALID_STATE_TRANSITION",
  "message": "Invalid payment state transition from 'CAPTURED' to 'AUTHORIZED'.",
  "details": {
    "current_status": "CAPTURED",
    "target_status": "AUTHORIZED",
    "is_terminal": false
  },
  "request_id": "c1f72591-6fa7-4f68-9bf9-e932b10168cb",
  "timestamp": "2026-10-23T12:00:00Z"
}
```

### 4.3 Database Connection & Pooling
- **Engine**: SQLAlchemy 2.0 engine with PostgreSQL dialect.
- **Connection Health (`pool_pre_ping=True`)**: Issues a lightweight test query upon checkout, transparently discarding stale/broken connections caused by network partitions or database failovers.
- **Resource Management**: FastAPI's `Depends(get_db)` provides request-scoped database sessions with guaranteed rollback on exceptions and deterministic closure.

### 4.4 Diagnostic Probes
- `/health`: Liveness probe indicating process vitality. Used by orchestrators (Kubernetes / Docker Compose) to detect application crashes.
- `/ready`: Readiness probe actively testing database connection responsiveness (`SELECT 1`). Returns HTTP 503 if the database is unreachable or query execution fails, preventing traffic from routing to an impaired instance.

---

## 5. Security & Compliance Boundaries

1. **Zero Cardholder Data (Zero-CHD)**: PaySure does not accept, process, transmit, or store Primary Account Numbers (PAN), CVVs, PINs, or track data. All payment testing relies on synthetic tokens or simulated accounts.
2. **Environment Variable Decoupling**: Secrets and database credentials are never checked into version control. Configuration is loaded via `pydantic-settings` from environment variables.
