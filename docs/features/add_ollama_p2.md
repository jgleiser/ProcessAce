# Feature Implementation Guide: "Plug & Play" Local AI Orchestration

## 1. Context and Objectives

Phase 17.1 adds first-class Ollama support while preserving current OpenAI, Anthropic, and Google behavior. Phase 17.2 builds on that foundation to deliver a self-contained local AI experience for Docker-based deployments.

Today, users must install Ollama manually and pull models through the Ollama CLI. Phase 17.2 should bundle Ollama into the ProcessAce stack, expose a curated model catalog in the App Settings page, and handle model downloads asynchronously with persisted progress reporting.

### Key Requirements

- **Integrated Infrastructure:** Add Ollama to the Docker stack with persistent model storage.
- **Preserve Existing Compatibility:** Do not break non-Docker Ollama setups or current OpenAI-compatible provider behavior introduced in phase 17.1.
- **Admin-Only Orchestration:** Model pulls must be initiated only from the admin-only App Settings flow.
- **Asynchronous Execution:** Long-running pulls must use the existing BullMQ + SQLite job infrastructure.
- **Persisted Progress:** Pull progress must survive page refreshes and be readable through an API the settings page can poll.
- **Curated Catalog:** The backend must remain the source of truth for which models are offered in the UI.

### Scope Boundary

- This phase covers Docker orchestration, curated model download APIs, queue processing, and settings-page progress UI.
- This phase does not change transcription.
- This phase does not expand Ollama beyond the generation-provider path established in phase 17.1.

---

## 2. Infrastructure: Docker Composition

### A. Add Ollama Service to `docker-compose.yml`

Add a dedicated Ollama service and persistent volume.

Required behavior:

- Add `ollama` as a named service in the Compose network.
- Persist model files in a dedicated Docker volume such as `ollama_data`.
- Expose port `11434` so host users can still interact with Ollama directly if needed.
- Keep `redis` and `app` behavior unchanged.

Recommended Compose shape:

```yaml
services:
  app:
    build: .
    ports:
      - '3000:3000'
    environment:
      - REDIS_HOST=redis
      - REDIS_PORT=6379
      - NODE_ENV=production
      - MOCK_LLM=${MOCK_LLM}
      - ENCRYPTION_KEY=${ENCRYPTION_KEY}
      - DISABLE_SQLITE_WAL=true
      - OLLAMA_BASE_URL_DEFAULT=${OLLAMA_BASE_URL_DEFAULT:-http://ollama:11434/v1}
      - OLLAMA_PULL_HOST=${OLLAMA_PULL_HOST:-http://ollama:11434}
    volumes:
      - ./uploads:/app/uploads
      - ./data:/app/data
    depends_on:
      - redis
      - ollama
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    ports:
      - '6379:6379'
    volumes:
      - redis_data:/data
    restart: unless-stopped

  ollama:
    image: ollama/ollama:latest
    container_name: processace-ollama
    ports:
      - '11434:11434'
    volumes:
      - ollama_data:/root/.ollama
    restart: unless-stopped

volumes:
  redis_data:
  ollama_data:
```

### B. Do Not Hardcode the Docker URL in Provider Logic

Phase 17.1 defines a general Ollama default of `http://localhost:11434/v1` for non-Docker environments. Phase 17.2 must not replace that default with a hardcoded Docker-only value in `src/llm/index.js`.

Instead:

- Introduce an environment-driven default such as `OLLAMA_BASE_URL_DEFAULT`.
- In Docker Compose, set `OLLAMA_BASE_URL_DEFAULT=http://ollama:11434/v1`.
- Outside Docker, the application should continue to fall back to `http://localhost:11434/v1`.

This keeps local installs, host-based Ollama setups, and bundled Docker deployments compatible at the same time.

### C. Optional GPU Guidance

Document GPU acceleration as optional deployment guidance only.

- Keep the base `docker-compose.yml` CPU-safe and portable.
- Add a Linux-only AMD override file such as `docker-compose.ollama-amd.yml`.
- In that override, switch the Ollama image to `ollama/ollama:rocm` and pass through `/dev/kfd` and `/dev/dri`.
- Document Windows + AMD as a host-Ollama fallback using `host.docker.internal`, not as bundled Docker GPU passthrough.
- Do not make GPU reservation or device passthrough blocks mandatory in the default Compose file.

---

## 3. Backend Implementation

### A. Curated Model Catalog Source of Truth

Do not hardcode the model list separately in the API route and the frontend.

Create a single backend catalog source, for example:

- `src/config/ollamaModelCatalog.js`

Each catalog entry should define:

- `id`: Ollama model identifier used by `/api/pull`
- `label`: short user-facing name
- `description`: brief usage guidance
- `sizeLabel`: approximate size string for UI display
- `recommended`: boolean for default ordering

Example entries:

- `llama3.2`
- `qwen2.5:7b`
- `mistral`
- `phi3:mini`

The backend remains authoritative; the frontend should render from API data rather than duplicating the list in static HTML.

### B. Add Admin-Only Settings Routes (`src/api/settings.js`)

Because `/api/settings` is already authenticated and admin-restricted, phase 17.2 routes should be added there.

Required routes:

1. `GET /api/settings/llm/catalog`
   - returns the curated Ollama model catalog for the settings UI
2. `POST /api/settings/llm/pull`
   - validates the requested model against the curated catalog
   - enqueues a model-pull job
   - returns `202 Accepted` with a job identifier
3. `GET /api/settings/llm/pull/:jobId`
   - returns current job state for the specific model-pull job
   - exposes status, progress, progress message, result, and error
   - remains admin-only

`POST /api/settings/llm/pull` request body:

```json
{
  "modelName": "phi3:mini"
}
```

`POST /api/settings/llm/pull` response shape:

```json
{
  "jobId": "uuid",
  "status": "pending"
}
```

`GET /api/settings/llm/pull/:jobId` response shape:

```json
{
  "id": "uuid",
  "type": "model_pull",
  "status": "processing",
  "progress": 42,
  "progressMessage": "downloading layers",
  "result": null,
  "error": null
}
```

### C. Add a Dedicated Queue Singleton (`src/services/queueInstance.js`)

The current queue architecture uses shared singleton instances, not direct queue exports from `src/services/jobQueue.js`.

Required change:

- Add a dedicated queue instance for model downloads, for example `modelQueue`.
- Keep `evidenceQueue` unchanged.
- Register the model-pull worker handler in the shared queue module.

Decision-complete queue shape:

- `evidenceQueue` continues to process evidence and transcription jobs
- `modelQueue` processes only `model_pull`

This avoids mixing unrelated job types and makes startup wiring explicit.

### D. Register the Worker at Startup (`src/index.js`)

The app must register the model-pull handler at startup using the shared singleton, just as the current app already does for evidence processing.

Do not rely on a standalone worker file that is never wired into the running process.

### E. Extend Job Persistence for Progress Tracking

The current jobs table stores `status`, `result`, and `error`, but not progress. Phase 17.2 requires persisted progress.

Add the following fields to the `jobs` table and model:

- `progress INTEGER DEFAULT 0`
- `progress_message TEXT DEFAULT NULL`

Update:

- `src/services/db.js`
- `src/models/job.js`
- any insert/update/select logic that serializes jobs

Required runtime behavior:

- new model-pull jobs start at `progress = 0`
- progress updates are persisted in SQLite as the worker processes stream events
- completed jobs end at `progress = 100`
- failed jobs preserve the last known progress and include `error`

### F. Extend the Queue Job Context for Progress Updates

The current `JobQueue` wrapper passes handlers a plain job context and does not expose BullMQ progress helpers.

Do not rewrite all existing handlers. Instead, extend the handler context with a new helper:

- `reportProgress(percent, message)`

Required behavior of `reportProgress(percent, message)`:

- clamp progress to `0..100`
- persist `progress` and `progress_message` to SQLite
- optionally mirror the value into BullMQ via `bullJob.updateProgress(percent)`
- leave existing evidence/transcription workers unaffected

This keeps the queue abstraction consistent while making model-pull progress available to the settings UI.

### G. Implement the Model Pull Worker (`src/workers/modelWorker.js`)

Create a dedicated worker handler for `model_pull`.

Requirements:

- Use the internal Ollama pull host from environment, e.g. `OLLAMA_PULL_HOST`, defaulting to `http://localhost:11434`
- Call Ollama's native `POST /api/pull`
- Request streaming mode
- Parse streaming progress events robustly
- Persist progress through `reportProgress`
- Return structured success metadata on completion

Do not introduce `axios` for this phase. Use the runtime's existing HTTP capabilities (`fetch` / stream APIs) unless there is a demonstrated need for an additional dependency.

### H. Parse Ollama Streaming Responses Safely

Do not use `JSON.parse(chunk.toString())` directly on arbitrary stream chunks.

Ollama pull progress arrives as streamed JSON fragments that may be split across chunk boundaries. The worker must:

1. buffer incoming text
2. split on line boundaries
3. parse only complete JSON lines
4. ignore empty lines
5. handle partial lines across chunk boundaries

Use Ollama event fields to derive:

- `progress`
- `progressMessage`

Recommended mapping:

- if `completed` and `total` exist, compute percentage
- otherwise update `progressMessage` from `status`
- on terminal success, set `progress = 100`

### I. Ownership and Access Control

Model-pull jobs originate from the admin settings page. They must carry request ownership metadata even though they are not workspace jobs.

Required queue metadata when enqueuing:

- `userId: req.user.id`
- `workspaceId: null`

This ensures:

- progress lookups can be authorized
- the job has a clear owner
- the settings page can safely poll a concrete job record

### J. Keep Model Pull Jobs out of the Main Dashboard Jobs UI

The current dashboard jobs UI is designed for evidence-processing jobs. Model pulls are administrative settings operations and should not clutter the main dashboard.

Implementation rule:

- persist model-pull jobs in the same jobs table for reliability and polling
- but do not render `type === 'model_pull'` in the main dashboard jobs list

This can be implemented either by:

- filtering them out in the dashboard UI, or
- excluding them from the default `/api/jobs` list response

Choose one approach during implementation and apply it consistently. The settings page should rely on the dedicated admin pull-status route, not on the dashboard job list.

---

## 4. Frontend Implementation

### A. Extend the Existing App Settings Page

Do not introduce a standalone settings layout that ignores the current page structure.

The current page already uses collapsible cards and `data-i18n`. Add a new card in `src/public/app-settings.html` that matches the existing style system.

Recommended placement:

- after the generation provider/model section
- visible only when the selected generation provider is `ollama`

Required UI elements:

- section title for local model management
- explanatory text
- catalog-backed model selector
- download/install button
- progress label
- progress bar
- success/failure message area

All new copy must use i18n keys rather than hardcoded strings.

### B. App Settings Page Behavior (`src/public/js/app-settings.js`)

Do not rely on `llmProvider` or `trackJobProgress(...)`; those do not match the current implementation.

Required behavior:

1. On page load:
   - fetch the curated model catalog from `GET /api/settings/llm/catalog`
   - store it in memory
   - populate the model selector when the manager card is shown
2. When the selected generation provider changes:
   - show the model-manager card only for `ollama`
   - hide and reset transient progress UI for non-Ollama providers
3. When the user selects a model:
   - enable the download button
4. When the user starts a download:
   - call `POST /api/settings/llm/pull`
   - disable the form controls during the active pull
   - poll `GET /api/settings/llm/pull/:jobId`
5. During polling:
   - update the progress bar width and label
   - update the progress message text
   - stop polling on `completed` or `failed`
6. On success:
   - show completion state
   - re-enable controls
   - optionally trigger the existing "Load Models" action to refresh the model list
7. On failure:
   - show the backend error
   - re-enable controls

### C. Polling Strategy

Reuse the existing polling style used elsewhere in the app, but do not depend on the dashboard `job-tracker.js` component directly.

Decision-complete polling rules:

- poll every `2s` while status is `pending` or `processing`
- stop polling at `completed` or `failed`
- clear polling timers when the page unloads
- if the page refreshes during an active pull, the settings page should resume polling if the active job ID is still available in memory or local page state

### D. Recommended Completion Behavior

After a successful pull:

- call the existing provider verification/model-loading path for Ollama
- refresh the model combobox in the generation settings section
- keep the manager card visible if Ollama is still selected

This gives the user immediate confirmation that the new model is available without requiring a full page reload.

---

## 5. Public Interfaces and Configuration Impact

Phase 17.2 adds the following public/backend-facing interfaces:

- `GET /api/settings/llm/catalog`
- `POST /api/settings/llm/pull`
- `GET /api/settings/llm/pull/:jobId`
- environment variable `OLLAMA_BASE_URL_DEFAULT`
- environment variable `OLLAMA_PULL_HOST`
- persisted job fields `progress` and `progress_message`

Backward-compatibility requirements:

- existing non-Docker Ollama usage must continue to work
- current OpenAI-compatible custom endpoint behavior must remain unchanged
- current evidence and transcription queues must remain unchanged

---

## 6. Testing and Validation

Automated coverage is required because this phase affects Docker wiring, queue execution, persistence, and admin-only settings flows.

### A. Unit Tests

Add queue and worker tests covering:

- `modelQueue` is registered and routes `model_pull` jobs correctly
- `reportProgress(percent, message)` persists progress updates
- worker streaming parser handles split chunks correctly
- worker maps Ollama stream events to progress percentage and status text
- worker marks jobs complete at `100%`
- worker surfaces pull failures explicitly

Add catalog tests covering:

- unsupported model names are rejected
- supported model names enqueue successfully

### B. Integration Tests

Add route tests covering:

- `GET /api/settings/llm/catalog` requires admin access
- `POST /api/settings/llm/pull` requires admin access
- `POST /api/settings/llm/pull` returns `202` and a job ID for supported models
- `GET /api/settings/llm/pull/:jobId` returns progress for the owning admin user

Add persistence tests covering:

- progress survives page refreshes because it is stored in SQLite
- completed pull jobs retain result metadata
- failed pull jobs retain error metadata

### C. Frontend Behavior Checks

Add frontend-focused validation for:

- the model-manager card appears only when `ollama` is selected
- the model selector is populated from the backend catalog
- starting a pull disables the controls and shows progress
- successful completion refreshes the Ollama model list
- failed pulls surface a clear error state

### D. Docker Validation Checklist

1. Run `docker-compose up -d`.
2. Confirm `app`, `redis`, and `ollama` containers start successfully.
3. Confirm `OLLAMA_BASE_URL_DEFAULT` and `OLLAMA_PULL_HOST` resolve to the expected Ollama endpoint for the selected deployment mode.
4. Open `/app-settings.html` as an admin and select `Ollama (Local)`.
5. Confirm the model-manager card appears and loads the curated catalog.
6. Start a small pull such as `phi3:mini`.
7. Confirm progress updates appear without requiring a full page reload.
8. Refresh the page during the download and confirm polling resumes.
9. After completion, trigger model reload and confirm the downloaded model appears in the Ollama model list.
10. Run `docker-compose down` and `docker-compose up -d`; confirm the model is still present because `ollama_data` persisted it.

---

## 7. Assumptions

- Phase 17.1 provider-scoped Ollama configuration is implemented first.
- Ollama remains generation-only in this phase.
- The admin settings page is the only place where model pull operations are initiated.
- The backend catalog remains curated rather than exposing arbitrary user-supplied model names.
