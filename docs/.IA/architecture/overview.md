# Architecture Overview

**Project:** setup-boss v2.0.0  
**Type:** AI pipeline orchestrator (CLI + daemon)  
**Runtime:** Node.js (pure scripts, no web framework)

---

# What It Does

setup-boss coordinates an AI-driven pipeline over a **target project** (external repo).

It manages: task planning, code execution via PATCH, automated review, correction loops, and knowledge persistence — using OpenAI models at each stage.

---

# Pipeline

```txt
scan → architect → run-context.json
→ executor (PATCH)
→ review
→ [correction → executor → review]*
→ knowledge
```

| Stage | Script | Purpose |
|---|---|---|
| `scan` | `scripts/scan.js` | Reads target project; produces `project-scan.md`; cached by default |
| `architect` | `scripts/architect.js` | Plans the task; writes `run-context.json` and run artifacts |
| `executor` | `scripts/executor.js` | Applies PATCHes to target files within `allowed_files` |
| `review` | `scripts/review.js` | Evaluates result; writes `review-output.json` |
| `correction` | `scripts/correction.js` | Generates correction instructions when rejected |
| `knowledge` | `scripts/knowledge.js` | Persists learning to `.setup-boss/knowledge-base.md` on success |

Full pipeline: `scripts/run.js`.

---

# Agents

Prompts live in `agents/`:

| Agent | Purpose |
|---|---|
| `architect.md` | Task planning |
| `executor.md` | PATCH generation |
| `reviewer.md` | Review evaluation |
| `correction.md` | Correction instructions |
| `knowledge.md` | Knowledge extraction |
| `project-scan.md` / `project-profile.md` | Scan context |

---

# Core Module

`core/` contains shared utilities:

| File | Purpose |
|---|---|
| `llm-client.js` | OpenAI API calls; per-step model selection |
| `llm-usage.js` | Token and cost tracking |
| `run-resolver.js` | Resolves run-id to output folder |
| `problem-history.js` | Correction history for priming |
| `agent-metadata.js` | Metadata helpers |

---

# Daemon Subsystem

`scripts/daemon/` — persistent background process:

| Component | Purpose |
|---|---|
| `setup-bossd.js` | Daemon entry point |
| `worker-pool.js` | Concurrent run workers (`SETUP_BOSS_MAX_WORKERS`) |
| `scheduler-loop.js` | Delayed job scheduling (`SETUP_BOSS_SCHEDULER_POLL_MS`) |
| `queue-store.js` | Persistent job queue |
| `project-registry.js` | Per-project lock and registry |
| `runtime-api.js` | Local HTTP API (default port 3210) |
| `pid-file.js` | Daemon PID tracking |

Daemon state directory: `SETUP_BOSS_DATA_DIR` (or default `.setup-boss/`).

---

# Optional Runtime Modules

All activated via environment feature flags (`off` by default):

| Module | Phase | Flag |
|---|---|---|
| Execution Plan | 4.1 | `SETUP_BOSS_PLAN_MODE` |
| Validation Runtime | 4.2 | `SETUP_BOSS_VALIDATION_MODE` |
| Risk Runtime | 4.3 | `SETUP_BOSS_RISK_ENGINE` |
| Deterministic Review | 4.4 | `SETUP_BOSS_REVIEW_ENGINE` |
| Correction Runtime V2 | 4.5 | `SETUP_BOSS_CORRECTION_ENGINE` |
| Transaction Runtime | 4.6 | `SETUP_BOSS_TRANSACTION_RUNTIME` |
| Semantic Dependency | 4.8 | `SETUP_BOSS_SEMANTIC_VALIDATION_PROPAGATION` |
| Hybrid Executor (AST) | 4.9 | `HYBRID_EXECUTOR_ENABLED` |
| Execution Graph | 4.12 | `SETUP_BOSS_EXECUTION_GRAPH` |

Modes per module: `off` → `shadow` → `telemetry` → `active` → `enforce` (varies by module).

Shadow mode = artifacts generated, pipeline unaffected.

---

# Artifact Layout

Per run, artifacts land in the **target project**:

```txt
Corporate default (per run):
  <target-project>/docs/.IA/outputs/<run-id>/

Legacy root layout (per run):
  <target-project>/.IA/outputs/<run-id>/

Artifact set (same files under whichever run root is active):
  run-log.json
  metadata.json            ← llm_usage, llm_usage_total, estimated_cost_usd
  run-context.json         ← compact source of truth for executor/review/correction
  executor-changes.json    ← PATCHes applied
  review-output.json       ← review decision (approved / rejected / blocked)
  prompt-sizes.json        ← prompt character counts per stage (when present)
  recovery-log.json        ← retry/recovery history (when active)
  [+ optional runtime JSONs per enabled phase]
```

Run index: `setup-boss/.setup-boss/runs/<run-id>.json` → pointer to target output folder.

---

# Governance

`scripts/runtime/governance/` — policy engine:

- Profiles: `FAST`, `NORMAL`, `STRICT`, `ENTERPRISE`
- HITL approval mode
- `policy-report.json` + `governance-decisions.json` per run
- `setup-boss doctor` for smoke checks

See `docs/governance.md` for full policy reference.
