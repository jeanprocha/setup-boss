# .IA — Operational Knowledge System

**Version:** 1.0  
**Status:** Stable Baseline  
**Root Path:** `docs/.IA/`

---

# Purpose

The `.IA` directory is the persistent operational knowledge layer of the project.

Its purpose is to preserve:

- operational intelligence
- architectural context
- environment knowledge
- infrastructure constraints
- troubleshooting guidance
- deployment workflows
- AI operational behavior
- long-term technical memory

The `.IA` system exists to reduce dependency on:

- tribal knowledge
- temporary chat context
- implicit operational assumptions
- undocumented workflows
- individual maintainers

---

# Philosophy

The `.IA` system is designed around:

```txt
maximum operational clarity
minimum maintenance overhead
```

The goal is NOT to create a large documentation wiki.

The goal is to create:

- durable operational memory
- maintainable project intelligence
- AI-friendly governance
- concise technical context
- scalable long-term documentation

---

# What `.IA` Is

`.IA` is:

- operational memory
- governance layer
- AI execution context
- architectural context
- troubleshooting context
- operational workflow documentation
- project-specific technical intelligence

---

# What `.IA` Is NOT

`.IA` is NOT:

- a commit log
- a task history mirror
- a debugging scratchpad
- a generic wiki
- a framework tutorial
- a source-code explanation dump
- a temporary note repository
- a placeholder documentation generator

If a document does not improve:

- operational clarity
- troubleshooting
- maintainability
- onboarding
- AI execution quality
- architectural understanding

then it probably should not exist.

---

# Lifecycle

The `.IA` system works in two stages.

---

# 1. Seed Stage

A new project starts with the minimal seed:

```txt
docs/.IA/
├── index.md
└── system/
    ├── seed-rules.md
    ├── bootstrap-discovery.md
    └── bootstrap-create.md
```

This seed is sufficient for an AI agent to:

- analyze the project
- detect architecture
- infer operational complexity
- recommend structure
- generate the complete `.IA` governance layer

The seed must remain small.

The seed is not the final documentation system.

---

# 2. Generated Governance Stage

After bootstrap execution, the AI agent expands `.IA` into a full operational knowledge system.

Typical generated structure:

```txt
docs/.IA/
├── index.md
├── system/
├── architecture/
├── environment/
├── standards/
└── prompts/
```

Optional domains may also exist:

```txt
runbooks/
observability/
decisions/
history/
```

Optional domains are NOT automatically required.

---

# Core Principle — Operational Density

Optional domains require operational density.

A topic existing once does NOT automatically justify a dedicated folder.

Prefer:

```txt
consolidation before expansion
```

A standalone domain should exist only when:

- operational complexity is persistent
- workflows are numerous
- troubleshooting is non-trivial
- maintenance is continuous
- operational knowledge would become too dense for a consolidated file

---

# Examples

## Good candidate for dedicated domain

```txt
observability/
```

when the project contains:

- queues
- workers
- schedulers
- distributed services
- webhook pipelines
- retry systems
- tracing/metrics/logging workflows
- production debugging complexity

---

## Bad candidate for dedicated domain

Creating:

```txt
observability/
```

only because the project writes logs to a file.

In that case:

```txt
standards/observability.md
```

is sufficient.

---

# Project Profile Classification

Projects should be classified during bootstrap.

The project profile influences how much `.IA` structure should exist.

---

## Minimal

Examples:

- landing pages
- small APIs
- simple frontend apps
- internal tools

Expected behavior:

- required domains only
- minimal runbooks
- no optional domains unless strongly justified

---

## Standard

Examples:

- typical full-stack systems
- business applications
- CRUD systems with integrations

Expected behavior:

- baseline structure
- possible runbooks
- moderate operational documentation

---

## Operational

Examples:

- queue-based systems
- worker-heavy systems
- webhook integrations
- systems with deployment complexity

Expected behavior:

- runbooks likely justified
- observability may be justified
- operational workflows become important

---

## Complex

Examples:

- distributed systems
- multi-service platforms
- orchestration-heavy systems
- infrastructure-sensitive systems

Expected behavior:

- multiple optional domains justified
- deeper operational documentation
- stronger troubleshooting context
- persistent architectural decisions

---

# Bootstrap Flow

The `.IA` stack must always be created using a two-step process.

---

# Step 1 — Discovery

Run:

```txt
docs/.IA/system/bootstrap-discovery.md
```

Purpose:

- inspect the project
- detect architecture
- detect operational complexity
- detect infrastructure signals
- classify project profile
- recommend `.IA` structure
- identify unknowns
- identify justified optional domains

The discovery step MUST NOT modify files.

---

# Step 2 — Creation

Run:

```txt
docs/.IA/system/bootstrap-create.md
```

Purpose:

- generate the `.IA` structure
- create governance files
- create operational prompts
- generate domain indexes
- preserve existing knowledge
- avoid overengineering
- consolidate structure
- enforce `.IA` rules

---

# Same-Session Recommendation

Bootstrap discovery and bootstrap creation should preferably run in the same AI conversation/session.

This reduces risk of:

- context drift
- inconsistent inference
- structure divergence
- bootstrap mismatch

---

# Bootstrap Prompt Ownership

Bootstrap prompts belong ONLY to:

```txt
docs/.IA/system/
```

Official bootstrap prompts:

```txt
docs/.IA/system/bootstrap-discovery.md
docs/.IA/system/bootstrap-create.md
```

They are:

- seed assets
- governance assets
- bootstrap contracts

They are NOT operational prompts.

---

# Prompts Domain

The `prompts/` domain is reserved ONLY for post-bootstrap operational workflows.

Correct structure:

```txt
docs/.IA/prompts/
├── index-prompts.md
├── update-docs.md
└── merge-consolidation.md
```

The following files MUST NOT exist:

```txt
docs/.IA/prompts/bootstrap-discovery.md
docs/.IA/prompts/bootstrap-create.md
```

If they exist, this is considered:

```txt
structural drift
```

---

# Core Domains

---

# system/

Defines how `.IA` itself operates.

Includes:

- governance
- structure rules
- documentation rules
- update rules
- merge rules
- AI operational behavior
- bootstrap ownership
- prompt standards

This domain governs `.IA`.

It does NOT describe the project architecture itself.

---

# architecture/

Defines:

- architecture shape
- modules
- integrations
- service boundaries
- infrastructure topology
- important technical constraints

This domain explains how the project is organized.

---

# environment/

Defines:

- local setup
- tooling
- commands
- access patterns
- SSH/VPN/database workflows
- operational limitations
- runtime assumptions

Secrets must NEVER be stored here.

---

# standards/

Defines:

- coding conventions
- operational standards
- security expectations
- observability expectations
- workflow conventions

Standards must remain practical and concise.

---

# prompts/

Defines reusable operational workflows.

Typical prompts:

```txt
update-docs.md
merge-consolidation.md
```

Prompts must remain lightweight.

Governance belongs in:

```txt
system/
```

not inside prompts.

---

# Optional Domains

Optional domains must be justified by operational density.

Possible domains:

```txt
runbooks/
observability/
decisions/
history/
```

---

# runbooks/

Create only if:

- deployments exist
- migrations require care
- recovery workflows matter
- SSH/server operations exist
- CI/CD exists
- operational procedures are important

---

# observability/

Create only if operational complexity justifies a dedicated domain.

Do NOT create this domain for simple logging.

Use:

```txt
standards/observability.md
```

for simple projects.

---

# decisions/

Create only if architectural decisions have long-term operational relevance.

Do NOT create fake ADRs.

Do NOT create placeholder decisions.

Avoid duplicate sources of truth.

---

# history/

Create only if release or incident history has operational value.

Do NOT use this as:

- task log
- changelog mirror
- commit history
- activity tracker

---

# Source Of Truth Rule

Do not maintain the same operational knowledge as full content in multiple places.

If one domain references another:

- prefer summaries
- prefer pointers
- prefer links/references

Avoid duplicated full explanations.

---

# Sensitive Information Rule

`.IA` must NEVER store:

- passwords
- tokens
- secrets
- private keys
- production credentials

Avoid hardcoding:

- internal IPs
- deploy targets
- SSH hosts
- usernames
- sensitive operational infrastructure

Prefer placeholders:

```bash
ssh <DEPLOY_USER>@<DEPLOY_SERVER>
```

Operational workflows may be documented.

Sensitive values must not.

---

# Language Standard

All `.IA` documentation must be written in English.

This includes:

- prompts
- standards
- runbooks
- indexes
- governance
- troubleshooting
- operational documentation

Mixed-language documentation should be avoided.

---

# Folder Index Rule

Every generated `.IA` folder must contain:

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

Indexes define:

- purpose
- scope
- conventions
- maintenance rules
- AI behavior expectations

---

# Confidence Rules

AI agents must classify uncertain information when needed.

Use:

```txt
HIGH CONFIDENCE
```

when directly supported by project evidence.

Use:

```txt
MEDIUM CONFIDENCE
```

when strongly inferred from structure.

Use:

```txt
LOW CONFIDENCE
```

when weakly inferred.

Use:

```txt
REQUIRES HUMAN INPUT
```

when information cannot be safely inferred.

---

# Anti-Hallucination Rule

AI agents must NEVER invent:

- infrastructure
- deployments
- integrations
- credentials
- production behavior
- monitoring tools
- server topology
- operational guarantees

Unknown information must be explicitly marked.

---

# Documentation Lifecycle

`.IA` should evolve incrementally.

Documentation updates should happen:

- after important implementations
- after architectural changes
- after operational discoveries
- after infrastructure changes
- after debugging sessions
- after merge consolidation

Avoid massive rewrites whenever possible.

---

# Operational Workflows

After bootstrap, maintenance typically happens through:

```txt
docs/.IA/prompts/update-docs.md
```

and:

```txt
docs/.IA/prompts/merge-consolidation.md
```

---

# update-docs.md

Used after:

- implementations
- architectural changes
- operational discoveries
- infrastructure updates

Purpose:

- consolidate knowledge
- update relevant docs
- avoid drift
- preserve operational clarity

---

# merge-consolidation.md

Used after:

- merge
- rebase
- cherry-pick
- multi-agent work
- parallel documentation updates

Purpose:

- consolidate knowledge
- remove duplication
- resolve drift
- preserve operational context

---

# AI Operational Rules

Any AI agent interacting with this project should:

1. Read `docs/.IA/index.md` first.
2. Read relevant domain indexes before major operations.
3. Preserve operational clarity.
4. Avoid unnecessary files.
5. Prefer consolidation over fragmentation.
6. Avoid duplicated knowledge.
7. Preserve valid existing context.
8. Avoid hallucination.
9. Respect operational limitations.
10. Keep prompts lightweight.
11. Keep governance inside `system/`.
12. Never duplicate bootstrap prompts.
13. Validate optional domain necessity before expansion.

---

# Relationship With Source Code

Source code explains:

```txt
how the system works
```

`.IA` explains:

```txt
how the system should be understood, operated, maintained, and evolved
```

Both layers must evolve together.

Expected lifecycle:

```txt
implementation
→ operational consolidation
→ documentation update
→ knowledge preservation
```

---

# Final Rule

The `.IA` system exists to preserve operational intelligence over time.

If a document does not significantly improve:

- operational understanding
- troubleshooting
- maintainability
- onboarding
- AI execution quality
- architectural clarity

then it probably should not exist.