# Changelog

All notable changes to ProcessAce will be documented in this file.

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
