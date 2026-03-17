# Changelog

All notable changes to ProcessAce will be documented in this file.

## [1.2.0] - 2026-03-17

### Added

- First-class Ollama support for local artifact generation through the existing LLM provider flow.
- Curated local model manager in App Settings with install, use, uninstall, and progress tracking for Ollama generation models.
- Optional bundled Ollama Docker deployment via `docker-compose.ollama.yml`, plus AMD ROCm override support.
- Dedicated Ollama setup and troubleshooting guide in `docs/ollama_guide.md`.
- GitHub-linked Ollama configuration guidance in App Settings when local model verification fails.

### Changed

- The default Docker stack is now cloud-only; bundled Ollama is opt-in instead of always installed.
- Ollama generation now uses provider-scoped base URL handling and environment-driven deployment defaults.
- Documentation set updated to reflect the new Ollama deployment modes, settings flow, and API surface.

### Fixed

- Ollama model detection now normalizes repo-style model IDs such as `:latest` so installed models refresh correctly in the UI.
- Failed Ollama generation jobs now explicitly unload the active model instead of leaving it resident after errors.
- Unsupported Ollama transcription configurations now fail fast instead of reaching a broken runtime path.

## [1.1.0] - 2026-03-15

### Added

- Audio and video uploads with a transcription-first workflow.
- Transcript review tools: save changes, export to TXT, and audio playback with seeking.
- Evidence file streaming endpoint for playback (`GET /api/evidence/:id/file`).
- Transcript processing endpoint (`POST /api/evidence/:id/process-text`).
- Admin Jobs filtering by job type and transcript playback in the admin artifact modal.
- Transcription settings in App Settings (provider, model, max file size) and expanded OpenAI STT model support.

### Changed

- Artifact access in the dashboard emphasizes viewer-based exports instead of direct download buttons.
- Job update endpoint uses `PATCH /api/jobs/:id`.

## [1.0.0] - 2026-02-25

### Added

- Core process evidence workflow with background jobs and artifact generation (BPMN, SIPOC, RACI, narrative doc).
- LLM abstraction with OpenAI, Google GenAI, and Anthropic providers plus model selection UI.
- Interactive editors for BPMN, Markdown docs, and SIPOC/RACI tables with export options.
- Workspaces, invitations, and role-based access control with admin dashboards.
- App settings for LLM configuration with encrypted API key storage.
- Docker-based deployment with SQLite persistence and Redis-backed job queue.
