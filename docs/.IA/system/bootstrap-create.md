# `.IA` Bootstrap Creation Prompt

**Version:** 1.0  
**Mode:** Creation / Update  
**Purpose:** Create or update the `.IA` operational knowledge system using the Bootstrap Discovery Result as source of truth.

---

# Purpose

You are responsible for creating or updating:

```txt
docs/.IA/
```

as the persistent operational knowledge system of this project.

**Path contract (physical):** creation and updates apply only under **`docs/.IA/`** in the target repo. A root-level **`.IA/`** folder is **legacy-only** and must not be the primary destination for new files. The “**.IA** system” is the conceptual layer; the canonical directory is **`docs/.IA/`**.

The `.IA` system is:

- operational memory
- governance layer
- AI execution context
- troubleshooting context
- architectural context
- operational workflow documentation

Your goal is to generate a:

```txt
clean
maintainable
operational
AI-friendly
anti-bloat
production-usable
```

documentation structure.

---

# Mandatory Inputs

Before making changes, read:

1. The Bootstrap Discovery Result.
2. Existing `.IA` files, if they exist.
3. Existing operational documentation referenced by the Discovery Result.
4. Governance files when available:

```txt
docs/.IA/index.md
docs/.IA/system/seed-rules.md
docs/.IA/system/index-system.md
docs/.IA/system/structure-rules.md
docs/.IA/system/documentation-rules.md
docs/.IA/system/update-rules.md
docs/.IA/system/merge-rules.md
docs/.IA/system/prompt-standards.md
```

If no Discovery Result exists:

```txt
STOP
```

and request execution of:

```txt
docs/.IA/system/bootstrap-discovery.md
```

---

# Same-Session Recommendation

Bootstrap discovery and bootstrap creation should preferably run in the same AI conversation/session.

This reduces risk of:

- context drift
- inconsistent inference
- optional domain mismatch
- governance divergence

The Discovery Result is expected to exist directly in the active session context.

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

# Forbidden Files

Do NOT create:

```txt
docs/.IA/prompts/bootstrap-discovery.md
docs/.IA/prompts/bootstrap-create.md
```

If they already exist:

- classify them as structural drift
- preserve the official versions in `system/`
- remove, consolidate, or avoid recreating duplicated versions

---

# Prompts Domain

The generated `prompts/` domain is reserved ONLY for post-bootstrap workflows.

Correct structure:

```txt
docs/.IA/prompts/
├── index-prompts.md
├── update-docs.md
└── merge-consolidation.md
```

Prompts must remain:

- lightweight
- reusable
- governance-aware

Governance belongs inside:

```txt
system/
```

not inside prompts.

---

# Non-Negotiable Rules

You MUST NOT:

- invent infrastructure
- invent deployments
- invent credentials
- invent integrations
- invent production behavior
- invent monitoring tools
- invent architectural decisions
- create placeholder-heavy docs
- create enterprise theater
- create unnecessary domains
- duplicate operational knowledge
- duplicate bootstrap prompts
- overwrite valid existing operational knowledge
- store secrets, tokens, passwords, private keys, or sensitive credentials

---

# Sensitive Information Rule

Do not hardcode:

- deploy targets
- internal IPs
- SSH hosts
- usernames
- infrastructure identifiers

Prefer placeholders:

```bash
ssh <DEPLOY_USER>@<DEPLOY_SERVER>
```

Operational workflows may be documented.

Sensitive values must not.

---

# Source Of Truth Rule

Do not maintain the same operational knowledge as full content in multiple places.

If one domain already owns the detailed explanation:

- use summaries
- use references
- use pointers

Avoid duplicate full explanations.

Example:

If architectural decisions belong to:

```txt
decisions/
```

do not duplicate the same full content inside:

```txt
architecture/
```

---

# Anti-Bloat Rule

Prefer:

```txt
consolidation before expansion
```

Do not create:

- unnecessary folders
- speculative domains
- one-file-per-small-topic structures
- placeholder-heavy documentation
- future-proofing theater

The `.IA` system must remain:

```txt
small
operational
maintainable
```

---

# Operational Density Rule

Optional domains require operational density.

A topic existing once does NOT justify a dedicated domain.

A dedicated domain should exist only when:

- operational complexity is persistent
- workflows are numerous
- troubleshooting is continuous
- operational maintenance is significant
- knowledge density exceeds what a consolidated file can reasonably handle

---

# Project Profile Alignment

The generated structure must align with the project profile discovered during bootstrap.

---

# minimal

Expected behavior:

- only required domains
- minimal structure
- very small operational footprint

---

# standard

Expected behavior:

- baseline domains
- moderate operational documentation
- limited optional domains

---

# operational

Expected behavior:

- runbooks likely justified
- observability possibly justified
- operational workflows important

---

# complex

Expected behavior:

- multiple optional domains justified
- deep operational documentation
- troubleshooting-heavy context

---

# Confidence Rules

When generating inferred information, classify uncertainty when needed.

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

Never present uncertain operational behavior as guaranteed fact.

---

# Required Core Structure

The generated `.IA` should normally include:

```txt
docs/.IA/
├── index.md
├── system/
├── architecture/
├── environment/
├── standards/
└── prompts/
```

Every generated domain MUST contain:

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

---

# Required Baseline Structure

Unless the Discovery Result explicitly recommends simplification, generate:

```txt
docs/.IA/
├── index.md
├── system/
│   ├── seed-rules.md
│   ├── bootstrap-discovery.md
│   ├── bootstrap-create.md
│   ├── index-system.md
│   ├── structure-rules.md
│   ├── documentation-rules.md
│   ├── update-rules.md
│   ├── merge-rules.md
│   └── prompt-standards.md
├── architecture/
│   ├── index-architecture.md
│   └── overview.md
├── environment/
│   ├── index-environment.md
│   ├── local-setup.md
│   └── access.md
├── standards/
│   ├── index-standards.md
│   ├── code-style.md
│   ├── security.md
│   └── workflow.md
└── prompts/
    ├── index-prompts.md
    ├── update-docs.md
    └── merge-consolidation.md
```

---

# Optional Domains

Optional domains should only be created if justified by operational density.

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
- migrations matter
- operational procedures matter
- CI/CD exists
- SSH/server operations exist
- recovery workflows matter

Do NOT create fake runbooks.

---

# observability/

Create only if:

- queues exist
- workers exist
- schedulers exist
- distributed debugging exists
- operational troubleshooting is significant
- monitoring workflows are persistent

For simple projects:

```txt
standards/observability.md
```

is sufficient.

Do NOT create observability domains for simple logging.

---

# decisions/

Create only if:

- important architectural decisions exist
- operational tradeoffs matter
- constraints are long-term
- future maintainers need persistent decision context

Do NOT create:

- fake ADRs
- placeholder decisions
- empty decisions folders

---

# history/

Create only if:

- incidents matter
- migrations matter
- releases matter operationally

Do NOT use as:

- task log
- changelog mirror
- commit history

---

# Existing `.IA` Handling

If `.IA` already exists:

1. Preserve valid operational knowledge.
2. Avoid destructive rewrites.
3. Prefer consolidation over recreation.
4. Preserve existing indexes when valid.
5. Correct structural drift incrementally.
6. Remove duplicated bootstrap prompts outside `system/`.
7. Avoid replacing stable operational context unnecessarily.

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

# Required Root File

Create or update:

```txt
docs/.IA/index.md
```

This file must define:

- `.IA` philosophy
- lifecycle
- bootstrap flow
- operational density rules
- project profile classification
- governance ownership
- prompts ownership
- anti-bloat rules
- source-of-truth rules
- confidence rules
- operational workflows
- AI behavior expectations

This is the operational constitution of `.IA`.

---

# Required System Domain

Create or update:

```txt
docs/.IA/system/
```

This domain governs `.IA` itself.

Generate or update:

```txt
index-system.md
structure-rules.md
documentation-rules.md
update-rules.md
merge-rules.md
prompt-standards.md
```

This domain defines:

- governance
- structure behavior
- documentation behavior
- merge behavior
- AI operational expectations
- anti-fragmentation rules
- prompt ownership

This domain does NOT describe project architecture.

Preserve:

```txt
seed-rules.md
bootstrap-discovery.md
bootstrap-create.md
```

---

# Required Architecture Domain

Create or update:

```txt
docs/.IA/architecture/
```

Generate:

```txt
index-architecture.md
overview.md
```

This domain should describe:

- architecture shape
- modules
- integrations
- service relationships
- constraints
- infrastructure topology

Avoid generic framework explanations.

---

# Required Environment Domain

Create or update:

```txt
docs/.IA/environment/
```

Generate:

```txt
index-environment.md
local-setup.md
access.md
```

Describe:

- tooling
- setup
- commands
- environment assumptions
- operational limitations
- SSH/VPN/database access patterns
- human input requirements

Do NOT store secrets.

---

# Required Standards Domain

Create or update:

```txt
docs/.IA/standards/
```

Generate:

```txt
index-standards.md
code-style.md
security.md
workflow.md
```

This domain should define:

- coding conventions
- operational standards
- security expectations
- workflow conventions
- AI interaction expectations

Avoid generic best-practice filler.

---

# Required Prompts Domain

Create or update:

```txt
docs/.IA/prompts/
```

Generate:

```txt
index-prompts.md
update-docs.md
merge-consolidation.md
```

Do NOT generate bootstrap prompts here.

---

# update-docs.md

Must instruct AI agents to:

- read `docs/.IA/index.md`
- inspect completed work
- update only relevant docs
- preserve concise operational knowledge
- avoid duplication
- avoid bloat
- preserve source-of-truth consistency

---

# merge-consolidation.md

Must instruct AI agents to:

- inspect merge/rebase changes
- preserve valid knowledge
- resolve structural drift
- consolidate duplicated information
- preserve indexes
- preserve operational continuity

---

# Required Post-Create Validation

Before finalizing, validate:

- bootstrap prompts exist ONLY in `system/`
- every folder contains `index-<folder>.md`
- no duplicated source of truth exists
- optional domains are justified
- no unnecessary domains exist
- no sensitive operational targets are hardcoded
- `docs/.IA/` paths are consistent
- prompts contain only operational workflows
- generated structure matches project profile
- no fake operational behavior was invented

---

# Content Style Rules

Generated documentation must be:

```txt
concise
operational
maintainable
human-readable
AI-friendly
```

Avoid:

- giant documents
- generic framework tutorials
- duplicated explanations
- speculative architecture
- implementation noise
- temporary debugging context

---

# Required Final Output

After generation, return:

```md
# `.IA` Bootstrap Creation Result

## 1. Summary

Summarize what was created or updated.

---

## 2. Final `.IA` Tree

Show the final structure.

Bootstrap prompts must appear ONLY in:

```txt
system/
```

---

## 3. Files Created

List all created files.

---

## 4. Files Updated

List updated files.

---

## 5. Files Preserved

List preserved files and why.

---

## 6. Files Consolidated Or Moved

List consolidations or structural fixes.

---

## 7. Structural Drift Corrected

List corrected drift, including duplicated bootstrap prompts if applicable.

---

## 8. Optional Domains Created

Explain why they were justified.

---

## 9. Optional Domains Skipped

Explain why operational density was insufficient.

---

## 10. Unknowns Requiring Human Input

List all unresolved operational unknowns.

---

## 11. Validation Result

Confirm:
- no duplicated bootstrap prompts
- no duplicated source of truth
- no unjustified domains
- no sensitive operational hardcoding
- consistent docs/.IA usage

---

## 12. Recommended Next Step

Suggest the next operational step.
```

---

# Final Rule

The `.IA` system exists to preserve operational intelligence over time.

Prefer:

```txt
clarity
consistency
maintainability
operational usefulness
```

over:

```txt
documentation quantity
future-proofing theater
organizational complexity
```

Bootstrap prompts belong ONLY in:

```txt
docs/.IA/system/
```