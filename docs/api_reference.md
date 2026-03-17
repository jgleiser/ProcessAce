# ProcessAce API Reference

All API endpoints are served under `http://localhost:3000` (default).

> **Authentication**: Unless noted otherwise, all endpoints require a valid JWT in the `auth_token` HTTP-only cookie (set by `POST /api/auth/login`).

---

## Health

| Method | Path      | Auth | Description                |
| ------ | --------- | ---- | -------------------------- |
| `GET`  | `/health` | No   | Returns `{ status: "ok" }` |

---

## Authentication (`/api/auth`)

| Method | Path                 | Auth | Description                          |
| ------ | -------------------- | ---- | ------------------------------------ |
| `POST` | `/api/auth/register` | No   | Register a new user                  |
| `POST` | `/api/auth/login`    | No   | Authenticate and receive JWT cookie  |
| `POST` | `/api/auth/logout`   | No   | Clear the auth cookie                |
| `GET`  | `/api/auth/me`       | Yes  | Get current user profile             |
| `PUT`  | `/api/auth/me`       | Yes  | Update current user (name, password) |

### `POST /api/auth/register`

**Body**: `{ "name": "string", "email": "string", "password": "string" }`

- Password: 8+ chars, uppercase, lowercase, numbers.
- First user becomes `admin`; subsequent users get `viewer` role.
- Returns `201` with user object.

### `POST /api/auth/login`

**Body**: `{ "email": "string", "password": "string" }`

- Sets `auth_token` HTTP-only cookie (24h expiry).
- Returns `200` with `{ message, user }`.

### `PUT /api/auth/me`

**Body**: `{ "name"?: "string", "password"?: "string", "currentPassword"?: "string" }`

- `currentPassword` required when changing password.

---

## Evidence (`/api/evidence`)

| Method | Path                             | Auth | Description                                  |
| ------ | -------------------------------- | ---- | -------------------------------------------- |
| `POST` | `/api/evidence/upload`           | Yes  | Upload a file for processing                 |
| `GET`  | `/api/evidence/:id/file`         | Yes  | Stream the original evidence file            |
| `POST` | `/api/evidence/:id/process-text` | Yes  | Submit edited transcript text for processing |

### `POST /api/evidence/upload`

**Content-Type**: `multipart/form-data`

- `file` (required): The evidence file.
- `workspaceId` (optional): Workspace to associate with.
- `processName` (optional): Custom process name.
- `uploadType` (optional): Use `audio` to force audio/video handling.
- Provider/model from app settings are used automatically.
- Audio/video uploads return `202 Accepted` with `{ evidenceId, jobId, phase: "transcription", statusUrl }`.
- Text/document uploads return `202 Accepted` with `{ evidenceId, jobId, phase: "processing", statusUrl }`.

### `GET /api/evidence/:id/file`

- Streams the original evidence file for playback or download.
- Supports `Range` requests for audio/video seeking.
- Returns `206 Partial Content` when `Range` is provided.

### `POST /api/evidence/:id/process-text`

**Body**: `{ "text": "string", "processName"?: "string", "workspaceId"?: "string" }`

- Writes the edited transcript to a new evidence file.
- Enqueues a `process_evidence` job.
- Returns `202 Accepted` with `{ evidenceId, jobId, phase: "processing", statusUrl }`.

---

## Jobs (`/api/jobs`)

| Method   | Path            | Auth | Description                               |
| -------- | --------------- | ---- | ----------------------------------------- |
| `GET`    | `/api/jobs`     | Yes  | List jobs (filtered by workspace or user) |
| `GET`    | `/api/jobs/:id` | Yes  | Get a specific job with artifacts         |
| `PATCH`  | `/api/jobs/:id` | Yes  | Update job (e.g. process name)            |
| `DELETE` | `/api/jobs/:id` | Yes  | Delete job, evidence, and artifacts       |

### `GET /api/jobs`

**Query**: `?workspaceId=<id>` (optional)

- Returns jobs for the current user, optionally filtered by workspace.

### `GET /api/jobs/:id`

- Returns job data with associated artifacts array.

### `PATCH /api/jobs/:id`

**Body**: `{ "processName": "string" }`

- Updates the job's `process_name` field.

### `DELETE /api/jobs/:id`

- Cascading delete: removes the job, associated evidence files, and all artifacts.

---

## Artifacts (`/api/artifacts`)

| Method | Path                             | Auth | Description                    |
| ------ | -------------------------------- | ---- | ------------------------------ |
| `GET`  | `/api/artifacts/:id/content`     | Yes  | Download/view artifact content |
| `PUT`  | `/api/artifacts/:id/content`     | Yes  | Update artifact content        |
| `GET`  | `/api/artifacts/:id/export/docx` | Yes  | Export narrative to DOCX       |

### `GET /api/artifacts/:id/content`

**Query**: `?view=true` (optional) — omit `Content-Disposition` header for inline viewing.

- Returns artifact content with appropriate MIME type (`text/xml`, `application/json`, `text/markdown`, `text/plain`).

### `PUT /api/artifacts/:id/content`

**Body**: `{ "content": "string | object" }`

- Objects are JSON-stringified before storage.

### `GET /api/artifacts/:id/export/docx`

- Exports a generated `doc` (narrative) artifact to an OOXML `.docx` file.
- Generates a file attachment via `Content-Disposition: attachment`.
- Will return a `400 Bad Request` if the artifact type is not exactly `doc`.

---

## Workspaces (`/api/workspaces`)

| Method   | Path                                        | Auth | Description                     |
| -------- | ------------------------------------------- | ---- | ------------------------------- |
| `GET`    | `/api/workspaces`                           | Yes  | List current user's workspaces  |
| `POST`   | `/api/workspaces`                           | Yes  | Create a new workspace          |
| `DELETE` | `/api/workspaces/:id`                       | Yes  | Delete a workspace (Owner only) |
| `GET`    | `/api/workspaces/:id/members`               | Yes  | Get workspace members           |
| `PUT`    | `/api/workspaces/:id/members/:userId`       | Yes  | Update member role              |
| `DELETE` | `/api/workspaces/:id/members/:userId`       | Yes  | Remove member                   |
| `POST`   | `/api/workspaces/:id/invite`                | Yes  | Invite user                     |
| `GET`    | `/api/workspaces/:id/invitations`           | Yes  | List pending invitations        |
| `DELETE` | `/api/workspaces/:id/invitations/:inviteId` | Yes  | Revoke invitation               |

### `POST /api/workspaces`

**Body**: `{ "name": "string" }`

- Returns `201` with workspace object.

### `DELETE /api/workspaces/:id`

- Deletes a workspace and all its contents.
- **Note**: Only the workspace owner can delete it.

### `GET /api/workspaces/:id/members`

- Returns a list of members in the workspace with their roles.

### `PUT /api/workspaces/:id/members/:userId`

**Body**: `{ "role": "viewer" | "editor" }`

- Updates a member's role.
- **Note**: Only the workspace owner can manage roles.

### `DELETE /api/workspaces/:id/members/:userId`

- Removes a member from the workspace.

### `POST /api/workspaces/:id/invite`

**Body**: `{ "email": "string", "role": "viewer" | "editor" }`

- Invites a user to the workspace.
- Returns `200` with the invitation object.

### `GET /api/workspaces/:id/invitations`

- Returns a list of pending invitations for the workspace.

### `DELETE /api/workspaces/:id/invitations/:inviteId`

- Revokes a pending invitation.

---

## Settings (`/api/settings`) — Admin Only

| Method   | Path                                      | Auth  | Description                                  |
| -------- | ----------------------------------------- | ----- | -------------------------------------------- |
| `GET`    | `/api/settings`                           | Admin | Get all application settings                 |
| `PUT`    | `/api/settings`                           | Admin | Create or update a setting by key            |
| `DELETE` | `/api/settings`                           | Admin | Delete a setting by key                      |
| `POST`   | `/api/settings/verify-provider`           | Admin | Verify LLM provider and list models          |
| `GET`    | `/api/settings/llm/catalog`               | Admin | Get the curated Ollama model catalog         |
| `POST`   | `/api/settings/llm/pull`                  | Admin | Start an Ollama generation model download    |
| `DELETE` | `/api/settings/llm/model`                 | Admin | Remove an installed Ollama generation model  |
| `GET`    | `/api/settings/llm/pull/:jobId`           | Admin | Get generation model pull status             |
| `GET`    | `/api/settings/transcription/catalog`     | Admin | Get the local transcription catalog metadata |
| `POST`   | `/api/settings/transcription/pull`        | Admin | Start a transcription model download job     |
| `DELETE` | `/api/settings/transcription/model`       | Admin | Remove an installed transcription model      |
| `GET`    | `/api/settings/transcription/pull/:jobId` | Admin | Get transcription model pull status          |

### `PUT /api/settings`

**Body**: `{ "key": "string", "value": "string" }`

- Generation settings include keys such as `llm.provider`, `llm.model`, `openai.baseUrl`, and `ollama.baseUrl`.
- Transcription settings include `transcription.provider`, `transcription.model`, and `transcription.maxFileSizeMB`.
- API keys such as `openai.apiKey`, `google.apiKey`, and `anthropic.apiKey` are encrypted before storage.

### `DELETE /api/settings`

**Body**: `{ "key": "string" }`

### `POST /api/settings/verify-provider`

**Body**: `{ "provider": "string", "apiKey": "string", "baseUrl"?: "string" }`

- Tests the connection and returns `{ models: [...] }`.
- For Ollama, this uses the OpenAI-compatible `/v1/models` path against the selected local base URL.

### `POST /api/settings/llm/pull`

**Body**: `{ "modelName": "string", "baseUrl"?: "string" }`

- Enqueues a background generation model download job.
- Returns `202 Accepted` with `{ jobId, status }`.

### `GET /api/settings/llm/pull/:jobId`

- Returns persisted model pull progress, status text, completion result, or failure details.

---

## Admin (`/api/admin`) — Admin Only

| Method  | Path                   | Auth  | Description                          |
| ------- | ---------------------- | ----- | ------------------------------------ |
| `GET`   | `/api/admin/users`     | Admin | List all users (paginated)           |
| `PATCH` | `/api/admin/users/:id` | Admin | Update a user's role and/or status   |
| `GET`   | `/api/admin/jobs`      | Admin | List all jobs (paginated, all users) |

### `GET /api/admin/users`

**Query**: `?page=1&limit=10`

- Returns `{ users: [...], pagination: { page, limit, total, totalPages } }`.

### `PATCH /api/admin/users/:id`

**Body**: `{ "role"?: "admin" | "editor" | "viewer", "status"?: "active" | "inactive" }`

- Updates one or both fields.
- Cannot modify your own user.

### `GET /api/admin/jobs`

**Query**: `?page=1&limit=20&type=process_evidence` (all optional)

- Returns `{ jobs: [...], pagination: { page, limit, total, totalPages } }`.
- Each job includes `evidenceId` (when available).
- Filters support: `user`, `workspace`, `status`, `type`, `provider`, `model`.
- Each job enriched with `user`, `workspace`, `artifacts`, `llm_provider`, `llm_model`.

---

## Notifications (`/api/notifications`)

| Method   | Path                          | Auth | Description                 |
| -------- | ----------------------------- | ---- | --------------------------- |
| `GET`    | `/api/notifications`          | Yes  | List user's notifications   |
| `PUT`    | `/api/notifications/:id/read` | Yes  | Mark a notification as read |
| `PUT`    | `/api/notifications/read-all` | Yes  | Mark all as read            |
| `DELETE` | `/api/notifications/:id`      | Yes  | Delete a notification       |

### `GET /api/notifications`

- Returns an array of notifications for the authenticated user.
- Each notification includes `id`, `type`, `message`, `data`, `is_read`, `created_at`.

---

## Invitations (`/api/invitations`)

| Method | Path                              | Auth | Description                     |
| ------ | --------------------------------- | ---- | ------------------------------- |
| `GET`  | `/api/invitations`                | Yes  | List user's pending invitations |
| `GET`  | `/api/invitations/:token`         | No   | Get invitation details by token |
| `POST` | `/api/invitations/:token/accept`  | Yes  | Accept an invitation            |
| `POST` | `/api/invitations/:token/decline` | Yes  | Decline an invitation           |

### `POST /api/invitations/:token/accept`

- Adds the user to the workspace with the invited role.
- Returns `200` with the updated invitation.

### `POST /api/invitations/:token/decline`

- Marks the invitation as declined.
- Returns `200` with the updated invitation.

## Error Responses

All endpoints return errors in the format:

```json
{ "error": "Error message description" }
```

Common HTTP status codes:

| Code  | Meaning                                  |
| ----- | ---------------------------------------- |
| `400` | Bad request (missing/invalid parameters) |
| `401` | Unauthorized (missing or invalid JWT)    |
| `403` | Forbidden (insufficient role)            |
| `404` | Resource not found                       |
| `409` | Conflict (e.g. duplicate user)           |
| `500` | Internal server error                    |
