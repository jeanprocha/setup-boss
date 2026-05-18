# prompts/ — Index

**Domain:** Operational Prompts  
**Scope:** Post-bootstrap operational workflows for AI agents.

---

# Purpose

This domain contains reusable operational prompts for maintaining the `.IA` system after bootstrap.

---

# Files In This Domain

| File | Purpose |
|---|---|
| `index-prompts.md` | This file |
| `update-docs.md` | Prompt for updating `.IA` after implementations |
| `merge-consolidation.md` | Prompt for resolving drift after merges |

---

# What Does NOT Belong Here

Bootstrap prompts belong ONLY in `system/`:

```txt
docs/.IA/system/bootstrap-discovery.md
docs/.IA/system/bootstrap-create.md
```

These files must NOT exist in `prompts/`.

---

# Governance

Governance rules belong in `system/`, not inside prompts.

Prompts reference governance; they do not redefine it.

---

# Adding New Prompts

Add a new prompt here only when:

- a repeatable operational workflow is identified
- it is distinct from existing prompts
- operational density justifies it

Do NOT add one-off task prompts.
