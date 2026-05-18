# Structure Rules

**Scope:** `.IA` folder and file structure governance.

---

# Required Core Structure

```txt
docs/.IA/
├── index.md
├── system/
├── architecture/
├── environment/
├── standards/
└── prompts/
```

Every domain folder must contain `index-<folder>.md`.

---

# Folder Index Rule

Every `.IA` domain must have:

```txt
index-<folder>.md
```

Examples:

```txt
index-system.md
index-architecture.md
index-environment.md
index-standards.md
index-prompts.md
```

Indexes define: purpose, scope, conventions, maintenance rules, AI behavior.

---

# Optional Domains

Optional domains require operational density:

```txt
runbooks/        → deployment, daemon, recovery, CI/CD
observability/   → queues, workers, artifacts, troubleshooting
decisions/       → long-term architectural decisions
history/         → operationally relevant incident/release history
```

A topic existing once does NOT justify a dedicated domain.

---

# Anti-Fragmentation Rule

Do NOT create:

- one-file-per-small-topic structures
- speculative domains
- placeholder-heavy folders
- future-proofing theaters

Prefer consolidation over expansion.

---

# Forbidden Files

The following must NOT exist:

```txt
docs/.IA/prompts/bootstrap-discovery.md
docs/.IA/prompts/bootstrap-create.md
```

If found: classify as structural drift and remove.

---

# Path Convention

All `.IA` paths use:

```txt
docs/.IA/
```

Consistent casing and forward slashes in documentation.
