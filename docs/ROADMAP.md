# ProcessAce Roadmap (Working Draft)

## Phase 1 – Skeleton

- [ ] Basic Node.js service entrypoint (`src/index.ts` or `src/index.js`)
- [ ] Health check endpoint
- [ ] Logging utility with structured events
- [ ] Job abstraction (interface + in-memory/Redis stub)
- [ ] Simple artifact model with versioning fields

## Phase 2 – Ingestion + Jobs

- [ ] File upload API (metadata only, stub storage)
- [ ] Enqueue `process_evidence` jobs
- [ ] Worker process that:
  - [ ] Picks up jobs
  - [ ] Emits job lifecycle events (`job_queued`, `job_started`, `job_completed`, `job_failed`)

## Phase 3 – LLM abstraction

- [ ] LLM provider interface
- [ ] Single OpenAI-compatible provider implementation
- [ ] Config via env vars
