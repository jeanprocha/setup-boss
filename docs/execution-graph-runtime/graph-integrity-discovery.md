# Graph Integrity & Safety — Discovery

## Riscos DAG runtime (mesmo sem paralelismo)

| Risco | Descrição | Mitigação sugerida (4.12+) |
|-------|-----------|----------------------------|
| Ciclos | Arestas mal formadas bloqueiam topo-sort / scheduler. | Validação estática ao carregar grafo; `cycle_detection` DFS com report. |
| Orphan nodes | Nós sem caminho da raiz `preflight`. | Lint: alcançabilidade desde raiz(es). |
| Blocked chains | Nó `failed` sem política de skip deixa sucessores mortos. | Estado `blocked` explícito + telemetria; hoje review `blocked` já parcial pipeline. |
| Retry storms | Loops correction + recovery simultâneos. | LIMITES existentes: `MAX_CORRECTIONS`, `MAX_TOTAL_STEPS`, suppression gate — scheduler deve **respeitar** os mesmos contadores. |
| Replay inconsistente | Subárvore reexecutada com inputs velhos. | Fingerprints por nó + gate governance + manifest integrity (já em resume). |
| Deadlocks (futuro paralelo) | Fora escopo 4.12; anotar “não aplicável MVP”. | — |
| Non-deterministic unlocks | Múltiplos ready sem regra estável. | Ordenação canónica de ready queue. |

## Integrity validation (camadas)

1. **Structural**: schema JSON + enums + `node_id` uniqueness + edges referenciais válidas.
2. **Semantic**: para cada `kind`, `artifacts_expected` presentes quando `status=success`.
3. **Policy**: integração governance — mesmas chamadas `evaluateGovernanceResumeReplayGate` para ações destrutivas.

## Graph verification (pipeline oficial intocado)

- Modo `shadow`: falhas de verificação **log-only**.
- Modo futuro `enforce` (não recomendado na 4.12 inicial): poderia bloquear — conflita com requisito de compat; adiar.

## Runtime protections já existentes reutilizáveis

- `assertFlowLimits` — teto de steps em `run-log.json`.
- `validateExecutorChangesIntegrity` — resume.
- `evaluateCorrectionRetrySuppressionGate` — evita repetição de mesma falha.
- Transaction runtime recovery/rollback análise — visão transaccional complementar.

## Retry storm invariantes

- Scheduler MVP deve serializar: **no máximo um nó `running`** por run.
- Reentrada correction não incrementa “parallelism”; apenas `iteration`.

## Consistency com filesystem

- `outputDir` é fonte de verdade; graph overlay é **derivado**.
- Se divergência: preferir reconciliar graph a partir de checkpoints + metadata (rebuild pass).

## Test matrix sugerido (futuro, não agora)

- Grafo linear válido = comportamento idêntico ao atual.
- Grafo com ciclo → erro em modo dev.
- Ordem pronta estável com dois nós independentes fictícios **só em teste** (futuro; MVP não introduz independência real).

## Arquivos relacionados

- `scripts/runtime/orchestration.js` (limits, gates)
- `scripts/runtime/replay/resume-engine.js` (integrity manifest)
- `scripts/correction-runtime/correction-pipeline.js` (suppression)
- `scripts/transaction-runtime/recovery-engine.js`
