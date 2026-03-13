---
trigger: always_on
---

### Project-Specific Rules: ProcessAce

**1. Architecture & Data Flow**

- **Separation of Concerns:** Strictly separate Ingestion, Analysis, and Generation into distinct modules. Do not couple UI and backend logic.
- **LLM Abstraction:** Route all LLM calls through a central abstraction layer. Never call LLM providers directly from feature code.
- **Configuration:** Load all provider URLs, API keys, and model names from environment variables. Never hardcode configurations.
- **Structure:** Maintain the explicit directory structure: `src/` (`api`, `services`, `workers`, `llm`, `logging`, `models`), `tests/`, and `docs/`.

**2. Asynchronous Processing**

- **Non-Blocking HTTP:** Never block HTTP requests for long-running tasks (transcription, analysis, generation).
- **Job Queue:** Enqueue heavy operations in a background worker queue (e.g., Redis-backed).
- **API Response:** Immediately return HTTP `202 Accepted` containing a `job_id` and a status polling endpoint.

**3. Artifact Versioning**

- **Immutability:** Never overwrite or delete existing artifacts (BPMN, SIPOC, RACI, narrative docs).
- **Versioning:** Always create a new version for generations or edits. Include `artifact_id`, `version`, `artifact_type`, `created_at`, and `created_by`.
- **Retrieval:** Support fetching the latest version, a specific version, and the full version history.

**4. Logging & Auditability**

- **Format:** Emit structured JSON logs for all significant actions to support process mining.
- **Required Fields:** Include `timestamp`, `event_type`, `actor`, and `correlation_id`/`request_id` in every log entry.
- **LLM Auditing:** Log every LLM interaction. Include provider, model, prompt/response metadata, token length, and status. Explicitly redact sensitive data before logging.
- **Worker Auditing:** Emit step-by-step state changes for background jobs (`job_queued`, `job_started`, `job_step_completed`, `job_completed`, `job_failed`).
- **Error Handling:** Log all errors with explicit `event_type = "error"`, `error_type`, `message`, and `stack`. Never silently swallow errors.

**5. Code Quality & Testing**

- **Standards:** Strictly adhere to `.eslintrc` and Prettier formatting rules. Do not introduce external dependencies unless strictly necessary.
- **Testing:** Write unit/integration tests for transformation functions, versioning, and queue handlers.
- **Mocking:** Mock all LLM responses in tests. Never execute real LLM calls in test suites.
- **Validation:** Programmatically validate generated artifacts (e.g., BPMN schema checks) and explicitly log failures as `validation_error`.
