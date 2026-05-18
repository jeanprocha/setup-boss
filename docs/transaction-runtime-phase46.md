# Transaction Runtime — Fase 4.6

## Âmbito

Modelo **transacional** em torno da pipeline já existente: checkpoints formais por hook (`post_*`), snapshots de estado (`execution-snapshots/` + `execution-snapshot.json` raiz como “último”), contract `transaction-runtime.json`, índice `transaction-runtime-manifest.json`, telemetria append-only `transaction-runtime-telemetry.ndjson`, planeamento **não executivo** de recovery e rollback, e validação de continuidade (FSM de hooks vs legado e manifest).

**Explicitamente não implementado aqui**: rollback mutativo ao working tree, distributed transactions, enforcement duro contra o executor ou AST revert.

## Feature flag

`SETUP_BOSS_TRANSACTION_RUNTIME`:

| Valor   | Comportamento |
|---------|----------------|
| `off` *(default)* | Zero escritas transaccionais; pipeline idêntica ao legado. |
| `shadow` | Contract, checkpoints, snapshots, manifests, telemetry, continuidade/recovery/planeamento persistidos nos artefactos da run. |
| `active` | Igual ao `shadow`; `buildRecoveryAnalysis` inclui mais detalhes em sumários posteriores (sem mudar comportamento executor). |

## Artefactos (por `docs/.IA/outputs/<runId>/`; legado: `.IA/outputs/<runId>/`)

- `transaction-runtime.json` — contract canónico (`schema_version`, `transaction_id`, `plan_id`, `run_id`, `summary`, `stages`, `checkpoints`, `snapshots`, `recovery`, `rollback_plan`, `metadata`).
- `transaction-runtime-manifest.json` — índice de caminhos.
- `transaction-runtime-telemetry.ndjson` — um evento JSON por linha.
- `execution-snapshot.json` — cópia do último snapshot.
- `execution-snapshots/snapshot-XXX-<hook>.json` — série determinística incremental.

Integração **`plan-artifacts.json`**: `artifacts.extensions.transaction_runtime`, `replay[]` opcional para o contract, lista `generated[]` aumentada quando ficheiros existem.

## Hooks e FSM de continuidade

Hooks oficiais: `post_preflight`, `post_architect`, `post_plan`, `post_executor`, `post_validation`, `post_risk`, `post_review`, `post_correction`, `post_knowledge`.

O grafo permite **loops** `post_correction → post_executor → …` sem falsos positivos de “regressão”.

## Integração orquestral

Pontos registados na `scripts/runtime/orchestration.js`:

- Bootstrap após índice de run (+ resume).
- Checkpoint após pré-flight, architect, planeamento shadow, dentro do executor (executor core → validation → risk), review, correction, knowledge.
- `finalizeTransactionalRun` antes de cada retorno de sucesso/resumo.
- Falhas graves: `finalizeTransactionalFailure` (sem abortar o fluxo de erro já existente).

## CLI

```bash
setup-boss inspect-transaction latest --json

setup-boss inspect-plan latest --include-transaction
setup-boss inspect-validation-runtime latest --include-transaction
setup-boss inspect-review latest --include-transaction
setup-boss inspect-correction latest --include-transaction
```

### Exemplo rápido (human-readable)

```bash
SETUP_BOSS_TRANSACTION_RUNTIME=shadow npm run setup-boss -- run tasks/task-1.md meu-projeto --dry-run --yes

npm run setup-boss -- inspect-transaction latest

npm run setup-boss -- inspect-transaction latest --full-contract --json
```

Pré-requisito: corrida efectuada com `shadow|active`; com `off` o inspect mostra apenas ausência de contract.

## Eventos de telemetria persistidos

- `transaction_started`
- `checkpoint_created`
- `snapshot_persisted`
- `stage_transition_completed`
- `replay_continuity_validated`
- `recovery_analysis_completed`
- `rollback_plan_generated`
- `transaction_completed`
- *(opcional erro)* `transaction_checkpoint_error`

## Correção / Review — integração soft

Quando existe `transaction-runtime.json`, manifests de correction/review enriquecem `extensions.transaction_runtime` com `{ contract_ref: "transaction-runtime.json" }`, além dos campos já presentes via `plan-artifacts`.

## Testes automáticos

`scripts/transaction-runtime/transaction-runtime.test.js` — FSM, ciclo correction, escrita minimal em diretório temporário (modo `shadow`), rollback planning estrutura.
