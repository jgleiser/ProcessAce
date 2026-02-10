# ADR 005: Multi-LLM Provider Architecture

## Status
Accepted

## Context
In Phases 1–8, ProcessAce supported only a single LLM provider (OpenAI) configured via environment variables (`OPENAI_API_KEY`). This had several limitations:

- Users locked into one provider.
- Switching providers required restarting the server with different env vars.
- No way to compare outputs across providers.
- API keys stored in plaintext environment variables.

Phase 10 expanded LLM support to Google GenAI and Anthropic. Phase 11 moved API key management to the database with encryption.

## Decision
We adopted a **factory pattern** with pluggable provider implementations:

1. **Provider abstraction** (`src/llm/index.js`): A `getLlmProvider(options)` factory that instantiates the correct provider based on `{ provider, model, apiKey, baseURL }`.
2. **Three provider implementations**:
   - `OpenAIProvider` – uses the `openai` SDK.
   - `GoogleProvider` – uses the `@google/genai` SDK.
   - `AnthropicProvider` – uses the `@anthropic-ai/sdk`.
3. **Unified interface**: Each provider exposes `complete(prompt, system)` and `listModels()`.
4. **DB-stored configuration**: API keys and default provider/model stored in the `app_settings` SQLite table, encrypted with AES-256-CBC via `settingsService.js`.
5. **Per-job override**: Users can select a different provider/model at upload time. The worker reads per-job settings first, falling back to app-wide defaults.
6. **Mock provider**: Enabled via `MOCK_LLM=true` for testing without API calls.

### Alternatives Considered
- **Single adapter with provider URL swapping**: Simpler but doesn't handle SDK differences (Google and Anthropic have very different APIs from OpenAI).
- **Env-var-only config**: Simpler but poor UX — requires server restarts and doesn't support per-job selection.
- **LiteLLM proxy**: External dependency; adds operational complexity for self-hosted users.

## Consequences
- API keys are no longer in environment variables; they're managed via the App Settings UI and stored encrypted.
- `ENCRYPTION_KEY` env var is **required** for key encryption/decryption.
- Each artifact records its `llm_provider` and `llm_model` for full traceability.
- Adding a new provider requires: creating a provider class, registering it in the factory, and adding its SDK to `package.json`.
- The `settings.js` API includes a `POST /api/settings/verify-provider` endpoint to test API keys and list models before saving.
