# architecture/ — Index

**Domain:** Architecture  
**Scope:** How setup-boss is organized, what it does, and how its components relate.

---

# Purpose

Documents the architecture of the setup-boss system for operational and onboarding use.

This domain explains:

- system shape and purpose
- pipeline stages
- runtime modules
- daemon subsystem
- agents
- artifact layout

---

# Files In This Domain

| File | Purpose |
|---|---|
| `index-architecture.md` | This file |
| `overview.md` | Full architecture overview: pipeline, runtimes, daemon, agents, artifacts |

---

# Maintenance

Update when:

- pipeline stages change
- new runtime modules are added or removed
- daemon behavior changes significantly
- artifact layout changes

Do NOT update for individual bugfixes or minor task implementations.

---

# Relationship With Other Domains

- Architectural decisions with long-term impact → `decisions/`
- Environment setup and commands → `environment/`
- Operational standards and workflow → `standards/`
- Daemon lifecycle procedures → `runbooks/daemon.md`
- Per-run artifacts → `observability/signals.md`
