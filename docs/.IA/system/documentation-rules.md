# Documentation Rules

**Scope:** Rules for writing and maintaining `.IA` documentation.

---

# Language

All `.IA` documentation must be written in English.

This includes: governance, prompts, standards, runbooks, indexes, operational docs.

---

# Content Standard

Documentation must be:

- concise
- operational
- evidence-based
- human-readable
- AI-friendly

Avoid:

- generic framework tutorials
- duplicated explanations
- speculative content
- implementation noise
- temporary debugging context

---

# Source Of Truth Rule

Do not maintain the same knowledge in multiple places.

If a domain owns detailed content:

- other domains use summaries or pointers
- no full duplicates

Example: if `decisions/` owns architectural decision context, `architecture/` references it rather than duplicating.

---

# Sensitive Information Rule

Never store:

- passwords, tokens, secrets, private keys
- production credentials
- hardcoded deploy targets, internal IPs, SSH hosts

Use placeholders:

```bash
ssh <DEPLOY_USER>@<DEPLOY_SERVER>
```

---

# Confidence Classification

Use when documenting uncertain information:

| Label | When |
|---|---|
| `HIGH CONFIDENCE` | Directly supported by project evidence |
| `MEDIUM CONFIDENCE` | Strongly inferred from structure |
| `LOW CONFIDENCE` | Weakly inferred |
| `REQUIRES HUMAN INPUT` | Cannot be safely inferred |

Never present uncertain behavior as guaranteed fact.

---

# Hallucination Prevention

AI agents must never invent:

- infrastructure
- deployments
- integrations
- production behavior
- monitoring tools
- operational guarantees

Unknown information must be explicitly marked.

---

# Document Size

Prefer short, dense files over long narrative documents.

If a file grows unwieldy: split by operational scope, not by arbitrary sections.
