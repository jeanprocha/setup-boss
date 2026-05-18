# Fase 4.12.3 — Graph Scheduler MVP (serial, advisory)

## Objetivo

Fornecer um **scheduler serial determinístico** sobre o DAG canónico (4.12.1), ainda **sem** execução real de etapas do pipeline, **sem** paralelismo e **sem** integração na orquestração oficial. O resultado é **observabilidade derivada**: simulação de transições de estado (`pending → ready → running → completed`) e relatório opcional em modo **shadow**.

## Scheduler serial

- **Entrada:** grafo estrutural (`buildCanonicalExecutionGraph`) + snapshot runtime inicial (`buildInitialRuntimeSnapshot`, 4.12.2).
- **Dependências:** apenas arestas em `edges` (**hard** + **conditional**). **`repeat_edges` não entram** no cálculo de prontidão nem na travessia.
- **Ordem:** topológica de Kahn com fila de nós prontos ordenada **lexicamente** por `node_id` (alinhado ao `deterministicTopologicalOrder` estendido às arestas de `edges`).
- **Um nó de cada vez:** em cada passo escolhe-se no máximo um `node_id` entre os `pending` cujos predecessores estão `completed`; aplicam-se três transições por nó via `applyRuntimeTransition` (`transition-engine` 4.12.2).

## Execução advisory

- **`completed`** significa **fim simulado pelo scheduler**, não sucesso real do executor/review/etc.
- **Nenhum handler** de etapa (`executor.js`, `review.js`, …) é invocado; só existe meta `source: execution-graph-scheduler-advisory-mvp` nas transições locais.

## Limites do MVP

- Sem paralelismo, sem fila distribuída, sem event-driven runtime.
- **Repeat loop** (correction → executor) **não modelado** para scheduling; `repeat_edges` aparecem apenas em `skipped_repeat_edges` no relatório.
- Não substitui o pipeline nem altera `orchestration.js` ou fluxos de correction reais.

## Flags

| Variável | Valores | Comportamento |
|----------|---------|----------------|
| `SETUP_BOSS_EXECUTION_GRAPH_SCHEDULER` | `off` (default) \| `shadow` | `off`: nada. `shadow`: gera `execution-graph-scheduler-report.json` no `outputDir` da corrida (best-effort, erros engolidos, exit code inalterado). |

Debug opcional: `SETUP_BOSS_EXECUTION_GRAPH_DEBUG=1` regista aviso em falha de escrita.

## Artefacto: `execution-graph-scheduler-report.json`

Gerado no mesmo diretório que as restantes saídas da run (ex.: **`<projectRoot>/docs/.IA/outputs/<runId>/`**, legado **`<projectRoot>/.IA/outputs/<runId>/`**).

| Campo | Descrição |
|-------|-----------|
| `schema_version` | Versão do schema do relatório (inteiro). |
| `run_id` | ID da corrida. |
| `graph_id` | Identificador derivado do fingerprint. |
| `graph_fingerprint` | SHA-256 do grafo estrutural (4.12.1). |
| `scheduler_mode` | `shadow` quando gerado pelo hook shadow. |
| `deterministic_order` | Ordem canónica de scheduling (arestas `edges` apenas). |
| `executed_nodes` | Lista **advisory** na ordem de simulação. |
| `ready_events` | Por passo: `ready_node_ids` e `selected_node_id`. |
| `blocked_nodes` | Nós que ficaram `pending` se o scheduling não completar (erro). |
| `skipped_repeat_edges` | Cópia informativa de `repeat_edges` do grafo. |
| `transition_count` | Número de entradas em `transitions` do documento advisory. |
| `lifecycle_summary` | Resumo por estado no fim da simulação (quando aplicável). |
| `diagnostics` | Inclui `ok`, flags `advisory_only`, `scheduler_uses_repeat_edges`, erros de validação, etc. |
| `created_at` | ISO timestamp de criação do relatório. |

## Por que não executa handlers reais

O objetivo da 4.12.3 é **validar o modelo** de prontidão, dependências e ordem **sem** efeitos colaterais no projeto alvo ou nos runtimes de etapa. A execução real continua exclusivamente na stack existente (`run.js` / orquestração).

## Próximos passos (4.12.5+)

- Overlay pipeline (4.12.4) entregue — ver **`docs/execution-graph-runtime/phase-4-12-4-pipeline-overlay-mode.md`**.
- Pontes opcionais com fases reais (`emitBridge` / checkpoints) mantendo o adapter fino além do collector actual.
- Replay parcial / estados forçados.
- Políticas sobre ramos condicionais (approved vs correction) sem duplicar execução advisory.

## Ver também

- `docs/execution-graph-runtime/phase-4-12-1-execution-graph-model.md`
- `docs/execution-graph-runtime/phase-4-12-2-graph-state-runtime.md`
- `docs/execution-graph-runtime/graph-scheduler-discovery.md`
