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

| Method | Path                   | Auth | Description                  |
| ------ | ---------------------- | ---- | ---------------------------- |
| `POST` | `/api/evidence/upload` | Yes  | Upload a file for processing |

### `POST /api/evidence/upload`

**Content-Type**: `multipart/form-data`

- `file` (required): The evidence file.
- `workspaceId` (optional): Workspace to associate with.
- `processName` (optional): Custom process name.
- Provider/model from app settings are used automatically.
- Returns `202 Accepted` with `{ evidenceId, jobId, statusUrl }`.

---

## Jobs (`/api/jobs`)

| Method   | Path            | Auth | Description                               |
| -------- | --------------- | ---- | ----------------------------------------- |
| `GET`    | `/api/jobs`     | Yes  | List jobs (filtered by workspace or user) |
| `GET`    | `/api/jobs/:id` | Yes  | Get a specific job with artifacts         |
| `PUT`    | `/api/jobs/:id` | Yes  | Update job (e.g. process name)            |
| `DELETE` | `/api/jobs/:id` | Yes  | Delete job, evidence, and artifacts       |

### `GET /api/jobs`

**Query**: `?workspaceId=<id>` (optional)

- Returns jobs for the current user, optionally filtered by workspace.

### `GET /api/jobs/:id`

- Returns job data with associated artifacts array.

### `PUT /api/jobs/:id`

**Body**: `{ "processName": "string" }`

- Updates the job's `process_name` field.

### `DELETE /api/jobs/:id`

- Cascading delete: removes the job, associated evidence files, and all artifacts.

---

## Artifacts (`/api/artifacts`)

| Method | Path                         | Auth | Description                    |
| ------ | ---------------------------- | ---- | ------------------------------ |
| `GET`  | `/api/artifacts/:id/content` | Yes  | Download/view artifact content |
| `PUT`  | `/api/artifacts/:id/content` | Yes  | Update artifact content        |

### `GET /api/artifacts/:id/content`

**Query**: `?view=true` (optional) — omit `Content-Disposition` header for inline viewing.

- Returns artifact content with appropriate MIME type (`text/xml`, `application/json`, `text/markdown`, `text/plain`).

### `PUT /api/artifacts/:id/content`

**Body**: `{ "content": "string | object" }`

- Objects are JSON-stringified before storage.

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

| Method   | Path                            | Auth  | Description                         |
| -------- | ------------------------------- | ----- | ----------------------------------- |
| `GET`    | `/api/settings`                 | Admin | Get all application settings        |
| `PUT`    | `/api/settings/:key`            | Admin | Create or update a setting          |
| `DELETE` | `/api/settings/:key`            | Admin | Delete a setting                    |
| `POST`   | `/api/settings/verify-provider` | Admin | Verify LLM provider and list models |

### `PUT /api/settings/:key`

**Body**: `{ "value": "string" }`

- Known keys: `llm_provider`, `llm_model`, `llm_api_key`, `llm_base_url`.
- `llm_api_key` is encrypted before storage.

### `POST /api/settings/verify-provider`

**Body**: `{ "provider": "string", "apiKey": "string", "baseURL"?: "string" }`

- Tests the connection and returns `{ models: [...] }`.

---

## Admin (`/api/admin`) — Admin Only

| Method | Path                          | Auth  | Description                          |
| ------ | ----------------------------- | ----- | ------------------------------------ |
| `GET`  | `/api/admin/users`            | Admin | List all users                       |
| `PUT`  | `/api/admin/users/:id/role`   | Admin | Update a user's role                 |
| `PUT`  | `/api/admin/users/:id/status` | Admin | Update a user's status               |
| `GET`  | `/api/admin/jobs`             | Admin | List all jobs (paginated, all users) |

### `PUT /api/admin/users/:id/role`

**Body**: `{ "role": "admin" | "editor" | "viewer" }`

### `PUT /api/admin/users/:id/status`

**Body**: `{ "status": "active" | "inactive" }`

### `GET /api/admin/jobs`

**Query**: `?page=1&limit=20`

- Returns `{ jobs: [...], pagination: { page, limit, total, totalPages } }`.
- Each job enriched with `llm_provider`, `llm_model`, `originalFilename`.

---

## Error Responses

All endpoints return errors in the format:

```json
{ "error": "Error message description" }
```

Common HTTP status codes:
| Code | Meaning |
|------|---------|
| `400` | Bad request (missing/invalid parameters) |
| `401` | Unauthorized (missing or invalid JWT) |
| `403` | Forbidden (insufficient role) |
| `404` | Resource not found |
| `409` | Conflict (e.g. duplicate user) |
| `500` | Internal server error |
