# ProcessAce

AI-powered process discovery and documentation engine – from recordings and docs to BPMN 2.0, SIPOC and RACI. Self-hosted with bring-your-own LLM.

> ⚠️ Status: **Beta**. Core ingestion, generation, and editing features are functional. APIs may evolve.

---

## ✨ Features

ProcessAce turns raw **process evidence** into standard, tool-agnostic process documentation.

- **Ingest Evidence**:
  - Text documents (SOPs, notes, emails)
  - _Planned: Audio/Video recordings, Images_
- **Analyze & Normalize**:
  - Uses LLMs (**OpenAI, Google Gemini, Anthropic Claude**) to extract steps, actors, and systems.
  - Normalizes data into a structured evidence model.
- **Generate Artifacts**:
  - **BPMN 2.0 Diagrams**: Auto-generated with professional layout (Manhattan routing, grid system).
  - **SIPOC Tables**: Supplier-Input-Process-Output-Customer matrices.
  - **RACI Matrices**: Responsible-Accountable-Consulted-Informed matrices.
  - **Narrative Docs**: Markdown-based process descriptions.
- **Interactive Editing**:
  - **BPMN Viewer/Editor**: View and modify diagrams directly in the browser (`bpmn-js` v18).
  - **Rich Text**: Edit narrative docs with a WYSIWYG Markdown editor (`EasyMDE`).
  - **Tables**: Interactive SIPOC/RACI editing with add/delete row support.
- **Export Artifacts**:
  - **BPMN**: Export as XML (for tools) or PNG (for presentations).
  - **SIPOC/RACI**: Export tables as CSV.
  - **Narrative**: Download as Markdown or Print/Save as PDF.
- **User Authentication & Workspaces**:
  - **Secure Login**: Email/password with JWT (HTTP-only cookies).
  - **Role-Based Access**: Admin, Editor, and Viewer roles. First registered user becomes Admin.
  - **Workspaces**: Create and switch between workspaces for organizing projects.
  - **Workspace Sharing**: Invite other users to your workspace with specific roles (Viewer/Editor).
  - **User Data Isolation**: Jobs and artifacts scoped per user and workspace.
- **Administration**:
  - **Admin Dashboard**: Manage users (roles, status), view all jobs across workspaces.
  - **App Settings**: Configure LLM providers and API keys (stored encrypted in the database).
  - **User Settings**: Update profile name and password.
- **Multi-Provider LLM Support**:
  - **OpenAI**: GPT models via `openai` SDK.
  - **Google GenAI**: Gemini models via `@google/genai` SDK.
  - **Anthropic**: Claude models via `@anthropic-ai/sdk`.
  - **Per-Job Selection**: Choose provider and model for each processing job.
- **Robust Architecture**:
  - **Dockerized**: Easy deployment with Docker Compose (App + Redis).
  - **Async Processing**: Redis-backed job queue (BullMQ) for long-running generative tasks.
  - **Persistence**: SQLite database (`better-sqlite3`, WAL mode) for reliable data storage.

---

## 🚀 Getting Started

### Prerequisites

- **Docker & Docker Compose** (Recommended)
- An LLM API key (OpenAI, Google GenAI, or Anthropic)

### Quick Start (Docker)

1.  **Clone the repository**:

    ```bash
    git clone https://github.com/<your-org>/processace.git
    cd processace
    ```

2.  **Configure Environment**:

    ```bash
    cp .env.example .env
    # Edit .env and set ENCRYPTION_KEY (required for secure API key storage)
    # Optionally set JWT_SECRET for production
    ```

3.  **Run with Docker Compose**:

    ```bash
    docker compose up -d --build
    ```

    > **Note (Windows/Mac/WSL2):** If you encounter `SQLITE_IOERR_SHMOPEN` errors, ensure the environment variable `DISABLE_SQLITE_WAL=true` is set in `docker-compose.yml` (it is by default). This forces SQLite to use `DELETE` mode instead of WAL, compatible with Docker volumes on non-Linux hosts.

4.  **Open the Web UI**: Navigate to `http://localhost:3000`.

5.  **Create an Account**: Go to `/register.html` to create your first user account (becomes Admin), then login.

6.  **Configure LLM Provider**: Go to **App Settings** (`/app-settings.html`) to set your LLM provider and API key.

### Local Development

1.  Start Redis: `docker run -d -p 6379:6379 redis`
2.  Install dependencies: `npm install`
3.  Run the server: `npm run dev`
4.  Lint & Format: `npm run lint:fix` / `npm run format`

---

## 🔑 Bring Your Own LLM

ProcessAce does **not** bundle or resell any LLM. You configure your own provider and keys.

LLM API keys are managed via the **App Settings** page (`/app-settings.html`), which stores them encrypted in the database. The application supports:

- **OpenAI** (default: `gpt-5-nano-2025-08-07`)
- **Google GenAI** (default: `gemini-2.5-flash-lite`)
- **Anthropic** (default: `claude-haiku-4-5-20251001`)

Users can also select a specific provider and model per job at upload time.

---

## 🧱 Architecture

ProcessAce is built for reliability and auditability.

- **Frontend**: Vanilla HTML5/JS/CSS Single Page Application (served by Express).
- **Backend**: Node.js (v24+) Express API with JWT authentication.
- **Database**: SQLite (`better-sqlite3`, WAL mode) – users, workspaces, jobs, artifacts, evidence, settings.
- **Queue**: Redis (BullMQ) for background job processing.
- **Workers**: Dedicated processes for LLM interaction and artifact generation.

See [`docs/architecture.md`](./docs/architecture.md) for a deep dive.

---

## 📝 Logging, Auditability & Versioning

ProcessAce is designed to support **audit trails** and **process mining**:

- Structured, event-style logging (Pino, JSON output):
  - Events like `job_queued`, `job_started`, `llm_call`, `artifact_version_created`.
- LLM call audit with provider and model traceability per artifact.
- Versioned artifacts stored in the database with creation metadata.

See [`docs/agent-guidelines.md`](./docs/agent-guidelines.md) for logging and coding standards.

---

## 🗺️ Roadmap & Documentation

- [**Roadmap**](./docs/ROADMAP.md): Development phases and what's coming next.
- [**User Guide**](./docs/user_guide.md): How to use the application.
- [**API Reference**](./docs/api_reference.md): REST API endpoint documentation.
- [**Architecture**](./docs/architecture.md): System design and component details.
- [**Architecture Vision**](./docs/architecture_vision.md): Original design document.
- [**Agent Guidelines**](./docs/agent-guidelines.md): Coding standards for AI agents.

---

## 📄 License

ProcessAce is **source-available** under the **ProcessAce Sustainable Use License**.

- Free to use internally, self-host, and modify for internal use.
- You **may not** run ProcessAce as a multi-tenant SaaS/platform or resell it without a commercial license.

See [`LICENSE`](./LICENSE) for the full terms. For commercial/enterprise licensing, see [`COMMERCIAL_LICENSE.md`](./COMMERCIAL_LICENSE.md).

---

## 🤝 Contributing

Contributions are welcome! Please check [`CONTRIBUTING.md`](./CONTRIBUTING.md) and [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md).

By contributing, you agree that your contributions may be used in both the Sustainable Use edition and any future commercial editions of ProcessAce.
