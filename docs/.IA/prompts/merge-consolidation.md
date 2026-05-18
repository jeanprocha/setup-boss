# Merge Consolidation Prompt

**Purpose:** Consolidate `.IA` documentation after a merge, rebase, or parallel documentation update.

---

# When To Use

Use after:

- git merge or rebase
- cherry-pick that brought in documentation changes
- parallel agent work produced overlapping `.IA` updates
- multi-session documentation drift is suspected

---

# Mandatory First Steps

1. Read `docs/.IA/index.md`
2. Read `docs/.IA/system/merge-rules.md`
3. Inspect changed `.IA` files from the merge

---

# Behavior

1. Identify duplicated content across domains
2. Identify outdated information
3. Identify structural drift (wrong domain, wrong file location)
4. Preserve valid operational knowledge from all sides
5. Consolidate duplicates into the domain that owns the content
6. Update indexes if files were added, removed, or moved

---

# Classification

Classify each affected file:

| Classification | Action |
|---|---|
| `keep` | No changes needed |
| `consolidate` | Merge into primary; remove duplicate |
| `move` | Relocate to correct domain |
| `legacy` | Remove if no longer accurate |
| `structural drift` | Fix placement; correct domain |
| `unknown` | Flag for human review |

---

# Constraints

- Do NOT remove valid operational knowledge
- Do NOT perform bulk rewrites
- Do NOT invent content to fill gaps
- Prefer incremental correction over full restructure

---

# After Consolidation

Confirm:

- No duplicated bootstrap prompts outside `system/`
- All folders contain `index-<folder>.md`
- No source-of-truth duplication remains
- No orphaned files
