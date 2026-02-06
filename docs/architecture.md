# ProcessAce Architecture

> Status: **Beta Implementation** – this document describes the current architecture as of Phase 8.

ProcessAce is a **self-hosted**, **BYO-LLM** process discovery and documentation engine.  
It ingests heterogeneous “process evidence” (recordings, images, documents), normalizes it, and generates standard process artifacts such as **BPMN 2.0**, **SIPOC**, and **RACI**.

ProcessAce runs as a set of Docker containers using **BullMQ (Redis)** for reliable background processing and **SQLite** for low-latency persistence.

---

## 1. High-level overview

At a high level, ProcessAce consists of:

- **Web UI** – for uploading evidence, configuring LLM providers, and reviewing/editing generated artifacts.
- **API Backend** – Node-based service exposing REST/GraphQL endpoints for ingestion, orchestration, and retrieval.
- **Job Queue & Background Workers** – asynchronous processing of long-running tasks (transcription, LLM analysis, artifact generation).
- **Processing pipeline** – logic that transforms raw evidence into a normalized “process evidence” model and then into process artifacts.
- **LLM abstraction layer** – a provider-agnostic interface to multiple LLLM backends (cloud or local).
- **Persistence** – database and storage for evidence, metadata, jobs, and generated models.
- **Export adapters** – generators for BPMN 2.0 XML, SIPOC, RACI, and narrative docs.

The system is designed to run as one or more containers, deployable on-prem or in any cloud.

---

## 2. Core concepts

### 2.1. Process Evidence

All inputs are normalized into a common **Process Evidence** model, which may include:

- **Events** – ordered steps (e.g. “agent opens CRM”, “customer provides ID”).
- **Actors** – roles or persons performing the steps.
- **Systems** – applications or tools involved (CRM, ERP, email, etc.).
- **Artifacts** – documents, screenshots, UI captures attached to steps.
- **Metadata** – timestamps, source (meeting recording, SOP, etc.), confidence scores.

The goal is to decouple raw input formats from downstream generation logic.

### 2.2. Process Artifacts

From the normalized evidence, ProcessAce generates:

- **BPMN 2.0 diagrams** – as XML, consumable by BPMN tools.
- **SIPOC tables** – Suppliers, Inputs, Process, Outputs, Customers.
- **RACI matrices** – Responsible, Accountable, Consulted, Informed per activity.
- **Narrative documentation** – step-by-step descriptions, assumptions, rules.

These artifacts are stored and can be downloaded or synchronized with external tools.  
Artifacts are versioned for auditability (e.g. `artifact_id`, `version`, `created_at`, `created_by`).

---

## 3. Components

### 3.1. Web UI

- Single Page Application (SPA) built with a modern frontend framework (e.g. React or Vue).
- Main responsibilities:
  - Authentication (when enabled).
  - Uploading evidence (files, recordings, screenshots).
  - Triggering processing (which enqueues background jobs).
  - Displaying job and process status (pending, processing, completed, failed).
  - Browsing and editing generated BPMN/SIPOC/RACI.
  - Triggering exports and downloads.

### 3.2. API Backend

- Node-based service (e.g. Express/Fastify/NestJS).
- Exposes endpoints for:
  - File uploads and metadata creation.
  - Job creation and status checks.
  - Process evidence retrieval and updates.
  - Artifact retrieval and version history.
  - Configuration management (LLM providers, projects, users).

The backend **does not perform heavy work synchronously**.  
Instead, it:

- Accepts requests,
- Persists metadata,
- Enqueues jobs into the job queue, and
- Returns a `job_id` and status resource to the client.

### 3.3. Job Queue & Background Workers

To handle long-running tasks (large file processing, multi-step LLM workflows), ProcessAce uses:

- **Job Queue**: **BullMQ** (Redis-backed) for reliable job processing and retries.
- **Worker Process**:
  - Listens for jobs (`process_evidence`).
  - Performs prompts and parsing.
  - Emits logs and updates job status in the SQLite database (for long-term history).

This architecture keeps HTTP requests short and allows horizontal scaling of workers (future).

### 3.4. Processing pipeline

The processing pipeline is implemented inside worker processes and consists of:

1. **Ingestion & parsing**
   - Text documents → reading file content.
   - (Future) Audio/video → transcription.
   - Emits log events.

2. **LLM analysis (worker)**
   - Content sent to LLM via **OpenAI-compatible provider**.
   - Prompts for BPMN, SIPOC, RACI, and Narrative Docs.

3. **Artifact generation**
   - Responses parsed (JSON/XML/Markdown).
   - Artifacts stored in **SQLite** with versions.
   - Emits `artifact_version_created`.

### 3.5. LLM abstraction layer

- Adapter pattern implementation (`src/llm/index.js`):
  - `OpenAIProvider` handles communication.
  - Configured via `LLM_API_KEY`, `LLM_MODEL`, `LLM_PROVIDER_URL`.

### 3.6. Persistence

- **Database**: **SQLite** (`better-sqlite3`) using WAL mode.
  - Stores: `evidence`, `artifacts`, `jobs`.
  - Schema managed via initialization checks in `src/services/db.js`.
- **File Storage**:
  - Local filesystem (`./uploads`) for raw evidence files.
  - SQLite for generated content (Artifacts).

Schema design supports:
- Version history (`version`, `previousVersionId`).
- Linking (`sourceEvidenceId`).

Schema design should support:

- Version history for artifacts.
- Linking artifacts to the evidence and jobs that produced them.
- Audit queries (e.g. “who changed what, when, and via which job”).

---

## 4. Data flow example

Example: “Meeting recording + screenshots → BPMN 2.0”

1. **Upload**
   - User uploads a meeting recording and several screenshots via the Web UI.
   - Backend stores files and creates initial evidence entries.
   - Backend enqueues a job (e.g. `process_evidence`) and returns:
     - `202 Accepted`
     - `job_id` and a status URL.

2. **Transcription & parsing (worker)**
   - Worker picks up the job.
   - Sends audio/video to the configured STT engine to obtain a transcript.
   - Stores transcript and updates evidence records.
   - Emits `ingestion_started`, `ingestion_completed`, `llm_call` (if STT is LLM-based), etc.

3. **LLM analysis (worker)**
   - Transcript is chunked and sent to the LLM via the abstraction layer.
   - LLM prompts identify steps, actors, systems, and decisions.
   - Output is normalized into the Process Evidence model.
   - Emits `llm_call`, `analysis_completed`, `evidence_normalized`.

4. **Artifact generation (worker)**
   - Evidence is used to generate:
     - BPMN 2.0 XML (lanes, tasks, gateways, events).
     - SIPOC and RACI tables.
     - Narrative documentation.
   - New artifact versions are stored (e.g. `version = 1`).
   - Emits `artifact_version_created` events for each artifact.

5. **Completion**
   - Job status is set to `completed` or `failed`.
   - User checks job status via the API or UI; once complete, artifacts are available for review and export.

---

## 5. Deployment model

- Primary packaging: **Docker containers**.
- Typical services:
  - `api` – API backend.
  - `worker` – background processing worker(s).
  - `db` – database.
  - `queue` – queue backend (e.g. Redis).
  - `ui` – frontend UI (can be served separately or via API container).

Example setups:

- Local development: `docker-compose.yml` (API + worker + DB + queue + UI).
- Production: Helm chart / Kubernetes manifests with separate deployments for API and workers.

Key properties:

- No LLM is bundled; an external LLM provider or local model must be configured.
- Can run fully on-premise for organizations with strict data/privacy requirements.
- Supports both single-tenant deployments and, with commercial licensing, multi-tenant setups.

---

## 6. Security and privacy considerations

- ProcessAce may process sensitive business information (processes, systems, customer data).
- Recommended practices:
  - Deploy behind TLS and an authentication/authorization layer.
  - Restrict access to admin and configuration endpoints.
  - Carefully configure LLM providers (e.g. disable training on submitted data where possible).
  - Keep all dependencies and base images updated.
  - Treat API keys and LLM credentials as secrets.

Additional hardening and security guidance will be maintained in `SECURITY.md` and future docs.

---

## 7. Future directions (subject to change)

Some planned/future enhancements:

- Deeper UI and screen understanding (UI element detection in screenshots/recordings).
- Connectors to common systems (ticketing, CRM, ERP) to ingest event logs for combined top-down and bottom-up analysis.
- Versioning and visual comparison of process models.
- Collaborative editing, review workflows, and approvals.
- Optional sync with external BPM suites.

---

As the codebase grows, this document will be updated with concrete implementation details, diagrams, and examples.
