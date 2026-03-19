# ADR 004: Authentication & Authorization

## Status

Accepted

## Context

Through Phases 1–8, ProcessAce ran as a single-user, unauthenticated application. Anyone with network access to the server could upload evidence, view all jobs, and access all artifacts. As the application moved toward multi-user deployment (Phase 11), we needed:

- Identity management (user accounts).
- Session handling for the browser-based SPA.
- Role-based access control (admin vs. regular users).
- Data isolation between users and workspaces.

## Decision

We chose the following approach:

1. **JWT (JSON Web Tokens)** for stateless authentication, stored in **HTTP-only cookies** (not localStorage) to mitigate XSS risks.
2. **bcrypt** (10 salt rounds) for password hashing.
3. **Four roles**: `superadmin`, `admin`, `editor`, `viewer`. The first registered user is automatically promoted to `superadmin`.
4. **User status**: `active` / `inactive` / `pending` / `rejected`. Non-active users are blocked at login.
5. **Workspaces** for organizational grouping. Each user gets a default personal workspace on registration. Jobs and artifacts are scoped to `(user_id, workspace_id)`.
6. **Middleware-based enforcement**: `authenticateToken` on all protected routes, `requireAdmin` on admin routes, and `requireSuperAdmin` on privileged organizational controls.

### Alternatives Considered

- **Session-based auth (server-side sessions)**: Simpler, but ties state to a single server. JWT is more suitable for future horizontal scaling.
- **OAuth / SSO**: Too complex for the current single-deployment model. Can be layered on later.
- **API key auth**: Doesn't suit a browser SPA workflow well.

## Consequences

- All API routes (except `/health`, `/api/auth/register`, `/api/auth/login`) require a valid JWT.
- JWT secret must be configured via `JWT_SECRET` env var in production.
- Password complexity is enforced server-side (8+ chars, uppercase, lowercase, numbers).
- Admin pages (`admin-users.html`, `admin-jobs.html`, `app-settings.html`) are protected by `requireAdmin` middleware.
- Personal workspaces are protected records and are restored to the original user if that user is later reactivated.
- Named workspace ownership can be transferred only by `superadmin` users and only to active existing members.
- Database schema expanded: `users`, `workspaces`, `workspace_members` tables added and later extended with personal-workspace metadata.
