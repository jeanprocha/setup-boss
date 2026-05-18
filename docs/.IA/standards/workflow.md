# Workflow

**Scope:** Pipeline workflow, governance, correction loops, HITL, and operational conventions.

---

# Standard Pipeline Flow

```txt
scan → architect → run-context.json
→ executor (PATCH)
→ review
→ [correction → executor → review]*
→ knowledge
```

Full orchestration: `npm run setup-boss -- run tasks/task.md ../target-project`

---

# Review Outcomes

| Result | Effect |
|---|---|
| `approved` | Proceeds to `knowledge` |
| `rejected` with `requires_correction` | Enters correction → executor → review loop |
| `blocked` | Run terminates; no correction loop |

Loop limits: `MAX_CORRECTIONS` (default 3), `MAX_TOTAL_STEPS` (default 20).

---

# Recommended Operator Flow

```txt
preflight → dry-run (when policy/risk demands) → inspect → apply-later → knowledge
```

1. `setup-boss doctor` before any formal run
2. `--dry-run` when `STRICT` profile or high-risk task
3. `setup-boss inspect latest` to review lifecycle and drift
4. `setup-boss apply <runId> --confirm` after approval

---

# Governance Profiles

Set `SETUP_BOSS_POLICY_PROFILE`:

| Profile | Behavior |
|---|---|
| `FAST` | Minimal governance checks |
| `NORMAL` | Standard checks (default) |
| `STRICT` | Dry-run required for high-risk / core runtime / migration tasks |
| `ENTERPRISE` | Maximum enforcement |

Source: `scripts/runtime/governance/profiles.js`.

---

# HITL (Human-In-The-Loop)

When governance mode requires human approval:

- run pauses at approval gate
- `governance-decisions.json` records decision
- `setup-boss apply <runId> --confirm` resumes after human confirmation

---

# Correction Loop

When review rejects with `requires_correction`:

1. `correction.js` generates `correction-instructions.md`
2. `executor.js` re-applies PATCHes with correction context
3. `review.js` re-evaluates
4. Repeats until `approved`, `blocked`, or limits reached

Problem history (`core/problem-history.js`) primes corrections with previous failure context.

---

# Replay And Resume

Replay a run from a specific stage:

```powershell
npm run setup-boss -- replay <runId> --from=executor
```

Resume an interrupted run:

```powershell
npm run setup-boss -- resume <runId>
```

See `runbooks/recovery.md` for recovery workflows.

---

# Task Authoring Convention

Tasks live in `tasks/` as `.md` files.

A task file should include:
- what to implement
- which files are expected to change (helps architect define `allowed_files`)
- acceptance criteria

---

# AI Session Bootstrap

Before starting a new setup-boss work session:

Read `docs/.IA/index.md` and relevant domain indexes.

See `docs/padrao-novo-chat.md` for the session bootstrap pattern.
