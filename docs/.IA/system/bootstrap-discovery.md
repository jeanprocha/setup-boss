# `.IA` Bootstrap Discovery Prompt

**Version:** 1.0  
**Mode:** Discovery-only  
**Purpose:** Analyze the project and generate the `.IA` bootstrap plan before any documentation is created or updated.

---

# Purpose

You are responsible for analyzing this project before initializing or expanding the `.IA` operational knowledge system.

**Path contract (physical):** all new operational files target **`docs/.IA/`** in the target repository. A **`.IA/`** directory at the repository root is **legacy-only**; discovery output must use **`docs/.IA/`** as the canonical path for any proposed tree. The phrase “**.IA** system” refers to the conceptual governance layer, not the legacy root folder.

This is a:

```txt
DISCOVERY-ONLY TASK
```

You MUST NOT:

- create files
- edit files
- rename files
- delete files
- move files

Your responsibility is to inspect the project and produce a structured operational analysis that will later be consumed by:

```txt
docs/.IA/system/bootstrap-create.md
```

---

# Mandatory First Step

Before analyzing the project, read:

```txt
docs/.IA/index.md
```

If they exist, also read:

```txt
docs/.IA/system/seed-rules.md
docs/.IA/system/index-system.md
docs/.IA/system/structure-rules.md
docs/.IA/system/documentation-rules.md
docs/.IA/system/update-rules.md
docs/.IA/system/merge-rules.md
docs/.IA/system/prompt-standards.md
```

If only the seed exists, use:

- `index.md`
- `seed-rules.md`
- this file

as the operational governance baseline.

---

# Same-Session Recommendation

Bootstrap discovery and bootstrap creation should preferably run in the same AI conversation/session.

This reduces risk of:

- context drift
- inference mismatch
- structural divergence
- inconsistent optional domain generation

The Discovery Result produced here is expected to be consumed directly by:

```txt
docs/.IA/system/bootstrap-create.md
```

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

Do NOT recommend creating:

```txt
docs/.IA/prompts/bootstrap-discovery.md
docs/.IA/prompts/bootstrap-create.md
```

The `prompts/` domain is reserved only for:

- post-bootstrap workflows
- maintenance workflows
- operational prompts

Expected prompts:

```txt
docs/.IA/prompts/
├── index-prompts.md
├── update-docs.md
└── merge-consolidation.md
```

If duplicated bootstrap prompts are found outside `system/`, classify them as:

```txt
structural drift
```

---

# Primary Objective

Analyze the project and determine the correct `.IA` structure.

You must identify:

- project type
- stack
- architecture shape
- operational complexity
- environment signals
- infrastructure signals
- deployment complexity
- integrations
- observability density
- operational workflows
- existing documentation
- existing `.IA` content
- justified optional domains
- unnecessary optional domains
- unknowns requiring human input

The final result must be:

- grounded in evidence
- operationally useful
- maintainable
- anti-bloat
- AI-friendly

---

# Project Profile Classification

Classify the project using ONE of these profiles:

```txt
minimal
standard
operational
complex
```

---

# minimal

Examples:

- small websites
- landing pages
- simple APIs
- lightweight internal tools

Expected `.IA` behavior:

- required domains only
- very small structure
- almost no optional domains

---

# standard

Examples:

- common business applications
- CRUD systems
- regular full-stack apps

Expected `.IA` behavior:

- baseline structure
- moderate operational context
- limited optional domains

---

# operational

Examples:

- queue-heavy systems
- worker systems
- webhook integrations
- deployment-sensitive systems

Expected `.IA` behavior:

- runbooks likely justified
- operational workflows important
- observability may be justified

---

# complex

Examples:

- distributed systems
- multi-service platforms
- orchestration-heavy systems
- infrastructure-sensitive systems

Expected `.IA` behavior:

- multiple optional domains justified
- persistent operational documentation
- deep troubleshooting context

---

# Non-Negotiable Rules

You MUST NOT:

- modify files
- invent infrastructure
- invent deployments
- invent credentials
- invent integrations
- invent production behavior
- invent observability tools
- invent architectural decisions
- create placeholder-heavy recommendations
- generate enterprise theater
- recommend unnecessary domains
- recommend duplicated bootstrap prompts
- recommend one-file-per-small-topic structures

---

# Anti-Bloat Rule

Prefer:

```txt
consolidation before expansion
```

A topic existing once does NOT justify an entire domain.

Optional domains require:

```txt
operational density
```

Examples of sufficient density:

- multiple operational workflows
- repeated troubleshooting complexity
- multiple interconnected systems
- long-term operational maintenance
- production operational burden

---

# Source Of Truth Rule

Do not recommend duplicated sources of truth.

If knowledge already belongs in:

```txt
decisions/
```

do not also recommend a full duplicate inside:

```txt
architecture/
```

Prefer:

- summaries
- references
- pointers

instead of duplicated full content.

---

# Sensitive Information Rule

Do not recommend storing:

- passwords
- tokens
- secrets
- internal IPs
- deploy hosts
- SSH targets
- private infrastructure details

If operational examples are needed, recommend placeholders:

```bash
ssh <DEPLOY_USER>@<DEPLOY_SERVER>
```

---

# Confidence Rules

Classify uncertain findings when necessary.

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

1. Inspect all existing domains.
2. Identify:
   - preserved knowledge
   - duplicated knowledge
   - structural drift
   - outdated structure
   - optional domain overgrowth
3. Do NOT recommend destructive rewrites.
4. Prefer:
   - consolidation
   - incremental improvement
   - drift correction
5. Identify duplicated bootstrap prompts outside `system/`.

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

Every generated domain must contain:

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

# Required Baseline Recommendation

Unless the project is extremely small, the recommended baseline is:

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

Do NOT recommend:

```txt
prompts/bootstrap-discovery.md
prompts/bootstrap-create.md
```

---

# Optional Domains

Optional domains should only exist when operational density justifies them.

Possible domains:

```txt
runbooks/
observability/
decisions/
history/
```

---

# runbooks/

Recommend only if:

- deployments exist
- migrations matter
- operational procedures matter
- server workflows exist
- CI/CD exists
- recovery procedures matter

Do NOT recommend generic runbooks.

---

# observability/

Recommend only if:

- queues exist
- workers exist
- schedulers exist
- distributed workflows exist
- debugging complexity exists
- monitoring workflows are persistent

Do NOT recommend for simple logging.

For simple systems:

```txt
standards/observability.md
```

is sufficient.

---

# decisions/

Recommend only if:

- important architectural decisions exist
- tradeoffs matter long-term
- constraints are operationally important

Do NOT recommend fake ADRs.

Do NOT recommend placeholder decisions.

---

# history/

Recommend only if:

- incidents matter operationally
- release history matters
- migration history matters

Do NOT use as:

- changelog mirror
- commit history
- task log

---

# Discovery Inputs

Inspect relevant project evidence, including:

```txt
README.md
docs/
package.json
composer.json
go.mod
requirements.txt
Dockerfile
docker-compose.yml
docker-compose.yaml
.env.example
.github/
.gitlab-ci.yml
bitbucket-pipelines.yml
app/
src/
frontend/
backend/
internal/
config/
scripts/
database/
migrations/
routes/
tests/
```

Also inspect operational indicators:

- queues
- workers
- cron
- schedulers
- webhooks
- retry logic
- integrations
- CI/CD
- deployments
- environment variables
- logging
- monitoring
- debugging tooling

---

# Discovery Output Format

Return the result EXACTLY using this structure:

```md
# `.IA` Bootstrap Discovery Result

## 1. Detected Project Type

Describe the project type.

Include confidence level.

---

## 2. Project Profile Classification

Choose:
- minimal
- standard
- operational
- complex

Explain why.

---

## 3. Detected Stack

List:
- frameworks
- languages
- infrastructure
- tooling
- databases
- integrations

For each item:
- finding
- evidence
- confidence

---

## 4. Detected Architecture Shape

Describe:
- monolith
- frontend/backend split
- microservices
- multi-app repository
- worker system
- orchestration patterns
- deployment shape

Include evidence and confidence.

---

## 5. Operational Complexity

Describe:
- queues
- workers
- cron
- webhooks
- schedulers
- integrations
- migrations
- deployments
- operational risks

Include evidence and confidence.

---

## 6. Environment And Infrastructure Signals

Describe:
- Docker
- CI/CD
- environment variables
- local setup
- SSH/server workflows
- VPN
- database access
- operational limitations

Include evidence and confidence.

---

## 7. Observability Signals

Describe:
- logging
- retry logic
- debug tooling
- metrics
- tracing
- monitoring
- troubleshooting workflows

Include evidence and confidence.

---

## 8. Existing Documentation

Describe:
- existing docs
- existing `.IA`
- useful operational docs
- duplicated docs
- structural drift
- outdated docs

Classify existing `.IA` files:
- keep
- consolidate
- move
- legacy
- structural drift
- unknown

---

## 9. Recommended Required `.IA` Structure

Provide the required domains/files.

Bootstrap prompts must remain only inside:

```txt
system/
```

---

## 10. Recommended Optional Domains

List optional domains that SHOULD exist.

For each one:
- justification
- operational density reasoning
- evidence
- confidence

---

## 11. Optional Domains NOT Recommended

List domains that should NOT exist.

Explain why operational density is insufficient.

---

## 12. Unknowns Requiring Human Input

List:
- infrastructure unknowns
- deploy unknowns
- production unknowns
- credentials/access unknowns
- operational unknowns

---

## 13. Risks

List:
- operational risks
- documentation gaps
- deployment uncertainty
- observability gaps
- architectural uncertainty
- environment uncertainty

---

## 14. Proposed Final `.IA` Tree

Provide the exact proposed tree.

Do NOT include:

```txt
prompts/bootstrap-discovery.md
prompts/bootstrap-create.md
```

---

## 15. Post-Bootstrap Validation Requirements

List validations the creation step must perform.

Must include:
- no duplicated bootstrap prompts
- all folders contain index-<folder>.md
- no duplicated source of truth
- no unjustified optional domains
- no hardcoded sensitive operational targets
- consistent docs/.IA path usage
- prompts/ contains only operational prompts

---

## 16. Bootstrap Creation Instructions

Provide instructions for:

```txt
docs/.IA/system/bootstrap-create.md
```

Include:
- files to create
- files to preserve
- domains to generate
- optional domains to skip
- drift to correct
- unknowns to preserve
- project-specific constraints
```

---

# Final Rule

This is discovery only.

Do NOT modify the project.

Do NOT create `docs/.IA/` nor a root-level `.IA/` on disk during discovery.

Do NOT generate full documentation.

Only generate the bootstrap operational analysis.

Bootstrap prompts belong ONLY in:

```txt
docs/.IA/system/
```