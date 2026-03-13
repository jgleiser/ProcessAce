# ADR-006: Deterministic BPMN Generation via JSON-to-XML Pipeline

- **Status**: Accepted
- **Date**: 2026-03-10
- **Supersedes**: Direct LLM BPMN XML generation (Phase 5 original approach)

## Context

ProcessAce generates BPMN 2.0 diagrams from uploaded process descriptions using LLMs. The original implementation prompted the LLM to output raw BPMN XML directly. This caused recurring issues:

1. **Token truncation**: LLMs non-deterministically truncate long outputs at token limits, producing XML with unclosed tags (e.g. `</bpmn:definitions>` missing).
2. **Namespace errors**: LLMs would omit or misconfigure BPMN namespace declarations.
3. **No layout data**: Raw XML lacked `<bpmndi:BPMNDiagram>` elements, leaving the BPMN viewer unable to render element positions.
4. **Non-deterministic structure**: Identical inputs could produce structurally different XML on successive runs.

These issues caused frontend `bpmn-js` viewer crashes and corrupted artifacts.

## Decision

Replace direct LLM XML generation with a **deterministic, multi-phase pipeline**:

### Phase 1: LLM → JSON graph

- LLM prompted to output a structured JSON object with `processId`, `processName`, `nodes[]`, and `edges[]`.
- LLM providers called with `responseFormat: 'json'` to enforce JSON output mode.

### Phase 2: Zod schema validation

- JSON validated at runtime using a strict Zod schema (`src/schemas/bpmnSchema.js`).
- `.strict()` mode rejects hallucinated properties.
- Cross-reference checks verify unique IDs and valid edge references.

### Phase 3: Self-healing retry loop

- On validation failure, structured Zod error messages are fed back to the LLM as correction prompts.
- Up to 3 attempts before failing the job.
- Both JSON syntax errors and schema violations trigger retries.

### Phase 4: Deterministic XML compilation

- Validated JSON compiled to BPMN 2.0 XML using `xmlbuilder2` (`src/utils/bpmnBuilder.js`).
- Output is **guaranteed** syntactically valid — all tags closed by the builder, namespaces correct.

### Phase 5: Auto-layout

- Raw XML passed through `bpmn-auto-layout` to generate `<bpmndi:BPMNDiagram>` with X/Y coordinates.
- Ensures diagrams render correctly in `bpmn-js` without manual positioning.

## Consequences

### Positive

- **Eliminated XML errors**: `unclosed tag` crashes no longer possible — XML is built programmatically.
- **Smaller LLM output**: JSON graphs are ~3-5x smaller than equivalent BPMN XML, reducing token usage and truncation risk.
- **Deterministic output**: Same JSON input always produces identical XML.
- **Self-healing**: Transient LLM schema violations are corrected automatically without job failure.
- **Type safety**: Zod schema provides JSDoc type inference for IDE autocomplete in vanilla JS.
- **Layout guarantee**: Every diagram has proper DI coordinates for rendering.

### Negative

- **Added dependencies**: `xmlbuilder2`, `bpmn-auto-layout`, and `zod` (3 new packages).
- **Increased latency on failure**: Self-healing retries add up to 2 extra LLM round-trips on validation failures.
- **Reduced LLM creativity**: The strict JSON schema constrains the LLM to predefined node types — custom BPMN extensions require schema updates.

## Files Changed

| File                             | Role                                       |
| -------------------------------- | ------------------------------------------ |
| `src/schemas/bpmnSchema.js`      | Zod schema (single source of truth)        |
| `src/utils/bpmnBuilder.js`       | JSON → XML builder + auto-layout           |
| `src/workers/evidenceWorker.js`  | Self-healing retry loop                    |
| `src/llm/openaiProvider.js`      | `response_format: { type: "json_object" }` |
| `src/llm/googleProvider.js`      | `responseMimeType: "application/json"`     |
| `src/llm/anthropicProvider.js`   | Markdown fence stripping                   |
| `src/llm/index.js`               | Mock LLM returns JSON                      |
| `tests/unit/bpmnBuilder.test.js` | 19 BPMN-specific tests                     |
