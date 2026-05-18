# Update Rules

**Scope:** When and how to update `.IA` documentation.

---

# When To Update

Update `.IA` after:

- important implementations that change architecture or behavior
- architectural decisions with long-term impact
- operational discoveries (new workflows, constraints, patterns)
- infrastructure changes
- debugging sessions that reveal non-obvious system behavior
- after a merge that brings in significant changes

---

# When NOT To Update

Do NOT update `.IA`:

- after every small task
- to log task history
- to mirror changelogs
- to record debugging scratchpad notes
- to generate placeholder documentation

---

# Update Scope

Update only what changed.

- Do NOT re-analyze the entire project for small changes.
- Do NOT rewrite stable operational context unnecessarily.
- Do NOT expand optional domains without new operational density.

---

# Update Workflow

Use:

```txt
docs/.IA/prompts/update-docs.md
```

for guided post-implementation updates.

---

# Lifecycle

```txt
implementation
→ operational consolidation
→ .IA update
→ knowledge preservation
```

`.IA` evolves incrementally, not in bulk rewrites.

---

# Index Maintenance

When adding files to a domain:

- update the domain `index-<folder>.md`
- confirm no source-of-truth duplication was introduced

---

# Drift Prevention

After merges or parallel work, check for:

- duplicated content
- outdated information
- structural drift

Use:

```txt
docs/.IA/prompts/merge-consolidation.md
```
