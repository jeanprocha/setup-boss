# observability/ — Index

**Domain:** Observability  
**Scope:** Per-run artifacts, telemetry signals, cost tracking, and troubleshooting patterns.

---

# Purpose

Documents the observability surface of setup-boss: what artifacts are produced per run, what they contain, and how to use them for diagnostics.

---

# Files In This Domain

| File | Purpose |
|---|---|
| `index-observability.md` | This file |
| `signals.md` | Complete artifact map: metadata.json, prompt-sizes, run-log, optional runtime JSONs |

---

# Justification

This domain exists because:

- Each run produces 10+ distinct JSON artifacts
- Each optional runtime module adds its own artifact set
- Cost/token tracking requires specific knowledge of `metadata.json` structure
- `prompt-sizes.json` requires understanding of when scan is cached vs fresh
- Troubleshooting is a persistent operational activity with non-obvious patterns

---

# Maintenance

Update when:

- new runtime modules produce new artifacts
- `metadata.json` structure changes
- troubleshooting patterns are discovered

---

# Related Docs

- `docs/observability.md` — source observability reference (full detail)
- `architecture/overview.md` — artifact layout overview
- `runbooks/recovery.md` — recovery artifact interpretation
