# Project Governance

This document describes how **ProcessAce** is governed: who makes decisions, how changes are accepted, and how maintainers are selected.

The goal is to keep governance **simple, transparent, and predictable**, especially while the project is in its early stages.

---

## 1. Roles

### 1.1. Owner / Lead Maintainer

- Defines the overall **vision, roadmap, and scope** of ProcessAce.
- Has final say on **architectural decisions**, roadmap priorities, and releases.
- Can grant or revoke maintainer status.

> Current owner/lead maintainer:
>
> - `Jose Gleiser (@jgleiser)`

### 1.2. Maintainers

- Review and merge pull requests.
- Triage issues (label, prioritize, close when resolved).
- Help enforce the Code of Conduct.
- Participate in design and roadmap discussions.

Maintainers are trusted contributors with a long-term interest in ProcessAce.

### 1.3. Contributors

- Anyone who opens issues, submits pull requests, improves documentation, or participates in discussions.
- Contributors do not have merge rights but are essential to the project.

---

## 2. Decision making

### 2.1. Day-to-day decisions

- Most technical decisions are made through:
  - Pull requests and their review discussions.
  - GitHub Issues and design discussions.
- Maintainers aim to reach **rough consensus** in public threads.
- If consensus cannot be reached, the **owner/lead maintainer** may make the final decision.

### 2.2. Larger changes (architecture, breaking changes)

For significant or breaking changes (e.g. new core modules, refactors, licensing changes):

- An issue or proposal should be opened to discuss the idea before implementation.
- The owner/lead maintainer will:
  - Gather feedback from maintainers and contributors.
  - Decide whether to accept, modify, or reject the proposal.
- For very impactful changes, a short **design document** (in `docs/`) may be requested.

### 2.3. Roadmap

- The high-level roadmap is owned by the **lead maintainer**.
- Community feedback (issues, upvotes, discussions) heavily influences prioritization.
- Enterprise / commercial requirements may influence milestones, but the open repository will remain transparent about changes and direction.

---

## 3. Becoming a maintainer

Maintainers are typically selected from active contributors who:

- Have submitted several **high-quality contributions** (code, docs, or reviews).
- Demonstrate **good judgment** and alignment with the project’s goals.
- Communicate respectfully and constructively.
- Show interest in **long-term involvement**.

The process:

1. The owner/lead maintainer may invite a contributor to become a maintainer.
2. The invitation will be based on contribution history and community behavior.
3. If accepted, the contributor will:
   - Be added with write access to the repository.
   - Be listed in this document (or a separate `MAINTAINERS.md`) as a maintainer.

There is no strict numeric threshold; quality and consistency of contributions matter more than raw count.

---

## 4. Losing maintainer status

Maintainer status may be removed if:

- The maintainer is inactive for a long period.
- There is repeated violation of the Code of Conduct.
- There is a persistent misalignment with the project’s goals or governance.

When possible, this will be discussed privately and resolved amicably. The owner/lead maintainer has the final decision.

Former maintainers can always continue contributing as community members.

---

## 5. Relationship to commercial / enterprise development

ProcessAce has:

- A **public, source-available repository** under the Sustainable Use License.
- A **commercial/enterprise offering** governed by separate contracts.

Governance principles:

- Core development and decision-making for the **public repo** happen in the open (issues, PRs).
- The owner may maintain **private extensions** or enterprise modules; decisions about those are outside the scope of this document.
- Community feedback and contributions to the public repo will continue to shape the direction of ProcessAce, even as commercial features evolve.

---

## 6. Changes to this document

This governance model may evolve as the project grows.

- Changes to `GOVERNANCE.md` will be proposed via pull request.
- Maintainers and contributors are encouraged to review and comment.
- Final approval of governance changes rests with the **owner/lead maintainer**.

---

If you have questions about governance, roles, or how to get more involved, please open an issue or contact the lead maintainer directly.
