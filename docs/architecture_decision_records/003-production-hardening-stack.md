# 3. Production Hardening Stack Selection

Date: 2026-02-05

## Status

Accepted

## Context

ProcessAce started with a prototype architecture using:
- In-memory job queue (custom stub).
- JSON file-based persistence (`src/data/*.json`).
- `npm run dev` local execution.

As we moved towards a stable release (Phase 8), we needed:
1.  **Reliability**: Jobs must survive server restarts.
2.  **Scalability**: The queue system should support concurrent workers and retries.
3.  **Data Integrity**: Concurrent writes to JSON files are unsafe.
4.  **Deployment**: Easy setup for users without complex dependency management.

## Decision

We chose the following stack for "Production Hardening":

### 1. Persistence: SQLite (`better-sqlite3`)
- **Why**: 
  - Zero-configuration (single file).
  - High performance (especially with WAL mode).
  - Sufficient for self-hosted, single-tenant use cases (supports concurrent reads, serialized writes are fast enough for standard process documentation loads).
  - Removing JSON file dependencies eliminates corruption risks.

### 2. Job Queue: BullMQ (Redis)
- **Why**:
  - Industry standard for Node.js background jobs.
  - Reliable features: Retries, delayed jobs, prioritized processing.
  - Requires Redis, but solves the "missing job" problem.

### 3. Containerization: Docker & Docker Compose
- **Why**:
  - Bundles the Application and Redis together.
  - Eliminates "works on my machine" issues.
  - Simplifies the `npm install` and Node version requirements (using Node 24 Alpine).

## Consequences

### Positive
- **Robustness**: The system is now crash-resistant.
- **Performance**: Database queries are faster and safer than JSON parsing.
- **Standardization**: Deployment is standard (`docker compose up`).

### Negative
- **Complexity**: Requires Redis to be running (handled via Docker Compose, but adds a dependency for local dev).
- **Migration**: Old JSON data is invalidated/lost (acceptable for this phase).
