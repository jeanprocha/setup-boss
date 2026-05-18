# Recovery Runbook

**Scope:** Retry budgets, recovery states, replay, and resume workflows.

---

# Recovery Components

| Component | File | Purpose |
|---|---|---|
| Failure classifier | `failure-classifier.js` | Distinguishes network vs JSON vs patch failures |
| Retry budget | `retry-budget.js` | Per-channel budget consumption |
| Backoff | `backoff.js` | Delay between retries |
| Recovery loop | `executor-recovery-loop.js` | Integrates retries before declaring failure |
| Artifacts | `recovery-artifacts.js` | Writes `recovery-log.json` |

---

# Recovery States

```txt
EXECUTING → RECOVERING → RECOVERED
                       → RECOVERY_FAILED
                       → RETRY_EXHAUSTED
```

Inspect current state:

```powershell
npm run setup-boss -- inspect <runId>
```

---

# Retry Budget Variables

| Variable | Default | Channel |
|---|---|---|
| `SETUP_BOSS_EXECUTOR_MICRO_RETRY_MAX` | `2` | Executor micro retries |
| `SETUP_BOSS_PROVIDER_RETRY_MAX` | `3` | Provider (API) retries |
| `SETUP_BOSS_CORRECTION_RETRY_BUDGET` | `1` | Correction retry budget |

---

# Diagnosing A Failed Run

1. Check state: `npm run setup-boss -- inspect <runId>`
2. Check `recovery-log.json` in `<target>/docs/.IA/outputs/<runId>/` (legacy: `<target>/.IA/outputs/<runId>/`)
3. Check `executor-result.json` for PATCH failures
4. Check `review-output.json` for review decision

---

# Replay A Run

Replay from a specific stage (without re-running earlier stages):

```powershell
npm run setup-boss -- replay <runId> --from=executor
npm run setup-boss -- replay <runId> --from=review
npm run setup-boss -- replay <runId> --from=correction
```

Save evidence before replay if corruption is suspected.

---

# Resume An Interrupted Run

Resume a run that was interrupted mid-pipeline:

```powershell
npm run setup-boss -- resume <runId>
```

---

# Apply A Manually Approved Run

When HITL approval is required or `apply-later` was used:

```powershell
npm run setup-boss -- apply <runId> --confirm
# or: $env:SETUP_BOSS_APPLY_CONFIRM='1'
```

---

# Retry Exhaustion

When `RETRY_EXHAUSTED`:

- Do NOT silently overwrite with replay without human decision
- Inspect `recovery-log.json` to understand the failure pattern
- Decide: fix the task, adjust retry budgets, or abandon the run

---

# Operational Best Practices

1. After recovered runs, check `recovery-log.json` and `executor-result.json`
2. JSON corruption from model → save evidence before replay
3. Retry exhaustion → human decision required before replay
4. Validate run artifacts: `npm run validate:artifacts -- <runId>`
