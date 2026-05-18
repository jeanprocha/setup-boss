# runbooks/ — Index

**Domain:** Runbooks  
**Scope:** Operational procedures for daemon lifecycle and recovery workflows.

---

# Purpose

Provides step-by-step operational procedures for running and recovering setup-boss in practice.

---

# Files In This Domain

| File | Purpose |
|---|---|
| `index-runbooks.md` | This file |
| `daemon.md` | Daemon lifecycle: start, stop, status, worker pool, scheduler, port |
| `recovery.md` | Recovery: retry budgets, replay, resume, exhaustion handling |

---

# Justification

This domain exists because:

- Daemon has an explicit lifecycle (PID, port, DATA_DIR) requiring operational documentation
- Worker pool and scheduler have concurrency parameters with operational impact
- Recovery system has distinct states and procedures not obvious from code alone
- Replay and resume are non-trivial operational workflows

---

# Maintenance

Update when:

- Daemon commands or flags change
- Worker pool or scheduler configuration changes
- Recovery workflow or retry budget behavior changes
- New operational procedures are established

---

# Related Docs

- `docs/operator-guide.md` — full operator reference
- `docs/recovery-system.md` — recovery component details
- `architecture/overview.md` — daemon subsystem architecture
