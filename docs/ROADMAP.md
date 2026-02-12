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
- [x] **Model Selection UI**: Allow users to choose specific models (e.g., gpt-5-nano, gemini-2.5-flash-lite).

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

## Phase 14 - Cleanup codebase [NEXT]

- [x] **Refactor codebase**: Remove unused code, improve code quality, and add comments.
- [x] **Refactor styles**: Remove unused styles, remove styles from HTML files and move to CSS files.
- [ ] **Detect reusable code**: Identify reusable code and move it to a separate library.
- [ ] **Add documentation**: Review and add or update documentation for the codebase, including API documentation, user documentation, and installation instructions.
- [ ] **Add tests**: Add tests for the codebase, including unit tests, integration tests, and end-to-end tests.
