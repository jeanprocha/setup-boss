# Pipeline Runtime — Mapa (Discovery Fase 4.12)

## Escopo

Mapeamento do fluxo **oficial** hoje (sem DAG). Entrada principal: `scripts/run.js` → `scripts/runtime/run-runtime.js` → `scripts/runtime/orchestration.js` (`startFlow` / `startFlowResume`).

## Árvore de execução (linear + loops)

```
run.js (CLI: task, project, flags)
  └─ executeRunPipeline → startFlow (lock opcional por projeto)
       ├─ Validação task (shared-utils) — antes do logger
       ├─ getRunId(taskArg) → outputDir = <project>/docs/.IA/outputs/<runId>/ (legado: <project>/.IA/outputs/<runId>/)
       ├─ writeRunIndex(.setup-boss/runs/<runId>.json)
       ├─ bootstrapTransactionRuntime
       ├─ Scan cache (fingerprint projeto + TTL) — decide canUseScanCache
       ├─ [phase] preflight — executePreflightPhase
       │     └─ analyzer + governance + artefactos (sem “node” separado de scan standalone aqui)
       ├─ [phase] architect (+ scan embutido em runArchitect; skipScan se cache)
       │     └─ gate invalid_task → partial (executor/review/correction/knowledge NÃO rodam)
       ├─ runShadowExecutionPlanAfterArchitect (opcional, shadow)
       ├─ runShadowValidationTargetingAfterArchitect (opcional)
       ├─ runExecutorStep
       │     ├─ runExecutorWithRecovery (micro-retries / recovery)
       │     ├─ assertExecutorResultSuccess
       │     ├─ runShadowPlanReconciliationAfterExecutor
       │     ├─ governance POST_RECONCILIATION
       │     ├─ runShadowValidationTargetingAfterReconciliation
       │     ├─ runValidationRuntimeAfterTargeting (swallowed se erro)
       │     ├─ governance POST_VALIDATION (pode lançar enforce/HITL)
       │     ├─ runRiskAnalysisAfterValidation (best-effort)
       │     ├─ governance POST_RISK
       │     └─ checkpoints transacionais + runtime-checkpoints (AFTER_EXECUTOR)
       └─ runPostExecutorLoop  ← loop principal pós-execução
             ├─ runReviewStep
             │     └─ se approved → finishKnowledge → fim success
             │     └─ se blocked → partial/blocked
             │     └─ se reprova + requires_correction
             │           ├─ cap MAX_CORRECTIONS / policy preflight
             │           ├─ evaluateCorrectionRetrySuppressionGate
             │           ├─ runCorrection
             │           └─ runExecutorStep (reenvia pipeline “para frente”)
             └─ (repete até aprovação, blocked, cap ou supressão)
```

## Onde a ordem está hardcoded

| Local | Detalhe |
|-------|---------|
| `orchestration.js` `startFlow` | Sequência fixa: preflight → architect → shadow hooks → executor → post-executor loop. |
| `runExecutorStep` | Ordem fixa dentro do “macro executor”: recovery executor → reconciliação → validation runtime → risk → artefactos. |
| `runPostExecutorLoop` | `for(;;)` explícito: review → ramificações → correction → `await runExecutorStep`. |
| `startFlowResume` | `nextPhase` string (`correction` \| `executor` \| `review`) ramifica para blocos que reutilizam as mesmas funções. |

## Dependências implícitas (coupling)

- **Executor** exige `executor-result.json` com `status: success` antes de avançar.
- **Review** exige `review-output.json`.
- **Resume** (`resume-engine.js`) infere `next_phase` a partir de artefactos + `run-log.json` + governance gate.
- **Scan**: presente como `scan-output.md` ou `meta.scan.skipped` + `run-context.json` para resumir executor.
- **Execution plan / validation**: plano shadow e targets dependem de `run-context.json` + `architect-output.md` e de `SETUP_BOSS_PLAN_MODE` / `SETUP_BOSS_VALIDATION_MODE`.

## Transições de estado

- **Lifecycle string** em `metadata.json` → `execution.lifecycle_state` (`scripts/runtime/replay/lifecycle.js` — `RUNTIME_LIFECYCLE`).
- **Checkpoints**: `runtime-checkpoints.json` (`phase_completed`: `AFTER_PREFLIGHT`, `AFTER_ARCHITECT`, `AFTER_EXECUTOR`, `AFTER_REVIEW`, `AFTER_CORRECTION`).
- **Transaction runtime**: `transaction-runtime.json` + merges em `metadata.execution.transaction_runtime` (`scripts/transaction-runtime/checkpoint-engine.js`).
- **Run log**: `run-log.json` (`RunLogger`) — steps, `correction_iterations`, status run.

## Side effects principais

- Disco em **`<projectRoot>/docs/.IA/outputs/<runId>/`** (legado: **`<projectRoot>/.IA/outputs/<runId>/`**) — artefactos listados nos checkpoints.
- Projeto alvo: patches quando não é dry-run (`executor`); `ensure-ia` enrich após knowledge aprovado.
- Cache global scan: `.setup-boss/cache/*` (fingerprint).
- Índice run: `.setup-boss/runs/<runId>.json`.
- `problem-history` (append em falhas/limite/blocked).
- Event bridge / daemon: `emitBridge` por fase.

## Retry / recovery / correction

| Mecanismo | Onde | Comportamento |
|-----------|------|---------------|
| Micro-recovery executor | `executor-recovery-loop.js` | Retries dentro da mesma fase executor; atualiza lifecycle RECOVERING/RECOVERED. |
| Correction loop | `runPostExecutorLoop` | Reexecuta executor após correction; limitado por cap + suppression gate. |
| `MAX_TOTAL_STEPS` | `assertFlowLimits` | Conta `run-log.json` steps — guarda global contra loops. |
| Resume | `resume.js` + `assessResume` | Não re-pipeline completo; entra em fase inferida. |

## Replay / recovery atuais (pontos de entrada)

- **Replay selectivo**: `scripts/replay.js` → `executeReplayPipeline` → `replay-engine.js` — apenas `executor` \| `review` \| `correction` a partir de artefactos existentes (não refaz scan/architect).
- **Resume**: continuação após falha/interrupção com `next_phase` determinístico por artefactos.
- **Apply determinístico**: `executeDeterministicApplyPipeline` (dry-run aprovado → apply físico).

## Artefactos-chave por macro-etapa

- **Preflight**: `preflight-analysis.json`, `preflight-summary.md`, `policy-report.json`, `governance-decisions.json`.
- **Architect**: `architect-input/output.md`, `task.md`, `metadata.json`, `architect-validation.json`, `run-context.json`, `scan-output.md` (ou cache).
- **Executor**: `executor-input.md`, `executor-result.json`, `executor-output.md`, `executor-changes.json`, dry-run: `virtual-project-overlay.json`, `patch-manifest.json`, etc.
- **Shadow plan**: `execution-plan.json`, manifests de targeting / validation (quando flags ativas).
- **Validation runtime**: `validation-results.json`, manifest de runtime (conforme módulo).
- **Review / correction / knowledge**: `review-output.json`, `correction-instructions.md`, `knowledge-update.md`.

## Arquivos centrais (referência)

- `scripts/run.js`, `scripts/resume.js`, `scripts/replay.js`
- `scripts/runtime/run-runtime.js`
- `scripts/runtime/orchestration.js`
- `scripts/runtime/replay/checkpoint-manager.js`, `lifecycle.js`, `resume-engine.js`, `replay-engine.js`
- `scripts/runtime/preflight/run-phase.js`
- `scripts/runtime/recovery/executor-recovery-loop.js`
- `scripts/execution-plan/index.js` (shadow hooks)
- `scripts/validation-runtime/index.js`
- `scripts/logger.js`, `core/run-resolver.js`
- `scripts/transaction-runtime/checkpoint-engine.js`
