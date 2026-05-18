# Observability Signals

**Artifact location:** `<target-project>/docs/.IA/outputs/<run-id>/` (legacy: `<target-project>/.IA/outputs/<run-id>/`)

---

# Core Artifacts (Always Present)

| Artifact | Purpose |
|---|---|
| `run-log.json` | Steps, durations, files generated, warnings/errors |
| `metadata.json` | Project data, agents, `llm_usage`, `llm_usage_total`, `estimated_cost_usd` |
| `run-context.json` | Compact source of truth: task summary, `allowed_files`, review focus |
| `executor-changes.json` | PATCHes applied (or blocked) |
| `review-output.json` | Review decision: `approved` / `rejected` / `blocked` |

---

# Stage Artifacts

| Artifact | Stage |
|---|---|
| `scan-input.md` / `scan-output.md` | Scan (when fresh scan ran) |
| `architect-input.md` / `architect-output.md` | Architect |
| `executor-input.md` / `executor-output.md` / `executor-result.json` | Executor |
| `review-output.md` | Review (human-readable) |
| `correction-instructions.md` | Correction |
| `knowledge-update.md` | Knowledge |

---

# Optional Artifacts

Produced only when corresponding feature flag is enabled:

| Artifact | Flag | Phase |
|---|---|---|
| `prompt-sizes.json` | Always generated when scan runs | — |
| `policy-report.json` + `governance-decisions.json` | Governance enabled | 2.7 |
| `recovery-log.json` | Recovery active | 2.6 |
| `execution-plan.json` | `SETUP_BOSS_PLAN_MODE=shadow` | 4.1 |
| `validation-*.json` | `SETUP_BOSS_VALIDATION_MODE=report` | 4.2 |
| `risk-analysis.json` | `SETUP_BOSS_RISK_ENGINE=telemetry` | 4.3 |
| `deterministic-review.json` | `SETUP_BOSS_REVIEW_ENGINE=structural` | 4.4 |
| `correction-semantic-propagation.json` | `SETUP_BOSS_CORRECTION_SEMANTIC_PROPAGATION=shadow` | 4.5/4.8 |
| `transaction-runtime.json` | `SETUP_BOSS_TRANSACTION_RUNTIME=shadow` | 4.6 |
| `semantic-mutation-graph.json` | `SETUP_BOSS_SEMANTIC_*=shadow` | 4.8 |
| `hybrid-execution-results.json` | `HYBRID_EXECUTION_ENABLED=true` | 4.9 |
| `execution-graph-*.json` (multiple) | `SETUP_BOSS_EXECUTION_GRAPH=shadow` | 4.12 |

---

# `metadata.json` — LLM Usage

```json
{
  "llm_usage": {
    "scan": { "model": "...", "input_tokens": 0, "output_tokens": 0, "estimated_cost_usd": null },
    "architect": { ... },
    "executor": { ... },
    "review": { ... },
    "correction": { ... },
    "knowledge": { ... }
  },
  "llm_usage_total": { "input_tokens": 0, "output_tokens": 0, "estimated_cost_usd": null }
}
```

`estimated_cost_usd` is `null` when pricing env vars are not set.

Token counts depend on `response.usage` being returned by the API.

---

# `prompt-sizes.json`

Reports character counts per prompt stage and block. Useful for comparing payload sizes across runs.

**Important:** If scan was served from cache, `prompt-sizes.json` will NOT contain a `scan` entry for that run.

To force a fresh scan measurement:

```powershell
$env:FORCE_SCAN='1'
npm run setup-boss -- run tasks/task.md ../target
```

---

# Troubleshooting Sequence

1. Check `review-output.json` → run state
2. Check `executor-changes.json` vs disk in `projectRoot` from `metadata.json`
3. Check `llm_usage` / `llm_usage_total` for cost/token estimates
4. Compare `prompt-sizes.json` across runs when debugging payload issues
5. Check `recovery-log.json` for retry/recovery history
6. Run `npm run setup-boss -- inspect <runId>` for temporal lifecycle view
7. Run `npm run validate:artifacts -- <runId>` for artifact integrity

---

# Cost Estimation

Requires env vars in `.env`:

```bash
GPT_5_4_MINI_INPUT_USD_PER_1M=<value>
GPT_5_4_MINI_OUTPUT_USD_PER_1M=<value>
```

Without these, `estimated_cost_usd` is `null` everywhere.

Full pricing reference: `.env.example` and `core/llm-usage.js`.
