# ProcessAce Roadmap (Working Draft)

## Phase 1 – Skeleton [COMPLETED]
- [x] Basic Node.js service entrypoint (`src/index.js`)
- [x] Health check endpoint
- [x] Logging utility with structured events
- [x] Job abstraction (interface + in-memory stub)
- [x] Simple artifact model with versioning fields

## Phase 2 – Ingestion + Jobs [COMPLETED]
- [x] File upload API (metadata only, stub storage)
- [x] Enqueue `process_evidence` jobs
- [x] Background Worker Implementation
- [x] Job Lifecycle Events

## Phase 3 – LLM Abstraction [COMPLETED]
- [x] LLM provider interface
- [x] OpenAI-compatible provider implementation
- [x] Config via env vars

## Phase 4 – Web UI & User Experience [COMPLETED]
- [x] Served Static Files (Express)
- [x] Drag & Drop Upload Interface
- [x] Job Status Polling & Visualization
- [x] Download links for generated artifacts
- [x] **New:** Delete functionality (Job + File + Artifact cleanup)

## Phase 5 – BPMN Generation [COMPLETED]
- [x] Evidence processing worker
- [x] Prompt Engineering for BPMN 2.0 XML
- [x] **New:** LLM-based Auto-Layout (Manhattan routing, grid system)
- [x] **New:** Strict Namespace & Syntax validation

## Phase 6 – Persistence & Reliability [COMPLETED]
- [x] JSON-based File Store (`src/data/*.json`)
- [x] Persistence for Jobs, Evidence, and Artifacts
- [x] Crash recovery (Jobs survive server restarts)

---

## Phase 7 – Advanced Analysis (SIPOC / RACI) [NEXT]
- [ ] SIPOC Matrix Generation (Suppliers, Inputs, Process, Outputs, Customers)
- [ ] RACI Matrix Generation (Responsible, Accountable, Consulted, Informed)
- [ ] Narrative Documentation Generation (Markdown/HTML)
- [ ] UI view for text-based artifacts

## Phase 8 – Production Hardening [FUTURE]
- [ ] Replace JSON FileStore with SQLite or PostgreSQL
- [ ] Replace In-Memory/JSON Queue with Redis (BullMQ)
- [ ] Structured Error Handling & Retries
- [ ] Docker containerization

## Phase 9 – Advanced Features [FUTURE]
- [ ] Interactive BPMN Viewer (bpmn-js) integration
- [ ] User Authentication
- [ ] Multi-file evidence correlation

