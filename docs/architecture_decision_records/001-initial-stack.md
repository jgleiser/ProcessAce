# ADR 001: Initial Technology Stack

## Status

Accepted

## Context

We are starting the development of ProcessAce (Phase 1). We need to select the core technology stack for the API backend and background workers.
The requirements are:

- Self-hosted (must be easy to run via Docker).
- Async processing (job queue support).
- Maintainability for other engineers.
- Structured logging for process mining.

## Decision

We will use the following stack:

1.  **Runtime**: **Node.js** (LTS).
    - _Why_: Large ecosystem, excellent async I/O handling (crucial for file processing and HTTP requests), and existing team familiarity (implied by `package.json`).
2.  **Web Framework**: **Express**.
    - _Why_: standard, mature, and widely understood. While Fastify is faster, Express is sufficient for the control plane and has the broadest middleware support.
3.  **Logging**: **Pino** (or similar JSON-first logger).
    - _Why_: Performance and semantic JSON output by default, which is required for the "event-style logging" goal.
4.  **Job Queue**: **Bull / BullMQ** (Redis-backed).
    - _Why_: Proven reliability for Node.js, easy to inspect, and supports the "job abstraction" requirement well. (Note: For Phase 1, we will implement an in-memory stub to avoid immediate Redis dependency during dev).

## Consequences

- **Positive**: Quick setup, huge ecosystem, easy hiring/maintenance.
- **Negative**: Single-threaded event loop can be blocked by CPU-intensive parsing if not offloaded to workers (which is why we are designing workers from day 1).

## Compliance

- Fits `docs/agent-guidelines.md` regarding "Maintainability" and "Logging".
