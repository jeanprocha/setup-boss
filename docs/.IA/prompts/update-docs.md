# Update Docs Prompt

**Purpose:** Update `.IA` documentation after an implementation, architectural change, or operational discovery.

---

# When To Use

Use this prompt after:

- a significant implementation is complete
- an architectural decision was made
- an operational discovery was made (new constraint, workflow, pattern)
- an infrastructure or environment change occurred

---

# Mandatory First Steps

Before making changes:

1. Read `docs/.IA/index.md`
2. Read the index of the domain(s) likely to be affected
3. Identify what actually changed — do not re-analyze the whole project

---

# Behavior

Update ONLY what changed:

- Update relevant files in affected domains
- Update `index-<folder>.md` if new files were added
- Do NOT rewrite stable operational context
- Do NOT expand optional domains without new operational density
- Do NOT duplicate content that already exists in another domain

---

# Constraints

- English only
- No secrets, tokens, or sensitive values
- No invented infrastructure or behavior
- No placeholder-heavy additions
- Prefer summaries and references over full duplicates

---

# After Updating

Confirm:

- No source-of-truth duplication introduced
- Indexes reflect current domain contents
- No structural drift created
