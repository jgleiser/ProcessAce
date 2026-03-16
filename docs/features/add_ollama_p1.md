# Feature Implementation Guide: Seamless Local LLM (Ollama) Integration

## 1. Context and Objectives

The application already supports OpenAI, Anthropic, and Google Gemini through the App Settings page. Those providers and their current API-key flows must continue to work without regression.

Phase 17.1 adds first-class Ollama support for generation workloads only. Ollama uses an OpenAI-compatible API, so we can continue to reuse `OpenAIProvider`, but the integration must reflect the current settings architecture and must not let a locally scoped Ollama URL be reused later with a real OpenAI API key.

### Key Requirements

- **Preserve Existing Providers:** OpenAI, Anthropic, and Google Gemini behavior must remain compatible with the current UI and backend flows.
- **No API Key Friction:** Ollama must be selectable without adding an API key card or requiring a fake key in the UI.
- **Provider-Scoped URL Handling:** Ollama must use its own stored base URL so a previously saved local endpoint cannot leak into later OpenAI requests.
- **Security First:** Ollama traffic must be restricted to explicitly trusted local endpoints, with SSRF validation enforced by parsed URLs rather than string matching.
- **Dynamic Model Loading:** Ollama must reuse the existing `/v1/models` flow via `listModels()` with provider-specific configuration resolution.

### Scope Boundary

- This phase covers Ollama for LLM generation only.
- Transcription settings remain unchanged in phase 17.1.
- Docker Compose orchestration, model downloads, and model-manager UI remain part of phase 17.2.

---

## 2. Frontend Implementation

The current settings page already has:

- Section 1 for provider API-key management
- Section 2 for default generation provider, model selection, and base URL override
- Separate transcription settings

This phase must extend that structure instead of replacing it.

### A. Keep Section 1 API Key Cards Unchanged (`src/public/app-settings.html`)

Do not add an Ollama API-key card.

Section 1 must continue to manage only:

- `openai.apiKey`
- `google.apiKey`
- `anthropic.apiKey`

This preserves the existing provider setup flow and avoids introducing a meaningless Ollama credential entry.

### B. Update Section 2 Provider Selection (`src/public/app-settings.html`, `src/public/js/app-settings.js`)

The default generation provider selector currently derives most options from configured API-key providers. Revise that behavior so:

1. `Ollama (Local)` is always available in the generation provider selector.
2. OpenAI, Google, and Anthropic remain available according to the existing configured-provider logic.
3. Selecting Ollama does not require an API key to have been configured first.

Implementation intent:

- Extend the provider list used by the generation settings UI to include `ollama`.
- Treat `ollama` as a special selectable provider that is always present.
- Keep transcription provider handling unchanged.

### C. Preserve the Existing Base URL UX but Make It Provider-Aware

Section 2 already contains a base URL field. Keep that field in place, but change its behavior from a shared global override to a provider-aware input.

Required behavior:

1. When the selected generation provider is `ollama`:
   - Load the value from `ollama.baseUrl`.
   - Default to `http://localhost:11434/v1` if no value is stored yet.
   - Show help text explaining that Ollama requires the `/v1` compatibility path.
   - Show Ollama-specific guidance for Docker users: `http://host.docker.internal:11434/v1`.
2. When the selected generation provider is `openai`:
   - Load the provider-scoped OpenAI-compatible URL if present.
   - If no provider-scoped OpenAI URL exists yet, fall back to the legacy `llm.baseUrl` value for backward compatibility.
   - Keep the existing optional custom endpoint behavior for trusted OpenAI-compatible deployments.
3. When the selected provider is `google` or `anthropic`:
   - Do not apply an OpenAI-compatible base URL at runtime.
   - The input may be hidden or disabled because those SDK integrations do not use this setting.

The frontend must never treat the base URL field as a single shared value across providers after this phase.

### D. Provider Change Behavior

When the user switches the generation provider:

- Clear the in-memory model list for the selector.
- Reload the provider-specific saved model if the current provider matches the persisted `llm.provider`.
- Reload the provider-specific base URL state for the selected provider.
- Update help text and placeholder text based on the selected provider.
- Do not delete or overwrite saved API keys for OpenAI, Google, or Anthropic.
- Do not reuse the last Ollama URL when switching back to OpenAI.

### E. Save Flow Requirements

Saving generation settings must persist:

- `llm.provider`
- `llm.model`
- `ollama.baseUrl` when provider is `ollama`
- provider-scoped OpenAI-compatible base URL state when provider is `openai`

The save flow must not:

- overwrite `openai.apiKey`
- blank out unrelated provider settings
- store an Ollama URL into the legacy shared `llm.baseUrl` field as the active source of truth

The legacy `llm.baseUrl` value may still be read as fallback for backward compatibility, but new Ollama saves must use `ollama.baseUrl`.

---

## 3. Settings and Storage Changes

The current `llm.baseUrl` setting is unsafe as a global shared override because it can survive provider switches. This phase must introduce provider-scoped resolution.

### Required Settings Keys

- `llm.provider`
- `llm.model`
- `ollama.baseUrl`
- optional provider-scoped OpenAI-compatible base URL key for OpenAI if the implementation stores one explicitly
- legacy `llm.baseUrl` retained only as a backward-compatibility fallback for existing OpenAI-compatible setups

### Runtime Resolution Rules

At runtime, the generation config resolver must behave as follows:

1. Read `llm.provider` and `llm.model`.
2. Resolve provider credentials based on the selected provider.
3. Resolve base URL based on the selected provider only.
4. Never pass a stale URL from one provider into another provider's runtime config.

Decision-complete resolution behavior:

- `provider === 'ollama'`
  - `apiKey`: ignore any stored provider key and use an in-memory dummy non-secret value only
  - `baseURL`: `ollama.baseUrl` if set, otherwise `http://localhost:11434/v1`
- `provider === 'openai'`
  - `apiKey`: `openai.apiKey`
  - `baseURL`: provider-scoped OpenAI-compatible URL if present; otherwise fallback to legacy `llm.baseUrl`
- `provider === 'google'`
  - `apiKey`: `google.apiKey`
  - `baseURL`: unused
- `provider === 'anthropic'`
  - `apiKey`: `anthropic.apiKey`
  - `baseURL`: unused

### Migration / Backward Compatibility

This phase must preserve existing OpenAI-compatible custom endpoint behavior.

Migration rule:

- Treat `llm.baseUrl` as a legacy OpenAI-compatible override only.
- Do not use `llm.baseUrl` as the source of truth for Ollama after this phase.
- Do not delete `llm.baseUrl` during this phase.

This approach preserves current OpenAI-compatible deployments while isolating the new Ollama URL path.

---

## 4. Backend Implementation

### A. Update Provider Factory (`src/llm/index.js`)

Add explicit `ollama` support in the provider factory.

Required behavior:

- Preserve existing `openai`, `google`, and `anthropic` routing.
- Add `ollama` as a valid provider name.
- For `ollama`:
  - overwrite any incoming API key in memory with a dummy non-secret string
  - set `baseURL` to `http://localhost:11434/v1` when not explicitly provided
  - route to `OpenAIProvider`

Important security note:

- The dummy key exists only because the OpenAI SDK expects a non-empty string.
- The dummy key must never be stored back into settings.
- The dummy key does not replace endpoint validation. URL trust checks must still run for Ollama.

### B. Update Generation Config Resolution (`src/services/settingsService.js`, workers, and settings API usage)

The application currently passes generation config through shared settings and worker paths. Revise that resolution so the active provider determines which base URL is loaded.

Required behavior:

- `settingsService.getLLMConfig()` must return provider-appropriate `apiKey` and `baseUrl`.
- Workers must consume the resolved provider-specific config without applying extra cross-provider fallback.
- `/api/settings/verify-provider` must resolve configuration based on the provider being verified, not by blindly using a shared base URL.

Decision-complete verification behavior:

- `provider === 'ollama'`
  - resolve `baseURL` from request payload first, then `ollama.baseUrl`, then the localhost default
  - do not fetch or forward `openai.apiKey`
- `provider === 'openai'`
  - resolve `apiKey` from request payload first, then `openai.apiKey`
  - resolve `baseURL` from request payload first, then provider-scoped OpenAI-compatible storage, then legacy `llm.baseUrl`
- `provider === 'google'` or `provider === 'anthropic'`
  - continue current provider verification behavior
  - ignore OpenAI-compatible base URL handling

### C. Apply Strict Ollama SSRF Validation (`src/llm/openaiProvider.js` or shared validator)

Do not use `String.includes()` checks for trusted endpoints.

All Ollama endpoint validation must:

1. Parse `config.baseURL` with the URL API.
2. Enforce an allowed protocol list.
3. Validate hostnames exactly.
4. Reject malformed or credential-bearing URLs.

Allowed Ollama destinations:

- `http://localhost:11434/v1`
- `http://127.0.0.1:11434/v1`
- `http://[::1]:11434/v1`
- `http://host.docker.internal:11434/v1`

Trusted host rule for Ollama:

- Allow only `localhost`, `127.0.0.1`, `::1`, and `host.docker.internal`

Reject all of the following for Ollama:

- private network IPs such as `10.x.x.x`, `172.16.x.x` through `172.31.x.x`, and `192.168.x.x`
- link-local and metadata targets such as `169.254.169.254`
- external domains and public IPs
- URLs with embedded username/password
- non-HTTP protocols
- malformed URLs

Implementation rule:

- Apply this trust validation because the selected provider is `ollama`, not because an API key is missing.
- A dummy key must not weaken the SSRF guard.

### D. Preserve Existing OpenAI-Compatible Custom Endpoint Support

OpenAI-compatible custom endpoint support already exists in the product and must remain available for OpenAI after this phase.

Requirements:

- Do not block existing trusted OpenAI-compatible deployments just because Ollama now exists as a first-class provider.
- Keep any OpenAI custom endpoint path clearly documented as an explicit admin configuration.
- Do not apply Ollama's local-only trust policy to all OpenAI-compatible traffic unless the selected provider is `ollama`.

This distinction is necessary to preserve compatibility with current OpenAI-compatible configurations while still locking Ollama to trusted local destinations.

### E. Dynamic Model Loading

No special model-list implementation is required for Ollama because its OpenAI-compatible `/v1/models` endpoint matches the existing `listModels()` flow.

Required backend behavior:

- `listModels()` remains unchanged for the Ollama path.
- `/api/settings/verify-provider` must instantiate the provider with the correct provider-specific URL and credential context.
- For Ollama, verification must succeed without an API key and must use the resolved local base URL.

---

## 5. Public Interfaces and Settings Impact

Phase 17.1 introduces the following public configuration changes:

- `ollama` becomes a valid generation provider value.
- `ollama.baseUrl` becomes a persisted setting for the local Ollama endpoint.
- Existing `openai.apiKey`, `google.apiKey`, and `anthropic.apiKey` settings remain unchanged.
- Transcription settings remain unchanged in this phase.

Backward-compatibility note:

- Existing deployments that rely on `llm.baseUrl` for OpenAI-compatible routing must continue to work after this phase.

---

## 6. Testing and Validation

Automated tests are required for this phase. Manual testing alone is not sufficient because this change affects runtime security and provider selection behavior.

### A. Unit Tests

Add provider-factory tests covering:

- `ollama` routes to `OpenAIProvider`
- `ollama` injects a dummy non-secret key in memory
- `ollama` defaults to `http://localhost:11434/v1`
- `openai`, `google`, and `anthropic` routing remains unchanged

Add URL-validation tests covering Ollama acceptance cases:

- `http://localhost:11434/v1`
- `http://127.0.0.1:11434/v1`
- `http://[::1]:11434/v1`
- `http://host.docker.internal:11434/v1`

Add URL-validation tests covering Ollama rejection cases:

- `http://169.254.169.254/v1`
- `http://192.168.1.10:11434/v1`
- `http://10.0.0.5:11434/v1`
- `http://localhost.evil.com/v1`
- `https://example.com/v1`
- malformed URLs
- URLs containing credentials

Add settings/runtime tests covering:

- saving an Ollama URL does not affect later OpenAI generation requests
- legacy `llm.baseUrl` still works for existing OpenAI-compatible setups
- `settingsService.getLLMConfig()` returns provider-scoped URL resolution

### B. Frontend Behavior Checks

Add frontend-focused coverage or equivalent test assertions for:

- Ollama appears in the generation provider selector even without any API key configured
- selecting Ollama updates the base URL field to Ollama-specific state and help text
- switching back to OpenAI restores OpenAI-compatible state without reusing the Ollama URL
- model loading sends the selected provider and its active provider-specific URL

### C. Manual Validation Checklist

1. Go to `/app-settings.html`.
2. Confirm the OpenAI, Google, and Anthropic API-key cards still work exactly as before.
3. Confirm `Ollama (Local)` appears in the generation provider selector without requiring a saved API key.
4. Select Ollama and verify the base URL field resolves to `http://localhost:11434/v1` when no value has been stored.
5. Save Ollama as the default generation provider and run artifact generation with a local Ollama instance.
6. Confirm the application calls Ollama through the OpenAI-compatible endpoint path.
7. Switch back to OpenAI and verify the application no longer uses the saved Ollama URL.
8. Attempt provider verification for Ollama with `http://169.254.169.254/v1` and confirm the backend rejects it.
9. Confirm OpenAI-compatible custom endpoint behavior still works for existing OpenAI setups that depended on `llm.baseUrl`.

---

## 7. Assumptions

- Phase 17.1 adds Ollama only for generation, not for transcription.
- Phase 17.2 remains responsible for Docker orchestration, model pulls, background downloads, and real-time progress UI.
- Google and Anthropic integrations remain unchanged in this phase.
- The revised implementation must preserve current OpenAI-compatible custom endpoint behavior rather than removing it.
