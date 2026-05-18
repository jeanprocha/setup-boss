# decisions/ — Index

**Domain:** Architectural Decisions  
**Scope:** Long-term architectural decisions with persistent operational relevance.

---

# Purpose

Documents architectural decisions that have lasting impact on how setup-boss behaves, evolves, and is operated.

This domain is NOT:

- a changelog
- a task history
- a feature list

---

# Files In This Domain

| File | Purpose |
|---|---|
| `index-decisions.md` | This file |
| `architectural-decisions.md` | Core decisions: PATCH strategy, shadow mode, run-context, governance profiles, hybrid executor |

---

# Justification

This domain exists because:

- PATCH strategy (unique `search` required) has deep implications for all target projects
- Shadow mode vs active mode per subsystem is a rollout decision that affects operational safety
- `run-context.json` as compact source of truth is a deliberate architectural tradeoff
- Governance policy profiles (FAST/NORMAL/STRICT/ENTERPRISE) affect every run
- Hybrid executor fallback guarantee is a safety contract

---

# Maintenance

Add a decision when:

- an architectural choice has long-term operational implications
- a tradeoff was made that future maintainers need to understand
- a constraint was introduced that limits future evolution

Do NOT add:

- fake ADRs
- placeholder decisions
- decisions that are self-evident from the code

---

# Relationship With Other Domains

- `architecture/overview.md` — references decisions; does not duplicate them
- `standards/security.md` — references PATCH security decision
- `standards/workflow.md` — references governance profile decision
