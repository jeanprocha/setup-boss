# `.IA` Seed Rules

**Version:** 1.0  
**Status:** Stable Seed Governance  
**Applies To:** `.IA` bootstrap stage before full governance generation

---

# Purpose

This file defines the governance rules for the `.IA` seed stage.

The seed stage is the minimal operational bootstrap state required to initialize the `.IA` system.

Its purpose is to provide:

- bootstrap governance
- operational constraints
- anti-bloat rules
- bootstrap ownership rules
- initialization behavior
- AI operational expectations

before the full `.IA` governance layer exists.

---

# Seed Philosophy

The seed must remain:

```txt
small
stable
minimal
portable
reusable
```

The seed is NOT the final `.IA` structure.

The seed exists only to:

```txt
bootstrap the real .IA system
```

---

# Minimal Seed Structure

The minimal seed must contain ONLY:

```txt
docs/.IA/
├── index.md
└── system/
    ├── seed-rules.md
    ├── bootstrap-discovery.md
    └── bootstrap-create.md
```

This is sufficient for an AI agent to:

- analyze the project
- classify operational complexity
- infer architecture
- recommend structure
- generate the full governance layer

---

# Seed Responsibilities

The seed stage is responsible for:

1. Defining `.IA` philosophy
2. Defining bootstrap governance
3. Defining bootstrap ownership
4. Preventing structural drift
5. Preventing hallucinated documentation
6. Preventing overengineering
7. Preventing unnecessary domains
8. Defining initialization flow
9. Defining anti-duplication behavior
10. Defining bootstrap lifecycle

---

# Bootstrap Flow

The `.IA` seed must always be expanded using TWO steps.

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
- classify project profile
- identify optional domains
- identify unknowns
- recommend structure

The discovery step MUST NOT modify files.

---

# Step 2 — Creation

Run:

```txt
docs/.IA/system/bootstrap-create.md
```

Purpose:

- generate `.IA`
- create governance files
- create operational prompts
- generate indexes
- preserve operational knowledge
- consolidate structure
- enforce `.IA` rules

---

# Same-Session Recommendation

Bootstrap discovery and bootstrap creation should preferably run in the same AI conversation/session.

This reduces:

- inference drift
- structure mismatch
- context loss
- optional domain inconsistency

The Discovery Result is expected to remain available in the active AI session.

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

These files are:

- bootstrap assets
- governance assets
- seed contracts

They are NOT operational prompts.

---

# Forbidden Bootstrap Duplication

The following files MUST NOT exist:

```txt
docs/.IA/prompts/bootstrap-discovery.md
docs/.IA/prompts/bootstrap-create.md
```

If they exist:

```txt
structural drift
```

has occurred.

Corrective behavior:

- preserve official versions in `system/`
- remove or consolidate duplicated versions
- never recreate duplicates in `prompts/`

---

# Prompts Domain Ownership

The `prompts/` domain is reserved ONLY for:

- post-bootstrap workflows
- maintenance workflows
- operational prompts

Correct structure:

```txt
docs/.IA/prompts/
├── index-prompts.md
├── update-docs.md
└── merge-consolidation.md
```

Prompts must remain:

```txt
lightweight
governance-aware
operational
```

Governance belongs in:

```txt
system/
```

not inside prompts.

---

# Seed Scope

The seed should define ONLY:

- bootstrap behavior
- governance initialization
- anti-bloat philosophy
- ownership rules
- lifecycle rules
- initialization constraints

The seed should NOT contain:

- architecture documentation
- environment documentation
- runbooks
- observability docs
- ADRs
- troubleshooting guides
- operational workflows
- deployment docs

Those belong to the generated governance stage.

---

# Anti-Bloat Rule

Prefer:

```txt
consolidation before expansion
```

The seed must avoid:

- excessive structure
- speculative domains
- future-proofing theater
- placeholder-heavy documentation
- one-file-per-small-topic patterns

The seed must remain:

```txt
portable
minimal
stable
```

---

# Operational Density Rule

Optional domains require:

```txt
operational density
```

A topic existing once does NOT justify a dedicated domain.

A dedicated domain should exist only when:

- operational complexity is persistent
- workflows are numerous
- troubleshooting is continuous
- operational maintenance is significant
- knowledge density exceeds what a consolidated file can reasonably contain

---

# Project Profile Rule

During discovery, the project must be classified as:

```txt
minimal
standard
operational
complex
```

This classification influences:

- structure size
- optional domains
- operational depth
- governance density

---

# minimal

Expected behavior:

- required domains only
- minimal structure
- almost no optional domains

---

# standard

Expected behavior:

- baseline structure
- moderate operational documentation

---

# operational

Expected behavior:

- operational workflows matter
- runbooks likely justified
- observability may be justified

---

# complex

Expected behavior:

- multiple optional domains justified
- deep operational documentation
- persistent troubleshooting context

---

# Source Of Truth Rule

Do not duplicate full operational knowledge across domains.

If a domain already owns detailed content:

- use summaries
- use references
- use pointers

Avoid duplicated full explanations.

---

# Sensitive Information Rule

The `.IA` system must NEVER store:

- passwords
- secrets
- tokens
- private keys
- production credentials

Avoid hardcoding:

- deploy targets
- internal hosts
- SSH targets
- infrastructure identifiers

Prefer placeholders:

```bash
ssh <DEPLOY_USER>@<DEPLOY_SERVER>
```

Operational workflows may be documented.

Sensitive operational values must not.

---

# Hallucination Prevention Rule

AI agents must NEVER invent:

- infrastructure
- deployments
- integrations
- production behavior
- observability tooling
- monitoring systems
- architectural decisions
- operational guarantees

Unknown information must be explicitly marked.

---

# Unknown Information Rule

If information is missing:

Use:

```txt
Unknown / Not documented yet
```

If information requires human confirmation:

Use:

```txt
REQUIRES HUMAN INPUT
```

Do NOT present inferred information as guaranteed fact.

---

# Confidence Rule

Use confidence classifications when necessary.

Use:

```txt
HIGH CONFIDENCE
```

when directly supported by evidence.

Use:

```txt
MEDIUM CONFIDENCE
```

when strongly inferred.

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

# Existing `.IA` Handling

If `.IA` already exists:

1. Preserve valid operational knowledge.
2. Avoid destructive rewrites.
3. Prefer consolidation over recreation.
4. Preserve existing indexes when valid.
5. Correct structural drift incrementally.
6. Remove duplicated bootstrap prompts outside `system/`.
7. Avoid unnecessary restructuring.

Classify existing files as:

```txt
keep
consolidate
move
legacy
structural drift
unknown
```

---

# Required Governance Transition

After bootstrap creation, `.IA` transitions from:

```txt
seed stage
```

to:

```txt
generated governance stage
```

The generated governance stage normally includes:

```txt
docs/.IA/
├── system/
├── architecture/
├── environment/
├── standards/
└── prompts/
```

Optional domains may exist only when operational density justifies them.

---

# Required Folder Index Rule

Every generated `.IA` domain must contain:

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
- maintenance behavior
- ownership
- AI operational expectations

---

# Language Rule

All `.IA` documentation must be written in English.

This includes:

- governance
- prompts
- standards
- runbooks
- troubleshooting
- operational docs
- indexes

Mixed-language documentation should be avoided.

---

# Generated Governance Ownership

After bootstrap, governance belongs primarily to:

```txt
docs/.IA/system/
```

This includes:

- structure rules
- update rules
- merge rules
- documentation rules
- prompt standards
- AI operational expectations

Operational prompts should remain lightweight and reference governance instead of redefining it.

---

# Operational Lifecycle Rule

After bootstrap, `.IA` maintenance normally happens through:

```txt
docs/.IA/prompts/update-docs.md
```

and:

```txt
docs/.IA/prompts/merge-consolidation.md
```

These prompts are:

- maintenance workflows
- not governance sources
- not bootstrap assets

---

# Post-Bootstrap Expectations

After bootstrap generation:

- the project should contain stable operational governance
- AI agents should rely on `.IA`
- operational context should persist in the repository
- prompts should become lightweight
- governance should remain centralized

The system should avoid becoming:

- a documentation wiki
- a changelog mirror
- a task archive
- a fragmented knowledge base

---

# Final Rule

The seed exists ONLY to bootstrap the real `.IA` system.

If a rule, file, or domain is not necessary to safely generate and govern `.IA`, it probably does not belong in the seed.

Bootstrap prompts belong ONLY in:

```txt
docs/.IA/system/
```