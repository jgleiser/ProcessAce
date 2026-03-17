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
- [x] Prompt Engineering for BPMN 2.0 (JSON graph schema)
- [x] Deterministic JSON-to-XML compilation (`xmlbuilder2`)
- [x] Automatic diagram layout (`bpmn-auto-layout`)
- [x] Strict Namespace & Syntax (guaranteed by builder, not LLM)

## Phase 6 – Persistence & Reliability [COMPLETED]

- [x] JSON-based File Store (`src/data/*.json`)
- [x] Persistence for Jobs, Evidence, and Artifacts
- [x] Crash recovery (Jobs survive server restarts)

## Phase 7 – Advanced Analysis (SIPOC / RACI) [COMPLETED]

- [x] SIPOC Matrix Generation (Suppliers, Inputs, Process, Outputs, Customers)
- [x] RACI Matrix Generation (Responsible, Accountable, Consulted, Informed)
- [x] Narrative Documentation Generation (Markdown/HTML)
- [x] UI view for text-based artifacts (Modal & Tables)
- [x] Custom Artifact Naming & Parallel Generation

## Phase 8 – Production Hardening [COMPLETED]

- [x] Replace JSON FileStore with SQLite (better-sqlite3)
- [x] Replace In-Memory/JSON Queue with Redis (BullMQ)
- [x] Structured App-wide Error Handling
- [x] Docker Containerization (App + Redis via Compose)

## Phase 9 – Interactive Visualization & Editing [COMPLETED]

- [x] **Interactive BPMN Viewer**: Integrate `bpmn-js` to view and edit diagrams directly in the browser.
- [x] **Rich Text Editor**: Edit Narrative Documentation within the UI (Markdown WYSIWYG).
- [x] **Interactive Tables**: Editable SIPOC and RACI grids.
- [x] **Validation Feedback**: Real-time validation of edits against BPMN standards (via Modeler).

## Phase 10 – Extended LLM Support [COMPLETED]

- [x] **Google GenAI Integration**: Support for Gemini models via `@google/genai` SDK.
- [x] **Anthropic Integration**: Support for Claude models via `anthropic-sdk`.
- [x] **Provider Selection UI**: Allow users to switch providers per-project or per-job.
- [x] **Model Selection UI**: Allow users to choose specific models (e.g., gpt-5-nano, gemini-3.1-flash-lite-preview).

## Phase 11 – Collaboration & Security [COMPLETED]

- [x] **User Authentication**: Email/password with JWT (HTTP-only cookies).
- [x] **Multi-User Workspaces**: Create workspaces and switch between them.
- [x] **User Data Isolation**: Jobs and artifacts scoped per user and workspace (SQLite-backed).
- [x] **Workspace Management UI**: Dropdown selector and creation modal in header.
- [x] **Role-Based Access**: Viewer / Editor / Admin permissions. First registered user is admin.
- [x] **Admin Dashboard**: User management (roles, status) and all-jobs overview with pagination.
- [x] **App Settings**: Admin-only LLM configuration UI with encrypted API key storage (AES-256-CBC).
- [x] **User Settings**: Profile management (name, password with complexity validation).
- [x] **Process Name Editing**: Update process name after job creation.
- [x] **Custom Confirmation Modals**: Styled modals replacing native `window.confirm()`.
- [x] **Standardized Header**: Consistent header across all pages with user menu.

## Phase 12 - Workspace Sharing [COMPLETED]

- [x] **Workspace sharing**: Share workspaces with other users.
- [x] **Workspace invitations**: Invite users to join workspaces.
- [x] **Member Management**: List and remove members from workspaces.
- [x] **Workspace Dashboard**: "My Workspaces" and "Shared Workspaces" views with job counts.
- [x] **Workspace Deletion**: Owners can delete workspaces and related data.

## Phase 13 - Export artifacts [COMPLETED]

- [x] **SIPOC and RACI export**: Export SIPOC and RACI matrices to CSV or Excel.
- [x] **BPMN export**: Export BPMN diagrams to BPMN or PNG.
- [x] **Narrative export**: Export narrative documentation to DOCX or PDF.

## Phase 14 - Cleanup codebase [COMPLETED]

- [x] **Refactor codebase**: Removed unused debug scripts and temp files, cleaned up `.gitignore`.
- [x] **Refactor styles**: Moved ~50 inline `style=` attributes from HTML files to `style.css` using proper CSS classes.
- [x] **Detect reusable code**: Extracted shared header into `header.js` with dynamic injection; replaced native `alert()` with `showAlertModal()` from `modal-utils.js`.
- [x] **Code quality**: Added JSDoc comments to backend services and API routes; fixed all ESLint errors.
- [x] **Add documentation**: Updated `README.md`, `architecture.md`, `api_reference.md`, `user_guide.md`, and `ROADMAP.md` for public release.
- [x] **Package readiness**: Updated `package.json` to v1.0.0, added repository metadata, updated `.env.example`.
- [x] **Add tests**: Added unit tests (settingsService, workspaceService, bpmnBuilder) and integration tests (workspaces, jobs) — 59 tests, 0 failures.

## Phase 15 – BPMN Reliability Refactor [COMPLETED]

- [x] **JSON-to-XML Pipeline**: LLM outputs structured JSON graph instead of raw XML; deterministic XML compilation via `xmlbuilder2`.
- [x] **Auto-Layout**: `bpmn-auto-layout` generates `<bpmndi:BPMNDiagram>` with proper X/Y coordinates.
- [x] **JSON Response Mode**: Providers enforce JSON output (OpenAI `response_format`, Google `responseMimeType`, Anthropic fence stripping).
- [x] **Zod Schema Validation**: `src/schemas/bpmnSchema.js` — strict runtime validation with `.strict()` mode, typed enums, JSDoc type inference.
- [x] **Self-Healing Loop**: Up to 3 retry attempts; feeds structured Zod error messages back to LLM for correction.
- [x] **Dependencies**: Added `xmlbuilder2`, `bpmn-auto-layout`, `zod`.

## Phase 16 - Audio Transcription [COMPLETED]

- [x] **Audio Ingestion**: Support for uploading audio/video files (mp3, wav, mp4, etc.).
- [x] **Transcription Configuration**: Configure a dedicated LLM Provider and Model for transcription (STT) in App Settings involving separate configuration from the main generation model.
- [x] **Transcription Processing**: If an audio file is uploaded, automatically transcribe it to text using the configured model.
- [x] **Transcript Review**: Review and edit transcripts before generating process artifacts.
- [x] **Transcript Export & Playback**: Export transcripts to TXT and play back audio during review.
- [x] **Evidence Pipeline Integration**: Use the transcribed text as process evidence to generate artifacts (BPMN, SIPOC, RACI).

## Phase 17: Local AI Integration (Ollama)

### Phase 17.1: Core Ollama Support & Security

- [x] **UI Enhancements:** Add 'Ollama (Local)' to the LLM Provider options (`app-settings.html`). Implement dynamic UI toggling to hide the API Key field and display a Custom Base URL field when Ollama is selected.
- [x] **Provider Factory Update:** Modify `src/llm/index.js` to securely intercept Ollama selections. Inject a dummy API key to ensure existing OpenAI keys are never accidentally leaked to the local network.
- [x] **SSRF Protection & API Key Relaxation:** Update `OpenAIProvider` to relax the strict API key requirement _only_ for verified local endpoints (e.g., `localhost`, `127.0.0.1`, `host.docker.internal`). Block external untrusted URLs to prevent Server-Side Request Forgery.
- [x] **Dynamic Model Loading:** Verify and test that the existing `listModels()` implementation successfully fetches available local models via Ollama's OpenAI-compatible `/v1/models` endpoint.

### Phase 17.2: "Plug & Play" Docker Orchestration & Model Manager

- [x] **Infrastructure Update:** Integrate the `ollama/ollama:latest` service into `docker-compose.yml`. Configure a persistent volume (`ollama_data`) to ensure downloaded models survive container restarts.
- [x] **Model Pull API:** Create a new backend route (`/api/settings/llm/pull`) that accepts requests to download a curated list of supported models (e.g., Llama 3.2, Qwen 2.5, Mistral).
- [x] **Background Worker Integration:** Implement a queue worker (`src/workers/modelWorker.js`) using the existing Redis/BullMQ architecture to process long-running model downloads via Ollama's native `/api/pull` endpoint.
- [x] **Model Manager UI:** Build a "Local Model Manager" section in the App Settings page. Allow users to select recommended models and initiate downloads directly from the interface.
- [x] **Progress Tracking:** Connect the background download worker to the frontend using persisted pull progress and settings-page polling to provide users with a real-time progress bar during model installation.

### Phase 17 Notes

- Ollama is implemented as a generation provider.
- Local transcription through Ollama is not part of the current runtime and remains deferred until a supported local STT backend is integrated.
