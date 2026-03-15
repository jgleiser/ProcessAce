# Agent Rules

## 1. Code Quality & Architecture

- **Priority Hierarchy:** Optimize for Maintainability first, Scalability second, Performance third.
- **Readability:** Write self-documenting code. Favor clarity and explicit intent over cleverness.
- **Naming:** Use descriptive, intent-revealing names. Use verbs for functions, nouns for classes/structures, and question-like prefixes for booleans.
- **Structure:** Enforce the Single Responsibility Principle and strict separation of concerns. Keep modules loosely coupled and highly cohesive.
- **Comments:** Comments must only explain _why_ a technical decision was made, never _what_ the code is doing.

## 2. Production-Readiness & Security

- **Resilience:** Validate all inputs early (fail fast). Handle edge cases, empty states, and concurrent access. Ensure strict resource cleanup.
- **Error Handling:** Fail explicitly. Never silently swallow errors. Separate recoverable errors from fatal ones.
- **Security Default:** Sanitize all external inputs and encode outputs. Enforce least privilege. Never hardcode secrets or credentials.
- **State:** Prefer pure functions. Make operations idempotent where applicable.

## 3. Scalability & Performance

- **Data:** Implement pagination by default for data sets. Never load unbounded arrays.
- **Design:** Use configuration files for changeable values.
- **Optimization:** Measure before optimizing. Avoid blocking I/O operations. Focus on asymptotic complexity (Big O) over micro-optimizations.

## 4. Agent Workflow & Communication

- **Before Coding:** Clarify ambiguities, project constraints, and existing patterns. Do not assume requirements.
- **Decision Making:** For architectural choices, propose 2-3 options with trade-offs and wait for user direction.
- **Formatting Responses:** Output strictly as: Brief Context -> Code -> Key Decisions.
- **Brevity:** Do not explain standard patterns, simple CRUD operations, or language idioms.
- **Tech Debt:** Refuse to write code with security vulnerabilities or memory leaks. Tag and document any acceptable strategic technical debt.

## 5. Dev Environment

- **Operating System:** You are working in Windows and use Powershell terminal.

## 6. Project Specifics

- **Agent folder:** All rules to follow are found at `.agent/rules/` folder.
