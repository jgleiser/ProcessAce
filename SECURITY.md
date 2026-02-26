# Security Policy

## Supported versions

ProcessAce is currently in **early development**. Until a first stable release (e.g. `v1.0.0`) is tagged, security support is **best effort** on the `main` branch.

Once stable releases are available, this section will list which versions receive security fixes.

---

## Reporting a vulnerability

If you believe you have found a security vulnerability in ProcessAce, **please do not open a public issue**.

Instead, email:

- **Security contact:** `security@processace.com`
- **Subject:** `ProcessAce Security Report`

Please include, when possible:

- A description of the issue and its potential impact.
- Steps to reproduce the vulnerability.
- Any relevant logs, configuration details, or environment information.
- Whether the issue is already known or exploitable in the wild (if you know).

We aim to:

- Acknowledge receipt of your report as quickly as reasonably possible.
- Investigate and validate the issue.
- Work on a fix and a coordinated disclosure plan.

---

## Responsible disclosure

We kindly ask that you:

- Give us a reasonable amount of time to investigate and fix the issue before public disclosure.
- Avoid testing against production instances you do not own or control.
- Do not access, modify, or destroy data that does not belong to you.

We will:

- Treat your report seriously and in good faith.
- Strive to credit you (if you wish) in release notes or advisories once the issue is resolved.

---

## Security best practices for users

Because ProcessAce is a **self-hosted** and **BYO-LLM** tool, you are responsible for securing your own deployments. We strongly recommend:

- Running ProcessAce behind proper authentication and HTTPS.
- Limiting network exposure (e.g. via firewalls, VPN, reverse proxies).
- Restricting access to admin interfaces and configuration.
- Keeping dependencies and the base OS up to date.
- Treating LLM credentials and other API keys as secrets.

Additional hardening guides and configuration examples will be added to the documentation as the project matures.
