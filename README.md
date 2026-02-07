# ProcessAce

AI-powered process discovery and documentation engine – from recordings and docs to BPMN 2.0, SIPOC and RACI. Self-hosted with bring-your-own LLM.

> ⚠️ Status: **Beta**. Core ingestion, generation, and editing features are functional. APIs may evolve.

---

## ✨ Features

ProcessAce turns raw **process evidence** into standard, tool-agnostic process documentation.

-   **Ingest Evidence**:
    -   Text documents (SOPs, notes, emails)
    -   *Planned: Audio/Video recordings, Images*
-   **Analyze & Normalize**:
    -   Uses LLMs (**OpenAI, Google Gemini, Anthropic Claude**) to extract steps, actors, and systems.
    -   Normalizes data into a structured evidence model.
-   **Generate Artifacts**:
    -   **BPMN 2.0 Diagrams**: Auto-generated and interactive.
    -   **SIPOC Logic**: Supplier-Input-Process-Output-Customer matrices.
    -   **RACI Models**: Responsible-Accountable-Consulted-Informed matrices.
    -   **Narrative Docs**: Markdown-based process descriptions.
-   **Interactive Editing**:
    -   **BPMN Viewer/Editor**: View and modify diagrams directly in the browser (`bpmn-js`).
    -   **Rich Text**: Edit narrative docs with a WYSIWYG Markdown editor.
    -   **Tables**: Interactive SIPOC/RACI editing.
-   **Robust Architecture**:
    -   **Dockerized**: Easy deployment with Docker Compose.
    -   **Async Processing**: Redis-backed job queue for long-running generative tasks.
    -   **Persistence**: SQLite database for reliable data storage.

---

## 🚀 Getting Started

### Prerequisites

-   **Docker & Docker Compose** (Recommended)
-   **OpenAI API Key** (or compatible provider)

### Quick Start (Docker)

1.  **Clone the repository**:
    ```bash
    git clone https://github.com/<your-org>/processace.git
    cd processace
    ```

2.  **Configure Environment**:
    ```bash
    cp .env.example .env
    # Edit .env and set your API keys (OPENAI_API_KEY, GOOGLE_API_KEY, ANTHROPIC_API_KEY)
    ```

3.  **Run with Docker Compose**:
    ```bash
    docker compose up -d --build
    ```

4.  **Open the Web UI**:
    Navigate to `http://localhost:3000`.

### Local Development

1.  Start Redis: `docker run -d -p 6379:6379 redis`
2.  Install dependencies: `npm install`
3.  Run the server: `npm run dev`

---

## 🧱 Architecture

ProcessAce is built for reliability and auditability.

-   **Frontend**: HTML5/JS Single Page Application.
-   **Backend**: Node.js Express API.
-   **data**: SQLite (Metadata, Artifacts, Jobs).
-   **queue**: Redis (BullMQ) for background job processing.
-   **workers**: Dedicated processes for LLM interaction and artifact generation.

See [`docs/architecture.md`](./docs/architecture.md) for a deep dive.

---

## 🗺️ Roadmap & Documentation

-   [**Roadmap**](./docs/ROADMAP.md): See what's coming next.
-   [**User Guide**](./docs/user_guide.md): How to use the application.
-   [**Architecture**](./docs/architecture.md): System design.
-   [**Agent Guidelines**](./docs/agent-guidelines.md): Coding standards for AI agents.

---

## 📄 License

ProcessAce is **source-available** under the **ProcessAce Sustainable Use License**.
See [`LICENSE`](./LICENSE) for details.

---

## 🤝 Contributing

Contributions are welcome! Please check [`CONTRIBUTING.md`](./CONTRIBUTING.md).

---

## ✨ What is ProcessAce?

ProcessAce is a self-hosted engine that turns raw **process evidence** into standard, tool-agnostic process documentation.

Planned capabilities:

- Ingest multiple input types:
  - Video and audio recordings (meetings, interviews, screen recordings)
  - Images and screenshots (UIs, whiteboards, diagrams)
  - Text documents (SOPs, emails, notes, PDFs)
- Normalize these into a structured “process evidence” model (steps, actors, systems, events).
- Generate standard process artifacts:
  - **BPMN 2.0**-compliant diagrams (XML)
  - **SIPOC** tables
  - **RACI** matrices
  - Narrative documentation (Markdown/HTML)
- Run anywhere:
  - Self-hosted via Docker / containers
  - **Bring your own LLM** (OpenAI-compatible APIs or local models)
- Handle long-running operations:
  - Use **background workers** and a job queue for heavy tasks (e.g. large media files, multi-step analysis)
  - Keep HTTP APIs responsive with async job status tracking

The goal is to make process discovery and documentation **fast, auditable, and infrastructure-agnostic**.

---

## 🧱 High-level architecture (planned)

- **Frontend**: Web UI for uploading evidence, monitoring jobs, and reviewing/editing generated artifacts.
- **API Backend**:
  - Accepts uploads and requests.
  - Enqueues long-running tasks into a **job queue**.
  - Exposes job and artifact status.
- **Background workers**:
  - Process large files (transcription, parsing).
  - Run LLM-based analysis and artifact generation.
  - Emit structured, event-style logs for audit and process mining.
- **LLM abstraction layer**:
  - Pluggable provider configuration (OpenAI, Azure OpenAI, local gateways, etc.).
  - No hard-coded dependency on a specific vendor.
- **Persistence**:
  - Database for projects, evidence, jobs, and **versioned artifacts**.
  - Blob storage for raw uploads and generated files.

See [`docs/architecture.md`](./docs/architecture.md) for more details.

---

## 🚀 Getting started

> Note: Until the first stable version is tagged, setup instructions may change.

### Prerequisites

- **Docker & Docker Compose** (Recommended)
- OR Node.js v24+ and a running Redis instance (for local dev)
- An LLM provider (OpenAI compatible)

### Quick Start (Docker)

1.  Clone the repository:
    ```bash
    git clone https://github.com/<your-org>/processace.git
    cd processace
    ```

2.  Configure environment:
    ```bash
    cp .env.example .env
    # Edit .env to set your LLM_API_KEY
    ```

3.  Run with Docker Compose:
    ```bash
    docker compose up -d --build
    ```

4.  Open `http://localhost:3000`

### Local Development (without Docker)

If you prefer running locally:

1.  Start a Redis instance on `localhost:6379`.
2.  Install dependencies: `npm install`.
3.  Run the server: `npm run dev`.

Docker and production deployment instructions will be added once the initial services are in place.

---

## 🔑 Bring your own LLM

ProcessAce does **not** bundle or resell any LLM.  
You configure your own provider and keys.

Planned configuration model:

- Environment variables (e.g. `OPENAI_API_KEY`, `GOOGLE_API_KEY`, `ANTHROPIC_API_KEY`)
- Profile-based configuration to support multiple providers

Examples and templates will be added under `config/` and in the documentation.

---

## 📝 Logging, auditability, and versioning

ProcessAce is designed to support **audit trails** and **process mining**:

- Structured, event-style logging:
  - Events like `job_queued`, `job_started`, `llm_call`, `artifact_version_created`.
  - Suitable for ingestion into log analytics or process mining tools.
- LLM call audit:
  - Clear information about prompts (or redacted prompts) and responses.
- Versioned artifacts:
  - BPMN/SIPOC/RACI/documents are stored with explicit versions and history.
  - No destructive overwrite of process documents.

More details and expectations for contributors and agents are in  
[`docs/agent-guidelines.md`](./docs/agent-guidelines.md).

---

## 📄 License

ProcessAce is **source-available** under the **ProcessAce Sustainable Use License**.

- Free to:
  - Use internally (personal or commercial)
  - Self-host for your own organization or per-client projects
  - Modify for internal use
- Restricted:
  - You **may not** run ProcessAce as a general-purpose, multi-tenant SaaS/platform,
    or resell it as a standalone product, without a commercial license.

See [`LICENSE`](./LICENSE) for the full terms.

---

## 🏢 Commercial / Enterprise use

If you want to:

- Offer ProcessAce (or a derived version) as a hosted product/SaaS
- Embed ProcessAce as a core part of a commercial platform
- Obtain additional rights, features, support, or SLAs

please contact: `<your-email@example.com>`.

A separate commercial/enterprise license is available.  
See [`COMMERCIAL_LICENSE.md`](./COMMERCIAL_LICENSE.md) for an overview.

---

## 🤝 Contributing

Contributions are welcome while the project is in early development.

- Open issues for ideas, questions, and bug reports.
- Use pull requests for code and documentation changes.

By contributing, you agree that your contributions may be used in both the Sustainable Use edition and any future commercial editions of ProcessAce (see the “Contributions” section in `LICENSE`).

See [`CONTRIBUTING.md`](./CONTRIBUTING.md) and [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md) for details.

---

## 🗺️ Roadmap (early draft)

- [ ] Minimal ingestion pipeline (text + basic transcripts)
- [ ] Job queue + worker setup for long-running tasks
- [ ] First BPMN 2.0 XML generator
- [ ] SIPOC + RACI generation from structured evidence
- [ ] Simple web UI (upload, job status, preview, download)
- [ ] Docker-based deployment (API, workers, DB, queue, UI)
- [ ] Multi-provider LLM adapter
- [ ] Advanced media ingestion (screen recordings, images)

Feedback on priorities is appreciated via issues.
