# system/ — Index

**Domain:** `.IA` Governance  
**Scope:** Defines how the `.IA` system itself operates.

---

# Purpose

This domain governs the `.IA` system.

It does NOT describe project architecture or runtime behavior.

---

# Files In This Domain

| File | Purpose |
|---|---|
| `seed-rules.md` | Bootstrap governance before full `.IA` exists |
| `bootstrap-discovery.md` | Discovery prompt — project analysis before creation |
| `bootstrap-create.md` | Creation prompt — generates `.IA` from discovery result |
| `index-system.md` | This file |
| `structure-rules.md` | Rules for `.IA` folder/file structure |
| `documentation-rules.md` | Rules for writing `.IA` documentation |
| `update-rules.md` | When and how to update `.IA` |
| `merge-rules.md` | Merge and drift resolution rules |
| `prompt-standards.md` | Standards for operational prompts |

---

# Bootstrap Prompt Ownership

Bootstrap prompts belong ONLY to this domain:

```txt
docs/.IA/system/bootstrap-discovery.md
docs/.IA/system/bootstrap-create.md
```

They must NOT exist in `prompts/`.

---

# Maintenance

This domain is updated only when:

- `.IA` governance behavior changes
- Bootstrap contracts are revised
- Structural rules require correction
- AI operational expectations change

Do NOT update governance files for every implementation cycle.
