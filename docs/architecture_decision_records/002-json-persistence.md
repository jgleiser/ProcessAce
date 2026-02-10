# ADR 002: JSON File Persistence for Phase 1

## Status
Superseded by ADR-003

## Context
In Phase 1 development, we encountered an issue where restarting the server (e.g., during development or deployment updates) caused all application state (Jobs, Evidence, Artifacts) to be lost. This broke the link between tracked jobs and the physical files stored on disk, preventing cleanup and causing "Job Lost" errors in the UI.

We needed a persistence mechanism that:
1.  Is extremely simple to implement.
2.  Requires NO external dependencies (no Docker, no Postgres/Redis yet).
3.  Allows the application to survive restarts.
4.  Is sufficient for single-user / local testing.

## Decision
We decided to implement a **JSON File Persistence** layer (`src/services/fileStore.js`) instead of introducing a real database immediately.

-   **Data Storage**: `src/data/*.json` files.
-   **Mechanism**: The application loads the JSON file into an in-memory `Map` on startup and saves the entire `Map` back to disk on every write operation.
-   **Scope**: Applied to Jobs, Evidence, and Artifacts.

## Consequences
-   **Positive**:
    -   Zero setup required for other developers (just `npm install` and run).
    -   State persists across restarts.
    -   Data is human-readable and easy to debug (just open the JSON file).
-   **Negative**:
    -   **Not scalable**: Writing the entire file on every update is inefficient (O(N) I/O).
    -   **Concurrency issues**: No file locking; multiple processes would corrupt data (though currently we only have one process).
    -   **Memory limit**: The entire dataset must fit in RAM.

## Compliance
-   This is a temporary measure for Phase 1-5. It explicitly trades scalability for development velocity and simplicity.
-   Migration to SQLite or PostgreSQL | Redis is planned for Phase 8 (Production Hardening).
