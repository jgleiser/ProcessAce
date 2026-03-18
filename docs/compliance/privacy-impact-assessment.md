# Privacy Impact Assessment

## System summary

ProcessAce is a self-hosted process discovery platform used by organizations to upload business evidence, generate process artifacts, collaborate in workspaces, and administer access centrally. Organizational data is treated as installation-owned, not user-owned.

## Data categories

- account data: name, email, role, status, login timestamps
- consent data: consent type, timestamp, IP address
- collaboration data: workspaces, memberships, invitations, notifications
- evidence data: uploaded file metadata, transcripts, evidence-derived content
- artifact data: BPMN, SIPOC, RACI, narrative documents, export filenames
- security telemetry: redacted logs, correlation IDs, audit access events

## Lawful basis

- contract and legitimate interest for operating the service and supporting collaboration
- legal obligation and legitimate interest for security logging, audit trails, and incident response records

## Data flow overview

1. User authenticates against the local application.
2. User uploads evidence or manages workspace data.
3. Background workers process evidence and may call the configured LLM or STT provider.
4. Generated artifacts, notifications, and audit events are stored locally.
5. Authorized users retrieve artifacts, evidence, and settings through authenticated routes with audit logging.

## Third-party processors and transfer considerations

- The operator may configure OpenAI, Google, Anthropic, or local Ollama.
- Cross-border transfers depend on the selected provider and the operator's deployment region.
- Operators must review provider DPA terms and regional hosting implications before enabling a cloud provider for regulated workloads.

## Primary privacy risks

- unauthorized access to workspace data
- excessive retention of organization-owned process records
- prompt or transcript content sent to external model providers
- misuse of privileged admin controls
- insecure transport or storage of regulated data

## Implemented mitigations

- Phase 1: secret hardening, CORS restrictions, cookie protection, authorization fixes, normalized error handling
- Phase 2: admin-approved registration, CSP nonces, upload validation, invitation minimization, Docker and Redis hardening
- Phase 3: Redis-backed token revocation, login lockout, redacted logs, read-access audit trail, encrypted SQLite in production, TLS deployment overlay
- Phase 4: consent tracking, user data export, self-deactivation with workspace transfer, superadmin-only full-instance reset, enterprise role separation

## Residual risks

- external model providers may still receive regulated content when explicitly configured by the operator
- compliance obligations depend on the operator's retention, backup, and processor-management practices
- manual operational procedures remain necessary for breach handling and legal response

## Review owner and cadence

- Owner: Security / Privacy lead for the deploying organization
- Review cadence: at least annually, and after any major feature or provider-processing change
- Last template update: 2026-03-18
