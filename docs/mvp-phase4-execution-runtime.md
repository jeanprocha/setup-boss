# MVP Fase 4 — Execution runtime (consolidado 4.11)

Documento de referência para o **runtime linear MVP** (sem DAG, sem paralelismo, sem scheduler distribuído, sem Web UI). A fase **4.11** consolida contratos, validação cruzada, integridade, CLI e smoke operacional.

## Arquitetura (visão única)

1. **Estratégia** (`strategy/execution-ready-handoff.json`, `strategy/execution-order.json`, subtasks em `strategy/subtasks/`) — entrada do runtime.
2. **Execution** (`execution/`) — sessão, subtasks, handoffs do arquiteto, resultados, validação de patch, review, correction loop, rollback, lifecycle, diagnostics, observability.
3. **CLI** (`npm run execute`) — orquestração humana: execução principal, `--resume`, `--rollback`, `--observability`, `--force`.

Fluxo resumido: handoff → executor MVP → patch validation → review → correction (quando aplicável) → agregação diagnostics → observability → relatório de integridade opcional.

## Lifecycle (`execution/execution-lifecycle.json`)

Estados globais: `pending`, `preparing`, `running`, `recovering`, `resuming`, `completed`, `failed`, `interrupted`.

- **Início:** `prepareLifecycleAtRuntimeStart` cria ou reabre documento; deteta sessão incompleta e marca recovery.
- **Checkpoint:** `saveExecutionCheckpoint` alinha `last_checkpoint` com subtask corrente.
- **Terminal:** `finalizeLifecycleDocument` com `completed` ou `failed` após validação pré-observability.
- **Interrupção:** `markLifecycleInterrupted` persiste estado interrompido quando o pipeline falha antes do terminal.

## Recovery / resume

- `--resume` coopera com `prepareLifecycleAtRuntimeStart` para incrementar `recovery.resume_count` e eventos `execution_resumed`.
- Runs antigos com lifecycle incompleto são detetados (`recovering` / `resuming`).
- **Limitação MVP:** não há orquestração multi-processo; o resume assume reentrada idempotente no mesmo output dir.

## Rollback (`execution/rollback/`)

- Snapshots pré-execução por subtask (`NNN-snapshot.json`, backups em `rollback/backups/NNN/`).
- `tryAutoRollbackAfterFailure` e rollback manual CLI (`--rollback`) restauram ficheiros rastreados dentro de `allowed_files`.
- Estado agregado em `rollback-state.json` e espelhado na session/diagnostics.

## Observability (`execution/execution-observability.json`)

- Timeline estável derivada de `execution-diagnostics.json` (categorias, ordenação determinística).
- Agregação deduplicada de warnings/erros de patch, review, correction e execution result.
- Rebuild idempotente com `--observability` e `--force` (strip de eventos `observability_*` quando aplicável).

## Artefactos principais

| Artefacto | Função |
|-----------|--------|
| `execution-session.json` | Contadores MVP, fase bundle, rollback, lifecycle, flags interrupted/resumed |
| `execution-diagnostics.json` | Eventos append-only, summary alinhado à session |
| `execution-lifecycle.json` | Estado global lifecycle + recovery |
| `execution/rollback/rollback-state.json` | Contadores rollback |
| `execution-observability.json` | Timeline + troubleshooting + referências a artefactos |
| `execution/runtime-integrity-report.json` | Resultado agregado de `validateExecutionRuntimeDetailed` (valid, warnings, errors, contagens) |

Fase de bundle nos documentos de topo: **`4.11`** (aceite **`4.10`** apenas para leitura/legado).

## CLI (`npm run execute`)

```
npm run execute -- --run <runId|pasta-output> [--resume] [--force] [--rollback] [--observability] [--json]
```

Combinações **rejeitadas**:

- `--observability` + `--rollback`
- `--observability` + `--resume`
- `--rollback` + `--resume`

Avisos de validação (não bloqueantes) são impressos em stderr quando `ok` e não `--json`.

## Validação (`validate-execution-runtime.js`)

- `validateExecutionRuntimeDetailed` devolve `{ errors, warnings, checked_artifacts, checked_subtasks }`.
- Erros bloqueiam `npm run execute`; warnings sinalizam legado 4.10, duplicados em diagnostics, inconsistências leves (ex.: `modified_files` vs snapshot, `review_failed` vs `correction_completed`).

## Troubleshooting

| Sintoma | Verificar |
|---------|-----------|
| `EXECUTE_VALIDATION_FAILED` | Mensagens em `validate-execution-runtime` (session vs diagnostics vs observability) |
| Observability desatualizada | `npm run execute -- --run <id> --observability` ou `--force` |
| Rollback sem snapshot | `rollback-state`, eventos `rollback_failed` com `NO_SNAPSHOT` |
| Fase legada 4.10 | Reexecutar execute ou `ensureRollbackContractMvp` (observability) para alinhar campos |

## Limitações MVP

- Ordem **linear** fixa; sem DAG dinâmico.
- Um executor MVP por vez por run; sem multi-agent.
- UI Web ausente — apenas JSON + CLI.
- Relatório de integridade não substitui revisão humana de patches.

## Relação futura

- **DAG / scheduler / paralelismo:** exige novo modelo de `execution-order` e estado por nó; este runtime mantém contratos versionados para migração incremental.
- **Web UI:** pode consumir `execution-observability.json`, diagnostics e integrity report sem alterar o núcleo.
- **Orquestração distribuída:** exigiria fonte de verdade externa; hoje o filesystem do run é a única store.
- **Multi-agent:** handoff e review poderiam ser roteados; o contrato de `architect-handoff` permanece como fronteira única por subtask.
