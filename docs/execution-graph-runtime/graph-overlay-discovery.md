# Graph Overlay Mode — Discovery (compatibilidade total)

## Requisito

Introduzir **Execution Graph Runtime** como **camada paralela**: advisory / shadow / observability, **sem** alterar fluxo oficial, outputs canónicos ou semântica de exit code.

## Padrão já existente no repo (precedente)

- **Execution plan shadow**: `SETUP_BOSS_PLAN_MODE=shadow` — `isShadowPlanModeEnabled()` em `execution-plan/feature-flags.js`; falhas no plano **não** derrubam pipeline.
- **Validation runtime**: default `off`; modo `report` não aborta; `active` acopla a governance.
- **Semantic validation propagation**: `shadow` apenas report.
- **Transaction runtime**: feature flags para writes vs semantics — padrão “nunca interferir com fluxo legacy” (`finalizeTxnSafe` comentários em `orchestration.js`).

## Modos overlay sugeridos para 4.12

| Modo | Comportamento | Superfície |
|------|---------------|------------|
| `off` | Sem graph artifact; zero overhead além de checks mínimos opcionais. | Default. |
| `shadow` | Constrói DAG + estados **em paralelo** às chamadas existentes; persiste `execution-graph-runtime.json` opcional; **não** altera ordem de execução. | Env tipo `SETUP_BOSS_GRAPH_OVERLAY=shadow`. |
| `advisory` | Igual shadow + **warnings** se ordem real divergir de ordem topológica de um DAG declarado (ex. bug futuro); ainda não bloqueia. | |
| `compare` (sub-modo) | Log estruturado: `linear_step_index` vs `graph_node_completed` timestamp skew. | Útil para CI interno. |

## Onde encaixar hooks (sem refactor massivo)

Pontos de instrumentação de **baixo risco** (apenas discovery — lista para implementação futura):

1. **Entrada/saída** de `executePreflightPhase`, `runArchitect`, `runExecutorStep`, `runReviewStep`, bloco correction, `finishKnowledge`.
2. **`appendCheckpoint`** — já centraliza fases macro; co-localizar eventos graph overlay reduz drift.
3. **`emitBridge` / `emitRuntimeEvent`** — canal existente para observabilidade sem novo transporte.

## Feature flags (proposta)

- `SETUP_BOSS_GRAPH_OVERLAY`: `off` \| `shadow` \| `advisory`
- Opcional: `SETUP_BOSS_GRAPH_OVERLAY_PERSIST=1` para escrever JSON em output dir.

Seguir convenção: ler só de módulo central (como plan/validation), não `process.env` espalhado.

## Observability hooks

- Reutilizar telemetria `ctx.telemetry.stepStart/stepEnd` com prefixo `graph.overlay.*`.
- Não aumentar volume em modo `off`.

## Compare mode (linear vs DAG)

- **Linear reference**: ordem hardcoded derivada de vetor fixo em código (`[preflight, architect, executor, review, correction*, knowledge]` com sub-steps documentados).
- **DAG order**: ordenação topológica do grafo shadow.
- **Assert**: em modo advisory, se `node executor` aparecer antes de `architect` no rastro real → warning (não deve ocorrer enquanto orchestrator não for alterado).

## Garantias de compatibilidade

- Nenhuma alteração em contratos de `executor-result.json`, `review-output.json`, `assessResume`.
- Exit codes e `logger.finish` permanecem determinados pelo fluxo atual.
- Overlay **read-only** em relação a decisões de governance/enforcement.

## Riscos

- **Doble-writes**: graph JSON desincronizado com `metadata.json` se hook falhar a meio — mitigar com “last known good” + schema_version.
- **PII/paths**: graph pode duplicar paths absolutos — respeitar políticas de redação em logs.

## Arquivos de referência

- `scripts/execution-plan/feature-flags.js`
- `scripts/validation-runtime/feature-flags.js`
- `scripts/runtime/orchestration.js` (try/catch shadow patterns)
- `scripts/runtime/runtime-event-bridge.js` (ponte eventos)
