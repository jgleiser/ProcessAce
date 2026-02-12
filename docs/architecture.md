# ProcessAce Architecture

> Status: **Beta Implementation** – this document describes the current architecture as of Phase 11.

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
  - `admin.html` – Admin panel for user management (roles, status).
  - `admin-jobs.html` – Admin view of all jobs across workspaces.
  - `app-settings.html` – Application settings (LLM providers, API keys).
  - `user-settings.html` – User profile (name, password).
- Shared modules:
  - `js/header.js` – Header with user menu and workspace switcher.
  - `js/modal-utils.js` – Reusable confirmation modals.
  - `js/app.js` – Main dashboard logic (upload, polling, artifact viewing/editing).
- Interactive Editing:
  - **BPMN**: `bpmn-js` v18 Modeler for graphical editing, XML/PNG/SVG export.
  - **Markdown**: `EasyMDE` for rich text editing (WYSIWYG), PDF/MD export.
  - **Tables**: Custom interactive HTML tables for SIPOC/RACI (add/delete rows, inline editing, CSV export).

### 3.2. API Backend

- **Node.js Express** (v5.x) application (`src/app.js`).
- Security: `helmet` (CSP), `cors`, `cookie-parser`.
- Exposes endpoints:
  - `/health` – Health check (unauthenticated).
  - `/api/auth` – Registration, login, logout, profile management (`src/api/auth.js`).
  - `/api/evidence` – File upload and evidence management (authenticated).
  - `/api/jobs` – Job CRUD, process name update (authenticated).
  - `/api/artifacts` – Artifact retrieval and content updates (authenticated).
  - `/api/workspaces` – Workspace CRUD (authenticated).
  - `/api/settings` – App settings management (admin only, `src/api/settings.js`).
  - `/api/admin` – User management, all-jobs overview (admin only, `src/api/admin.js`).

The backend **does not perform heavy work synchronously**.  
Instead, it:

- Accepts requests,
- Persists metadata,
- Enqueues jobs into the job queue, and
- Returns a `job_id` and status resource to the client.

### 3.3. Job Queue & Background Workers

To handle long-running tasks (LLM analysis, artifact generation), ProcessAce uses:

- **Job Queue**: **BullMQ** (Redis-backed) for reliable job processing and retries (`src/services/jobQueue.js`).
- **Worker Process** (`src/workers/evidenceWorker.js`):
  - Listens for `process_evidence` jobs.
  - Reads evidence file content.
  - Sends content to the selected LLM provider via the abstraction layer.
  - Generates all four artifact types in parallel (BPMN, SIPOC, RACI, Doc).
  - Saves artifacts to SQLite with provider/model traceability.
  - Emits structured log events and updates job status.

This architecture keeps HTTP requests short and allows horizontal scaling of workers (future).

### 3.4. Processing pipeline

The processing pipeline is implemented inside the worker process and consists of:

1. **Ingestion & parsing**
   - Text documents → reading file content (`fs.readFile`).
   - (Future) Audio/video → transcription.
   - Evidence record retrieved from SQLite.

2. **LLM analysis (worker)**
   - Content sent to LLM via the abstraction layer (provider selected per-job or from app settings).
   - Separate system prompts for each artifact type (BPMN, SIPOC, RACI, Narrative Doc).
   - All four LLM calls run in parallel via `Promise.all`.

3. **Artifact generation**
   - Responses parsed and cleaned (strip markdown code blocks).
   - Artifacts stored in SQLite with:
     - Normalized filename (e.g. `process_name_diagram.bpmn`).
     - `llm_provider`, `llm_model` for traceability.
     - `user_id`, `workspace_id` for access control.
   - Emits `artifact_version_created` via structured logging.

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
  - Google: `gemini-2.5-flash-lite`
  - Anthropic: `claude-haiku-4-5-20251001`
- Each provider exposes `complete(prompt, system)` and `listModels()`.
- Mock provider available via `MOCK_LLM=true` for testing.
- API keys are stored encrypted in the `app_settings` DB table (not env vars).

### 3.6. Persistence

- **Database**: **SQLite** (`better-sqlite3`) using WAL mode (`src/services/db.js`).
  - Tables:
    - `users` – id, name, email, password_hash, role, status, created_at.
    - `workspaces` – id, name, owner_id, created_at.
    - `workspace_members` – workspace_id, user_id, role.
    - `workspace_invitations` – id, workspace_id, recipient_email, role, token, status, expires_at.
    - `evidence` – id, filename, originalName, mimeType, size, path, status, metadata, user_id, workspace_id.
    - `artifacts` – id, type, version, content, metadata, filename, user_id, workspace_id, llm_provider, llm_model.
    - `jobs` – id, type, data, status, result, error, process_name, user_id, workspace_id.
    - `app_settings` – key-value store for application configuration.
  - Schema managed via initialization checks and ALTER TABLE migrations in `src/services/db.js`.
- **File Storage**:
  - Local filesystem (`./uploads`) for raw evidence files.
  - SQLite for generated content (artifact content stored as TEXT in the `artifacts` table).
- **Settings Storage** (`src/services/settingsService.js`):
  - LLM configuration (provider, model, API keys, base URLs) stored in `app_settings`.
  - API keys encrypted with AES-256-CBC using `ENCRYPTION_KEY` env var.

### 3.7. Authentication & Authorization

- **Auth Service** (`src/services/authService.js`):
  - Registration with email/password (password validated: 8+ chars, uppercase, lowercase, numbers).
  - First registered user automatically gets `admin` role; subsequent users get `viewer`.
  - Each new user gets a default workspace created automatically.
  - Login returns JWT token set as HTTP-only cookie (`auth_token`).
  - JWT expires in 24 hours; include user id, email, and role in payload.
- **Middleware** (`src/middleware/auth.js`, `src/middleware/requireAdmin.js`):
  - `authenticateToken` – extracts and verifies JWT from cookies.
  - `requireAdmin` – checks for `admin` role on protected admin routes.
- **Roles**:
  - **System Roles**: `admin` (can manage system settings/users), `user` (regular access).
  - **Workspace Roles**: `owner` (full control), `editor` (can edit content), `viewer` (read-only).
- **User Status**: `active`, `inactive` (inactive users cannot log in).
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
   - Sends content to the selected LLM with four parallel prompts (BPMN, SIPOC, RACI, Doc).

3. **Artifact generation (worker)**
   - Responses parsed and cleaned.
   - Four artifacts saved to SQLite with:
     - Normalized filename, provider/model traceability, user/workspace IDs.
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
- Volumes:
  - `./uploads` – mounted for evidence file persistence.
  - `./data` – mounted for SQLite database persistence.
  - `redis_data` – named volume for Redis persistence.

Key properties:

- No LLM is bundled; API keys are configured via the App Settings page.
- Can run fully on-premise.
- Supports both single-tenant deployments and, with commercial licensing, multi-tenant setups.

---

## 6. Security and privacy considerations

ProcessAce implements the following security measures:

- **Authentication**: JWT tokens in HTTP-only cookies (secure flag in production).
- **Password Security**: bcrypt hashing (10 salt rounds), complexity requirements enforced.
- **API Key Encryption**: LLM API keys encrypted at rest with AES-256-CBC.
- **Role-Based Access**: Admin-only endpoints for user management and settings.
- **CSP Headers**: Helmet middleware with configured Content Security Policy.
- **Input Validation**: Server-side validation on all API endpoints.

Recommended practices for production:

- Deploy behind TLS (reverse proxy).
- Set `JWT_SECRET` and `ENCRYPTION_KEY` to strong, unique values.
- Set `NODE_ENV=production` for secure cookies.
- Keep all dependencies and base images updated.

---

## 7. Future directions (subject to change)

Some planned/future enhancements:

- Artifact versioning and visual comparison of process models.
- Advanced media ingestion (audio/video transcription, image OCR).
- Deeper UI and screen understanding (UI element detection in screenshots/recordings).
- Connectors to common systems (ticketing, CRM, ERP) for event log ingestion.
- Optional sync with external BPM suites.

---

As the codebase grows, this document will be updated with concrete implementation details, diagrams, and examples.
