# Processing Activities Register

## Scope

This register summarizes the main personal-data processing activities currently implemented in ProcessAce.

| Activity                           | Purpose                                                          | Data Categories                                                                                   | Data Subjects                               | Lawful Basis                          | Storage                                               | Recipients / Processors                                             |
| ---------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------- |
| Account and authentication         | Create accounts, sign in users, manage roles and approvals       | name, email, password hash, login timestamps, consent records, session identifiers                | employees, consultants, administrators      | contract, legitimate interest         | SQLite, Redis blocklist, logs                         | hosting operator                                                    |
| Workspace collaboration            | Organize shared process work and membership                      | user identifiers, emails, membership roles, invitations, notifications                            | employees, consultants                      | contract, legitimate interest         | SQLite                                                | hosting operator                                                    |
| Evidence upload and transcription  | Receive source material and extract transcript text              | filenames, file metadata, transcript text, evidence metadata, possible regulated business content | employees, customers referenced in evidence | contract, legitimate interest         | filesystem uploads, SQLite                            | LLM / STT provider selected by operator                             |
| Artifact generation and export     | Produce BPMN, SIPOC, RACI, and narrative artifacts               | evidence-derived process content, artifact text, export filenames                                 | employees, customers referenced in evidence | contract                              | SQLite, generated downloads                           | LLM provider selected by operator                                   |
| Notifications and admin operations | Inform users about approvals, invitations, and account lifecycle | user identifiers, titles, notification metadata                                                   | employees, consultants, administrators      | legitimate interest                   | SQLite                                                | hosting operator                                                    |
| Audit and security logging         | Detect misuse, support investigations, prove access history      | redacted request metadata, correlation IDs, actor IDs, resource IDs                               | authenticated users, administrators         | legal obligation, legitimate interest | structured logs                                       | hosting operator                                                    |
| LLM provider processing            | Generate or transcribe content using configured provider         | prompts, transcripts, evidence-derived text, model metadata                                       | employees, customers referenced in evidence | contract, legitimate interest         | provider-side transient processing per operator setup | OpenAI, Google, Anthropic, or local Ollama, depending on deployment |

## Retention guidance

- Accounts and workspace data: retained until removed by organizational administrators or full-instance reset
- Audit logs: retain according to internal policy and regulatory obligations
- Uploads and generated artifacts: retained as organization-owned records until deleted by authorized operators
- Consent records: retained for auditability while the account exists, or until organizational erasure procedures require removal

## Controller / processor note

ProcessAce is designed for self-hosted organizational use. The deploying entity acts as controller for the business data entered into the system and chooses any third-party model providers used for processing.
