# Prompt Standards

**Scope:** Standards for operational prompts in `docs/.IA/prompts/`.

---

# Prompt Domain Ownership

The `prompts/` domain is reserved ONLY for post-bootstrap operational workflows.

Expected prompts:

```txt
docs/.IA/prompts/
├── index-prompts.md
├── update-docs.md
└── merge-consolidation.md
```

Bootstrap prompts belong ONLY in `system/`:

```txt
docs/.IA/system/bootstrap-discovery.md
docs/.IA/system/bootstrap-create.md
```

---

# Prompt Characteristics

Operational prompts must be:

- lightweight
- reusable
- governance-aware
- focused on a single workflow

Prompts must NOT:

- redefine governance (governance belongs in `system/`)
- duplicate bootstrap contracts
- contain project-specific runtime behavior (that belongs in `standards/` or `runbooks/`)

---

# Prompt Structure

Each prompt should include:

1. Purpose — what workflow this prompt drives
2. Mandatory inputs — what to read before acting
3. Behavior — what actions to take
4. Constraints — what to avoid

---

# Prompt Size

Prefer short prompts that reference governance rather than restate it.

A prompt that grows longer than ~100 lines likely needs splitting or governance extraction to `system/`.

---

# Adding New Prompts

New operational prompts may be added to `prompts/` only when:

- a repeatable operational workflow is identified
- it is distinct from existing prompts
- operational density justifies it

Do NOT create prompts for one-off tasks.
