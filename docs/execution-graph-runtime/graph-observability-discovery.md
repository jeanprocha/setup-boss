# Graph Observability — Discovery

## Sistema atual (diagnóstico / inspect)

- **CLI** `scripts/cli/index.js` com comandos: `inspect`, `inspect-plan`, `inspect-correction`, `inspect-review`, `inspect-validation-runtime`, `inspect-transaction`, `governance-inspect`, `semantic-inspect`, `status`, `queue`, `doctor`, `watch`, etc.
- **Telemetria**: `ctx.telemetry` (steps `pipeline.*`), plan telemetry (`execution-plan/telemetry`), transaction telemetry, validation telemetry.
- **Event bridge**: `emitBridge` — fases para daemon/UI (`phase_started`, `phase_completed`, `phase_failed`, `runtime_started/finished`).
- **Daemon**: `runtime-events.js`, `scheduler-loop.js`, `queue-store.js` — visibilidade **job-level**.
- **Artefactos humanos**: `preflight-summary.md`, `patch-preview.md`, relatórios JSON diversos.

## Lacunas vs visão DAG

- Não há visão única de **grafo** nem **caminho crítico** do pipeline macro.
- Sub-passos dentro de `runExecutorStep` (validation, risk) aparecem como telemetria pontual, mas não como grafo persistido.

## Projeto: `inspect-graph` (futuro)

**Objetivo**: comando que leia `execution-graph-runtime.json` (overlay) + `metadata.json` + `runtime-checkpoints.json` e produza:

- Lista de nós com timeline (`started_at`/`finished_at`).
- Cadeias de dependência (parents/children).
- **Caminho crítico** aproximado: soma durações por maior caminho em DAG **shadow** (sem paralelismo real, crítico = cadeia mais longa sequencial).
- Diff entre ordem linear esperada e ordem observada (modo advisory).

## Visualização

- Curto prazo: **ASCII / tabela** (reusar `scripts/cli/render/table.js`).
- Médio prazo: export Graphviz DOT ou Mermaid a partir do JSON shadow (fora escopo implementação 4.12).

## Node timelines

- Fonte primária: hooks overlay anotando timestamps; fallback: inferir de `run-log.json.steps` onde nomes coincidirem com kinds.

## Dependency chains

- Overlay graph edges; enrichment com nomes de ficheiros de `artifacts_expected`.

## Integração com existente

- `inspect-transaction` já narra estágios transaccionais — alinhar vocabulário `kind` com `transaction-stages.js` para não duplicar conceitos conflituosos.

## Riscos

- Sobrecarga de I/O se cada nó escrever disco — batching de updates ao graph JSON por fase macro inicialmente.

## Arquivos de referência

- `scripts/cli/commands/inspect*.js`
- `scripts/cli/lib/run-summarize.js`, `runs-discovery.js`
- `scripts/runtime/runtime-event-bridge.js`
- `scripts/daemon/lib/runtime-events.js`
