# ProcessAce Architecture

> Status: **Beta Implementation** – this document describes the current architecture as of Phase 14.5 (BPMN Reliability Refactor).

ProcessAce is a **self-hosted**, **BYO-LLM** process discovery and documentation engine.  
It ingests heterogeneous "process evidence" (recordings, images, documents), normalizes it, and generates standard process artifacts such as **BPMN 2.0**, **SIPOC**, and **RACI**.

ProcessAce runs as a set of Docker containers using **BullMQ (Redis)** for reliable background processing, **SQLite** for low-latency persistence, and **JWT-based authentication** for user management.

---

## 1. High-level overview

At a high level, ProcessAce consists of:

- **Web UI** – for uploading evidence, configuring LLM providers, managing users, and reviewing/editing generated artifacts.
- **API Backend** – Node.js Express service exposing REST endpoints for auth, ingestion, orchestration, and retrieval.
- **Job Queue & Background Workers** – asynchronous processing of long-running tasks (LLM analysis, artifact generation).
- **Processing pipeline** – logic that transforms raw evidence into normalized process artifacts.
- **LLM abstraction layer** – a provider-agnostic interface to multiple LLM backends (OpenAI, Google GenAI, Anthropic).
- **Persistence** – SQLite database for users, workspaces, evidence, jobs, artifacts, and app settings.
- **Authentication & Authorization** – JWT-based auth with role-based access control.

The system is designed to run as one or more containers, deployable on-prem or in any cloud.

---

## 2. Core concepts

### 2.1. Process Evidence

All inputs are normalized into a common **Process Evidence** model, which may include:

- **Events** – ordered steps (e.g. "agent opens CRM", "customer provides ID").
- **Actors** – roles or persons performing the steps.
- **Systems** – applications or tools involved (CRM, ERP, email, etc.).
- **Artifacts** – documents, screenshots, UI captures attached to steps.
- **Metadata** – timestamps, source (SOP, transcript, etc.), confidence scores.

The goal is to decouple raw input formats from downstream generation logic.

### 2.2. Process Artifacts

From the normalized evidence, ProcessAce generates:

- **BPMN 2.0 diagrams** – as XML, consumable by BPMN tools.
- **SIPOC tables** – Suppliers, Inputs, Process, Outputs, Customers.
- **RACI matrices** – Responsible, Accountable, Consulted, Informed per activity.
- **Narrative documentation** – step-by-step descriptions in Markdown.

These artifacts are stored in the database and can be downloaded or edited interactively.  
Artifacts include metadata: `artifact_id`, `version`, `type`, `filename`, `createdAt`, `user_id`, `workspace_id`, `llm_provider`, `llm_model`.

---

## 3. Components

### 3.1. Web UI

- Vanilla HTML5/JS/CSS SPA served by Express static middleware.
- No frontend framework (React/Vue) – plain JavaScript with DOM manipulation.
- Pages:
  - `index.html` – Main dashboard (upload, job list, artifact viewer/editor).
  - `login.html` / `register.html` – Authentication.
  - `admin-users.html` – Admin/Superadmin panel for user management (roles, status, approvals).
  - `admin-jobs.html` – Admin view of all jobs across workspaces.
  - `app-settings.html` – Application settings plus superadmin-only reset controls.
  - `user-settings.html` – User profile, privacy export, consent history, and self-deactivation.
- Shared modules:
  - `js/header.js` – Header with user menu and workspace switcher.
  - `js/modal-utils.js` – Reusable confirmation modals.
  - `js/app.js` – Main dashboard logic (upload, polling, artifact viewing/editing).
- Transcript review modal for audio/video evidence (edit, save, export, audio playback).
- Interactive Editing:
  - **BPMN**: `bpmn-js` v18 Modeler for graphical editing, XML/PNG/SVG export.
  - **Markdown**: `EasyMDE` for rich text editing (WYSIWYG), PDF/MD/DOCX export (`html-to-docx` used for document generation).
  - **Tables**: Custom interactive HTML tables for SIPOC/RACI (add/delete rows, inline editing, CSV export).

### 3.2. API Backend

- **Node.js Express** (v5.x) application (`src/app.js`).
- Security: `helmet` (CSP), `cors`, `cookie-parser`.
- Exposes endpoints:
  - `/health` – Health check (unauthenticated).
  - `/api/auth` – Registration, login, logout, profile management (`src/api/auth.js`).
  - `/api/evidence` – File upload and evidence management (authenticated, includes file streaming for playback).
  - `/api/jobs` – Job CRUD, process name update (authenticated).
  - `/api/artifacts` – Artifact retrieval and content updates (authenticated).
  - `/api/workspaces` – Workspace CRUD (authenticated).
  - `/api/settings` – App settings management (admin/superadmin only, `src/api/settings.js`).
  - `/api/admin` – User management, approvals, all-jobs overview (admin/superadmin only, `src/api/admin.js`).
  - `/api/superadmin` – Superadmin-only instance reset operations.

The backend **does not perform heavy work synchronously**.  
Instead, it:

- Accepts requests,
- Persists metadata,
- Enqueues jobs into the job queue, and
- Returns a `job_id` and status resource to the client.

### 3.3. Job Queue & Background Workers

To handle long-running tasks (LLM analysis, artifact generation), ProcessAce uses:

- **Job Queue**: **BullMQ** (Redis-backed) for reliable job processing and retries. Utilizes a single dispatcher pattern (`src/services/jobQueue.js`) to determine and route jobs deterministically.
- **Worker Processes**:
  - **Process Evidence Handler** (`src/workers/evidenceWorker.js`):
    - Listens for `process_evidence` jobs.
    - Reads text evidence file content.
    - Sends content to the selected LLM provider via the abstraction layer.
    - Generates all four artifact types in parallel (BPMN, SIPOC, RACI, Doc).
    - Saves artifacts to SQLite with provider/model traceability.
  - **Transcribe Evidence Handler** (`src/workers/transcriptionWorker.js`):
    - Listens for `transcribe_evidence` jobs.
    - Unconditionally transcodes incoming containers to pristine 128kbps `.mp3` format utilizing ffmpeg (`src/utils/audioChunker.js`).
    - Splits large files based on `transcription.maxFileSizeMB` before transcription.
    - Feeds standardized audio to dedicated STT models (e.g., OpenAI Whisper).
    - Generates an intermediate `transcript` artifact for Human-in-the-Loop review.
    - Review confirmation submits edited text and enqueues a follow-on `process_evidence` job.

This architecture keeps HTTP requests short and allows horizontal scaling of workers (future).

### 3.4. Processing pipeline

The processing pipeline is implemented inside the worker process and consists of:

1. **Ingestion & parsing**
   - Text documents → reading file content (`fs.readFile`).
   - Audio files → routed to STT abstraction layer (e.g. OpenAI Whisper) for text transcription.
   - Audio/video transcription produces a transcript artifact that must be reviewed before artifact generation.
   - Local Ollama is not used for transcription in the current runtime; transcription remains on OpenAI-compatible STT providers.
   - Evidence record retrieved from SQLite.

2. **LLM analysis (worker)**
   - Content sent to LLM via the abstraction layer (provider selected per-job or from app settings).
   - Separate system prompts for each artifact type.
   - **BPMN**: LLM outputs a structured JSON graph (nodes + edges) — **not raw XML**.
   - **SIPOC / RACI**: LLM outputs JSON arrays.
   - **Narrative Doc**: LLM outputs Markdown.
   - All four LLM calls run in parallel via `Promise.all`.

3. **Validation & self-healing (BPMN)**
   - LLM JSON responses are validated against a **Zod schema** (`src/schemas/bpmnSchema.js`) using `.strict()` mode.
   - Schema validates field types, enum values (node types), required properties, and rejects hallucinated properties.
   - Additional cross-reference checks verify unique IDs and valid edge references.
   - If validation fails, a **self-healing retry loop** (up to 3 attempts) feeds the structured Zod error messages back to the LLM for correction.
   - Providers are called with `responseFormat: 'json'` to maximize JSON fidelity.

4. **Deterministic BPMN generation**
   - Validated JSON graph is compiled to BPMN 2.0 XML using `xmlbuilder2` (`src/utils/bpmnBuilder.js`).
   - XML is guaranteed syntactically valid — all tags are closed by the builder.
   - Nodes include `<bpmn:incoming>` and `<bpmn:outgoing>` references per BPMN spec.
   - Raw XML is passed through `bpmn-auto-layout` to generate `<bpmndi:BPMNDiagram>` with X/Y coordinates.

5. **Artifact storage**
   - All artifacts stored in SQLite with:
     - Normalized filename (e.g. `process_name_diagram.bpmn`).
     - `llm_provider`, `llm_model` for traceability.
     - `user_id`, `workspace_id` for access control.
     - BPMN artifacts include `generationMethod: 'json_to_xml'` and `healingAttempts` in metadata.
   - Emits `artifact_generated` via structured logging.

### 3.5. LLM abstraction layer

- Factory pattern implementation (`src/llm/index.js`):
  - `getLlmProvider(options)` – instantiates the correct provider.
  - Options: `{ provider, model, apiKey, baseURL }`.
- Three provider implementations:
  - `OpenAIProvider` (`src/llm/openaiProvider.js`) – uses `openai` SDK.
  - `GoogleProvider` (`src/llm/googleProvider.js`) – uses `@google/genai` SDK.
  - `AnthropicProvider` (`src/llm/anthropicProvider.js`) – uses `@anthropic-ai/sdk`.
- Default models:
  - OpenAI: `gpt-5-nano-2025-08-07`
  - Google: `gemini-3.1-flash-lite-preview`
  - Anthropic: `claude-haiku-4-5-20251001`
- Default transcription model: `whisper-1`.
- Supported OpenAI transcription models: `whisper-1`, `gpt-4o-transcribe`, `gpt-4o-mini-transcribe`, `gpt-4o-transcribe-diarize`.
- Ollama is implemented as a first-class local generation provider through the OpenAI-compatible path.
- Ollama is generation-only in the current runtime and is not used as the transcription backend.
- Each provider exposes `complete(prompt, system, options)` and `listModels()`.
- **JSON response mode**: Providers support `options.responseFormat = 'json'`:
  - **OpenAI**: Passes `response_format: { type: "json_object" }`.
  - **Google**: Passes `generationConfig.responseMimeType: "application/json"`.
  - **Anthropic**: No native JSON mode; enforced via prompt instructions + markdown fence stripping.
- **Schema validation**: `src/schemas/bpmnSchema.js` defines a Zod schema (`BpmnProcessSchema`) as the single source of truth for the BPMN process graph structure.
- Mock provider available via `MOCK_LLM=true` for testing (returns JSON process graph).
- API keys are stored encrypted in the `app_settings` DB table (not env vars).

### 3.6. Persistence

- **Database**: **SQLite** with environment-specific drivers (`src/services/db.js`).
  - Development/test: `better-sqlite3` with `data/processAce-dev.db` by default.
  - Production: SQLCipher-compatible encrypted SQLite with `data/processAce.db` and a required `SQLITE_ENCRYPTION_KEY`.
  - Tables:
    - `users` – id, name, email, password_hash, role, status, created_at, last_login_at.
    - `workspaces` – id, name, owner_id, created_at.
    - `workspace_members` – workspace_id, user_id, role.
    - `workspace_invitations` – id, workspace_id, recipient_email, role, token, status, expires_at.
    - `evidence` – id, filename, originalName, mimeType, size, path, status, metadata, user_id, workspace_id.
    - `artifacts` – id, type, version, content, metadata, filename, user_id, workspace_id, llm_provider, llm_model.
    - `jobs` – id, type, data, status, result, error, process_name, user_id, workspace_id.
    - `app_settings` – key-value store for application configuration.
    - `consent_records` – user consent type, granted flag, timestamp, and IP address.
  - Schema managed via initialization checks and ALTER TABLE migrations in `src/services/db.js`.
- **File Storage**:
  - Local filesystem (`./uploads`) for raw evidence files.
  - SQLite for generated content (artifact content stored as TEXT in the `artifacts` table).
- **Settings Storage** (`src/services/settingsService.js`):
  - LLM configuration (provider, model, API keys, base URLs) stored in `app_settings`.
  - Ollama generation uses provider-scoped `ollama.baseUrl`.
  - Transcription configuration stored in `app_settings` (`transcription.provider`, `transcription.model`, `transcription.maxFileSizeMB`).
  - API keys encrypted with AES-256-CBC using `ENCRYPTION_KEY` env var.

### 3.7. Authentication & Authorization

- **Auth Service** (`src/services/authService.js`):
  - Registration with email/password (password validated: 8+ chars, uppercase, lowercase, numbers).
  - First registered user automatically gets `superadmin` role and `active` status; later self-registrations get `editor` role and `pending` status until approved.
  - Each new user gets a default workspace created automatically and required consent records stored at registration time.
  - Login returns JWT token set as HTTP-only cookie (`auth_token`) and updates `last_login_at`.
  - JWT expires in 24 hours; include user id, email, role, and `jti` in payload.
  - Users can self-export their personal data and self-deactivate. Self-deactivation preserves organizational data and transfers owned workspaces to the primary active superadmin.
  - Superadmins can reset the full installation back to an empty bootstrap state.
- **Middleware** (`src/middleware/auth.js`, `src/middleware/requireAdmin.js`):
  - `authenticateToken` – extracts and verifies JWT from cookies.
  - `requireAdmin` – checks for `admin` or `superadmin` role on protected admin routes.
  - `requireSuperAdmin` – checks for `superadmin` role on destructive organizational controls.
- **Roles**:
  - **System Roles**: `superadmin` (can manage privileged roles and reset the installation), `admin`, `editor`, `viewer`.
  - **Workspace Roles**: `owner` (full control), `editor` (can edit content), `viewer` (read-only).
- **User Status**: `active`, `inactive`, `pending`, `rejected`.
- **Authorization**: Resources are scoped by `workspace_id`. Access is determined by the user's membership role in that workspace.

---

## 4. Data flow example

Example: "Text document → BPMN 2.0 + SIPOC + RACI + Doc"

1. **Upload**
   - User uploads a text document via the dashboard.
   - User optionally enters a process name, selects LLM provider/model.
   - Backend stores the file, creates an evidence record, enqueues a `process_evidence` job.
   - Returns `202 Accepted` with `job_id`.

2. **LLM analysis (worker)**
   - Worker picks up the job.
   - Reads file content from disk via the evidence path.
   - Gets LLM configuration from app settings (or uses per-job overrides).
   - Sends content to the selected LLM with four parallel prompts:
     - **BPMN**: JSON graph prompt with `responseFormat: 'json'`.
     - **SIPOC / RACI**: JSON array prompts.
     - **Doc**: Markdown prompt.

3. **Validation & compilation (worker)**
   - **BPMN**: JSON validated with Zod schema → compiled to XML via `xmlbuilder2` → auto-laid-out via `bpmn-auto-layout`.
   - **Self-healing**: On validation failure, Zod errors fed back to LLM (up to 3 retries).
   - **SIPOC/RACI/Doc**: Responses cleaned (strip code fences).
   - All four artifacts saved to SQLite with provider/model traceability.
   - Job result updated with artifact references.

4. **Completion**
   - Job status set to `completed` (or `failed` on error).
   - Frontend polls for job status; once complete, artifact buttons appear.
   - User views/edits artifacts in the interactive modal.

---

## 5. Deployment model

- Primary packaging: **Docker containers**.
- Services (via `docker-compose.yml`):
  - `app` – API backend + worker + frontend (single Node.js process).
  - `redis` – Redis 7 Alpine for BullMQ job queue.
- Production TLS overlay (`docker-compose.tls.yml`):
  - `caddy` – reverse proxy and automatic HTTPS termination in front of `app`.
- Volumes:
  - `./uploads` – mounted for evidence file persistence.
  - `./data` – mounted for SQLite database persistence.
  - `redis_data` – named volume for Redis persistence.

Key properties:

- No LLM is bundled; API keys are configured via the App Settings page.
- Can run fully on-premise.
- Supports both single-tenant deployments and, with commercial licensing, multi-tenant setups.
- The base Docker stack now runs the `app` container as a non-root `appuser`.
- Redis uses password authentication and is not exposed on a public host port in the base Compose stack.
- The TLS overlay publishes only `80/443`; `app` and `redis` stay on the internal Compose network.

---

## 6. Security and privacy considerations

ProcessAce implements the following security measures:

- **Authentication**: JWT tokens in HTTP-only cookies (secure flag in production).
- **Password Security**: bcrypt hashing (10 salt rounds), complexity requirements enforced.
- **API Key Encryption**: LLM API keys encrypted at rest with AES-256-CBC.
- **Role-Based Access**: Admin-only endpoints for user management and settings.
- **CSP Headers**: Helmet middleware with nonce-based Content Security Policy for inline scripts.
- **Input Validation**: Server-side validation on all API endpoints.
- **Upload Hardening**: Evidence uploads enforce an extension allowlist and a configurable maximum size.
- **Session Hardening**: JWTs carry a `jti`, logouts revoke tokens through Redis, and protected requests re-check current user state from SQLite.
- **Audit Trail**: Sensitive read operations emit `data_access` audit logs with actor/resource/correlation fields.
- **PII Redaction**: Structured logs redact cookies, auth headers, passwords, API keys, emails, and token-like fields.

Recommended practices for production:

- Deploy behind TLS (the Caddy overlay is the default documented path).
- Set `JWT_SECRET`, `ENCRYPTION_KEY`, `SQLITE_ENCRYPTION_KEY`, and `REDIS_PASSWORD` to strong, unique values.
- Set `CORS_ALLOWED_ORIGINS` to the exact allowed frontend origin list.
- Set `NODE_ENV=production` for secure cookies.
- Ensure `data/` and `uploads/` bind mounts are writable by the container UID when running Docker on Linux hosts.
- Migrate any legacy plaintext production database before enabling SQLCipher; the app will not auto-convert it in place.
- Keep all dependencies and base images updated.

---

## 7. Future directions (subject to change)

Some planned/future enhancements:

- Artifact versioning and visual comparison of process models.
- Image OCR and deeper UI/screen understanding (UI element detection in screenshots/recordings).
- Connectors to common systems (ticketing, CRM, ERP) for event log ingestion.
- Optional sync with external BPM suites.

---

As the codebase grows, this document will be updated with concrete implementation details, diagrams, and examples.
