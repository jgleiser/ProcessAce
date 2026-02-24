# ProcessAce

[![Website](https://img.shields.io/badge/Website-processace.com-blue?style=flat-square)](https://processace.com)
[![License: Sustainable Use](https://img.shields.io/badge/License-Sustainable%20Use-orange.svg?style=flat-square)](./LICENSE.md)
[![Docker](https://img.shields.io/badge/Docker-Supported-2496ED?style=flat-square&logo=docker&logoColor=white)]()

AI-powered process discovery and documentation engine – from raw text to BPMN 2.0, SIPOC, and RACI. Self-hosted with bring-your-own LLM.

🌐 **Website & Enterprise Options:** [processace.com](https://processace.com)

> ⚠️ **Status: Beta**. Core ingestion, generation, and editing features are functional. APIs may evolve.

---

## ✨ Features

ProcessAce turns raw **process evidence** into standard, tool-agnostic process documentation in minutes.

- **Ingest Evidence**:
  - Text documents (SOPs, meeting notes, emails).
  - _Planned: Audio/Video recordings, Images._
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
  - **BPMN**: Export as XML (for tools) or PNG/SVG (for presentations).
  - **SIPOC/RACI**: Export tables as CSV.
  - **Narrative**: Download as Markdown or Print/Save as PDF.
- **User Authentication & Workspaces**:
  - **Secure Login**: Email/password with JWT (HTTP-only cookies).
  - **Role-Based Access**: Admin, Editor, and Viewer roles. First registered user becomes Admin.
  - **Workspaces**: Create, switch, and share workspaces for organizing projects (Admin/Editor/Viewer roles).
  - **User Data Isolation**: Jobs and artifacts scoped per user and workspace.
- **Multi-Provider LLM Support**:
  - Choose provider and model for each processing job (OpenAI, Google GenAI, Anthropic).
  - API keys are stored encrypted (AES-256-CBC) in the database.
- **Robust Architecture**:
  - **Dockerized**: Easy deployment with Docker Compose (App + Redis).
  - **Async Processing**: Redis-backed job queue (BullMQ) for long-running generative tasks.
  - **Persistence**: SQLite database (`better-sqlite3`, WAL mode).

---

## 🚀 Getting Started

### Prerequisites

- **Docker & Docker Compose** (Recommended)
- An LLM API key (OpenAI, Google GenAI, or Anthropic)
- A 32-byte Hex string (for secure API key encryption)

### Quick Start (Docker)

1.  **Clone the repository**:
    ```bash
    git clone [https://github.com/jgleiser/ProcessAce.git](https://github.com/jgleiser/ProcessAce.git)
    cd ProcessAce
    ```

2.  **Configure Environment**:
    ```bash
    cp .env.example .env
    # Edit .env and set ENCRYPTION_KEY (required for secure API key storage)
    ```

3.  **Run with Docker Compose**:
    ```bash
    docker compose up -d --build
    ```
    > **Note (Windows/Mac/WSL2):** If you encounter `SQLITE_IOERR_SHMOPEN` errors, ensure the environment variable `DISABLE_SQLITE_WAL=true` is set in `docker-compose.yml` (it is by default).

4.  **Open the Web UI**: Navigate to `http://localhost:3000`.

5.  **Create an Account**: Go to `/register.html` to create your first user account (becomes Admin), then login.

6.  **Configure LLM Provider**: Go to **App Settings** (`/app-settings.html`) to set your LLM provider and API key.

7.  **Test the Magic**: Drop the provided `samples/sample_process.txt` file into the upload zone on your dashboard to see your first BPMN diagram and SIPOC table generated instantly!

---

## 🔑 Bring Your Own LLM

ProcessAce does **not** bundle or resell any LLM. You configure your own provider and keys via the App Settings page. The application natively supports:

- **OpenAI** (default: `gpt-5-nano-2025-08-07`)
- **Google GenAI** (default: `gemini-2.5-flash-lite`)
- **Anthropic** (default: `claude-haiku-4-5-20251001`)

---

## 🧱 Architecture & Auditability

ProcessAce is built for reliability and process mining readiness:
- **Frontend**: Vanilla HTML5/JS/CSS Single Page Application.
- **Backend**: Node.js Express API.
- **Database**: SQLite (`better-sqlite3`).
- **Queue & Workers**: Redis (BullMQ) for background job processing.
- **Audit Trails**: Structured, event-style logging (Pino) for events like `job_queued`, `llm_call`, and `artifact_version_created`. 

See [`docs/architecture.md`](./docs/architecture.md) for a deep dive.

---

## 🗺️ Documentation

- [**User Guide**](./docs/user_guide.md): How to use the application.
- [**API Reference**](./docs/api_reference.md): REST API endpoint documentation.
- [**Architecture**](./docs/architecture.md): System design and component details.
- [**Agent Guidelines**](./docs/agent-guidelines.md): Coding standards for AI agents.
- [**Roadmap**](./docs/ROADMAP.md): Development phases and what's coming next.

---

## 📄 License

ProcessAce is **source-available** under the **ProcessAce Sustainable Use License**.

- Free to use internally, self-host, and modify for internal use.
- You **may not** run ProcessAce as a multi-tenant SaaS/platform or resell it without a commercial license.

See [`LICENSE.md`](./LICENSE.md) for the full terms. For commercial/enterprise licensing, visit [processace.com](https://processace.com) or see [`COMMERCIAL_LICENSE.md`](./COMMERCIAL_LICENSE.md).

---

## 🤝 Contributing

Contributions are welcome! Please check [`CONTRIBUTING.md`](./CONTRIBUTING.md) and [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md). By contributing, you agree that your contributions may be used in both the Sustainable Use edition and any future commercial editions of ProcessAce.