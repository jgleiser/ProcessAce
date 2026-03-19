# Breach Notification Procedure

## Purpose

Define the minimum response workflow for suspected security incidents involving ProcessAce deployments, with specific attention to personal data, protected health information, and regulated customer content.

## 1. Intake and triage

1. Record the report source, time, affected environment, and initial indicators.
2. Open an incident record with a unique identifier.
3. Preserve the initial evidence:
   - relevant logs
   - database snapshots or backups
   - affected file hashes
   - infrastructure events
4. Assign an incident coordinator.

## 2. Severity classification

- `SEV-1`: confirmed compromise of regulated data, credential theft, destructive tampering, or active unauthorized access
- `SEV-2`: credible exposure with limited scope, security control bypass, or failed-but-material attack chain
- `SEV-3`: suspicious activity with no confirmed data impact yet

## 3. Containment

1. Revoke affected sessions and rotate impacted secrets.
2. Isolate compromised hosts, containers, or credentials.
3. Preserve forensic evidence before rebuilding or deleting infrastructure.
4. Document each containment action with timestamp and operator.

## 4. Investigation

1. Confirm whether personal data, PHI, or customer-controlled evidence was accessed, altered, exported, or deleted.
2. Determine impacted categories:
   - account data
   - workspace collaboration data
   - uploaded evidence
   - generated artifacts
   - audit and notification records
3. Identify root cause, attack window, and affected tenants or installations.

## 5. Escalation roles

- Incident Coordinator: owns timeline, decisions, and status updates
- Security Lead: validates impact and remediation scope
- Engineering Lead: coordinates containment and technical fixes
- Privacy / Compliance Owner: evaluates GDPR and contractual notification duties
- Customer Owner: manages customer communications

## 6. GDPR 72-hour assessment workflow

1. Start the regulatory assessment clock when a personal-data breach is confirmed or strongly suspected.
2. Within 24 hours:
   - confirm breach scope
   - assess categories of data subjects and data involved
   - estimate records affected
   - identify likely consequences
3. Within 72 hours:
   - notify the relevant supervisory authority when required
   - document the legal basis if notification is not required
   - capture facts known, unknowns, mitigations, and next checkpoints

## 7. Customer and regulator communications

- Customer notification must include:
  - incident summary
  - known affected data categories
  - containment steps already taken
  - customer actions required
  - next update time
- Regulator notifications must include:
  - nature of the breach
  - likely consequences
  - mitigation actions taken or planned
  - contact point for follow-up

## 8. Recovery and closure

1. Restore services from trusted artifacts.
2. Validate compensating controls and permanent fixes.
3. Review whether logging, alerting, or procedures must change.
4. Close the incident only after:
   - impact is understood
   - required notices are sent
   - corrective actions are tracked to completion
