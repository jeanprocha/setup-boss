# Execution Plan — Fase 4.1 (núcleo / shadow mode)

## Finalidade

O **Execution Plan** é o IR operacional versionado da corrida: contrato auditável, observável e preparado para replay futuro. Na **Fase 4.1** o plano é apenas **derivado, validado, persistido e observado** — **sem enforcement** no executor PATCH existente.

## Feature flag

| Valor | Comportamento |
|--------|----------------|
| `SETUP_BOSS_PLAN_MODE` não definido / `off` | Comportamento legado; nenhum artefacto de plano é gerado. |
| `shadow` | Após o Architect bem-sucedido, grava `execution-plan.json` na pasta da run; hooks de ciclo de vida actualizam o estado ao longo do pipeline. Falhas no subsistema de plano **nunca** abortam o pipeline. |

Helpers: `scripts/execution-plan/feature-flags.js` (`getPlanModeFromEnv`, `isShadowPlanModeEnabled`).

## Layout do código

```
scripts/execution-plan/
  index.js                 — API pública e hooks da orquestração
  feature-flags.js
  schema/constants.js      — schema_version, enums de lifecycle e operações
  lifecycle/lifecycle-engine.js
  fingerprint/plan-fingerprint.js
  validation/structural-validation.js
  validation/validation-registry.js  — registry extensível (vazio na 4.1)
  persistence/plan-store.js
  compiler/shadow-plan-generator.js
  telemetry/plan-telemetry.js
  execution-plan.test.js
```

## Contrato JSON (`execution-plan.json`)

Campos principais (versão actual: `schema_version: 1`):

- Identidade: `plan_id`, `run_id`, `revision_id`, `parent_revision_id`, `lineage_id`
- Proveniência: `generated_at`, `generated_by`
- **lifecycle**: `lifecycle_state`, `lifecycle_transitions[]`, `lifecycle_updated_at`
- Conteúdo: `intent`, `operations[]`, `allowed_files`
- Transversal: `metadata`, `fingerprints`, `telemetry`, `execution_strategy`, `validation`, `risk_hints`
- Evolução: `extensions` em vários níveis; campos desconhecidos no root geram **warnings** na validação estrutural (forward-compat).

### Operação (modelo oficial)

Cada elemento de `operations[]`: `operation_id`, `type`, `mode`, `target`, `file`, `search`, `replace`, `reasoning`, `dependencies`, `risk_level`, `metadata`, `extensions`.

Tipos gerados em shadow a partir do Architect / run-context:

- `FILE_SCOPE` — ficheiro listado em allowed files
- `ARCHITECT_PLAN_STEP` — bullet derivado da secção `## Plano`
- `MARKER_NO_PATCH_YET` — marca explícita de que o executor PATCH legado permanece a fonte de verdade das alterações

## Ciclo de vida (máquina de estados)

Estados: `DRAFT`, `VALIDATED`, `APPROVED`, `EXECUTING`, `COMPLETED`, `FAILED`, `BLOCKED`.

Fluxo típico em shadow:

1. Geração → `DRAFT`
2. Validação estrutural OK → `VALIDATED` → `APPROVED` (aprovação automática só em shadow)
3. Início do executor PATCH → `EXECUTING`
4. Sucesso do executor (antes do review) → `APPROVED` (volta ao estado “à espera de review”; suporta várias voltas correção/executor)
5. Pipeline concluído com knowledge após review aprovado → `COMPLETED`
6. Review bloqueado → `BLOCKED`; limite de correções → `FAILED`; falha do executor → `FAILED`

Transições são registadas em `lifecycle_transitions[]` com `from`, `to`, `at`, `actor`, `reason`, `guard`.

## Fingerprint

SHA-256 sobre JSON canónico (`stableStringify`) de: operações normalizadas (paths POSIX, dependências ordenadas, reasoning normalizado), `allowed_files` ordenado, intent normalizado (`summary` + `task_path`), `execution_strategy`, `revision_lineage`. Campos voláteis (timestamps de telemetria, etc.) ficam fora do payload de fingerprint.

## Validação estrutural

`validateExecutionPlanStructural(plan)` devolve `{ ok, errors, warnings, validated_at }`. Erros incluem: campos obrigatórios em falta, IDs duplicados, dependências inválidas ou ciclo, ficheiros de operação fora de `allowed_files`, `lifecycle_state` desconhecido.

## Integração na orquestração

Ficheiro: `scripts/runtime/orchestration.js`

- Após checkpoint `AFTER_ARCHITECT`: `runShadowExecutionPlanAfterArchitect` — persiste o plano e opcionalmente actualiza `metadata.json` → `execution_plan` (referência ao artefacto + fingerprint).
- `runExecutorStep`: `syncShadowPlanExecutorLifecycle` com `executing` / `completed` (volta a `APPROVED`) / `failed`.
- Review bloqueado / partial (MAX_CORRECTIONS): `syncShadowPlanPipelineBlocked` / `syncShadowPlanPipelinePartialFailure`.
- `finishKnowledge`: `syncShadowPlanPipelineApprovedFinish` → `COMPLETED`.

Resume / daemon: mesmos hooks — se `execution-plan.json` já existir, a geração shadow inicial é ignorada (idempotente).

## Telemetria

Eventos emitidos via `ctx.telemetry.emit` quando disponível:

- `plan_generation_started`, `plan_generation_completed`
- `plan_validation_failed`
- `plan_persisted`
- `lifecycle_transition`

Cópia espelhada em `plan.telemetry.events[]` no JSON persistido.

## Testes

`npm test` inclui `scripts/execution-plan/execution-plan.test.js` (lifecycle, fingerprint, validação, generator).

## Próximas fases (fora do âmbito 4.1)

Plan compiler formal, enforcement no executor, motor de risco dedicado, rollback transaccional, revisões múltiplas com ramificação de lineage, hybrid executor.
