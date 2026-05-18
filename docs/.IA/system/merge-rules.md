# Merge Rules

**Scope:** Rules for resolving drift and consolidating `.IA` after merges.

---

# When To Apply

Apply after:

- git merge
- rebase
- cherry-pick
- parallel agent work
- multi-session documentation updates

---

# Merge Workflow

Use:

```txt
docs/.IA/prompts/merge-consolidation.md
```

for guided consolidation.

---

# Rules

1. Preserve valid operational knowledge from both sides.
2. Resolve duplicated content by keeping the most current and accurate version.
3. Correct structural drift incrementally — not in bulk rewrites.
4. Preserve existing indexes when valid; update only when content changed.
5. Never create new files during consolidation unless strictly necessary.
6. Remove duplicated bootstrap prompts if found outside `system/`.

---

# Conflict Resolution Priority

1. Evidence-based content over inferred content.
2. More recent operational discovery over older documentation.
3. Concise version over verbose version (when equivalent).
4. Explicit human input over AI inference.

---

# Structural Drift Classification

Classify files encountered during merge review as:

| Classification | Meaning |
|---|---|
| `keep` | Valid, accurate, no conflict |
| `consolidate` | Duplicate exists; merge into primary |
| `move` | Wrong domain; relocate |
| `legacy` | Outdated; can be removed |
| `structural drift` | Violates `.IA` structure rules |
| `unknown` | Requires human review |

---

# Post-Merge Validation

After consolidation, confirm:

- no duplicated bootstrap prompts outside `system/`
- all folders still contain `index-<folder>.md`
- no source-of-truth duplication
- no orphaned files
