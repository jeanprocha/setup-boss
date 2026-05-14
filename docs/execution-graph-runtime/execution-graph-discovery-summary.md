# Execution Graph Runtime (Fase 4.12) — Resumo executivo do Discovery

## Visão recomendada

Tratar o **Execution Graph Runtime** como **camada derivada + overlay shadow**, espelhando a ordem já imposta por `scripts/runtime/orchestration.js`. O núcleo permanece **sequencial e procedural**; o DAG formaliza dependências, estado de nós, fingerprints e futura extensibilidade **sem paralelismo real** na 4.12.

## Arquitetura alvo (incremental)

1. **Modelo e persistência opcional**: `execution-graph-runtime.json` no `outputDir`, populado apenas com feature flag (`graph-overlay-discovery.md`).
2. **Scheduler MVP**: função pura que, dado grafo + estado, escolhe **no máximo um** próximo nó — equivalente semântico ao fluxo atual (`graph-scheduler-discovery.md`).
3. **Adaptadores por stage**: mapeamento em `execution-node-mapping.md` — sem reescrever `review-runtime`, `correction-runtime`, `validation-runtime`.
4. **Replay**: evoluir contratos a partir de `replay-engine` + fingerprints existentes; subtree replay como extensão **depois** do overlay estável (`graph-replay-discovery.md`).
5. **Observabilidade**: `inspect-graph` consumindo o JSON overlay + artefactos atuais (`graph-observability-discovery.md`).

## Ordem correta de implementação (sugerida)

1. Flags + módulo central `graph-overlay` (read env único, default `off`).
2. Definir JSON schema / validação structural do graph (vazio em modo off).
3. Instrumentação **shadow** nos pontos macro: preflight, architect, executor step boundaries, review, correction, knowledge (`pipeline-runtime-map.md`).
4. Rebuild determinístico do graph a partir de artefactos existentes **sem hook** (prova de conceito / CI): dif tail-light.
5. Hooks ao vivo + persistência + comparação linear vs topo-order (advisory).
6. Scheduler extráido **só em testes** espelhando `runPostExecutorLoop` (paridade).
7. Documentar `inspect-graph` e integrar telemetria `graph.overlay.*`.
8. Só então: APIs de replay parcial ao nível do grafo (por trás dos mesmos gates de governance).

## Riscos

- **Deriva de estado** entre `metadata.json`, `runtime-checkpoints.json` e graph overlay.
- **Complexidade cognitiva** duplicando transaction-runtime + execution-plan + graph — risco de três “fontes de verdade”; mitigar com `links` no JSON e rebuild pass.
- **Overhead disco** em runs curtas — manter batching e modo off default.

## Blockers (não técnicos apenas)

- Falta de **contrato LLM determinístico** para architect/review/correction — replay “matemático” impossível sem congelar modelo/prompts; aceitar **replay artefacto-driven** como realista na 4.12.
- **Governance / approval**: qualquer replay ou scheduler que reexecute nós deve passar pelos mesmos gates (`resume-engine` / `replay-engine` já antecipam padrões).

## Decisões arquiteturais propostas

| Decisão | Escolha |
|---------|---------|
| Paralelismo | **Excluído** na 4.12. |
| Pipeline oficial | **Imutável** em comportamento; mudanças só via adaptadores e flags. |
| Fonte de verdade operacional | Continuar `outputDir` + artefactos legados; graph é **derivado**. |
| Shadow-first | Todos os novos caminhos default **off** ou **shadow/report**. |
| Scheduler | Um nó ativo por run até nova fase explícita. |

## Compatibilidade

- `run.js`, `resume.js`, `replay.js`, `executeRunPipeline`, `assessResume`, `RunLogger`, exit codes — **não** devem depender do grafo na 4.12.
- Daemon continua ao nível de **job**; DAG é **intra-run**.

## Roadmap incremental (pós-4.12 conceito)

- **4.12.x**: sub-nós explícitos para validation + risk dentro do executor step (ainda serial).
- **Fase futura** (não comprometida): paralelismo real só com fila ready + workers e novo modelo de locks por recurso.

## Recomendação final para a 4.12

**Implementar o Execution Graph Runtime como overlay de observabilidade e modelo de dados** (`execution-graph-runtime.json` + hooks shadow), provar **paridade** com o scheduler procedural atual via testes, e **adiar** qualquer alteração ao fluxo real até o modelo e fingerprints estarem estáveis. Isso cumpre: DAG conceitual, estado orientado a nós, preparação para replay parcial determinístico **onde o produto já é determinístico** (executor structural/manifest, validation tooling, checkpoints), e **zero** ruptura do pipeline linear.

## Índice dos entregáveis

| Documento | Conteúdo |
|-----------|---------|
| `pipeline-runtime-map.md` | Fluxo completo, loops, artefactos. |
| `execution-node-mapping.md` | Stages → nós DAG. |
| `graph-runtime-state-discovery.md` | Estado persistido + esboço JSON. |
| `graph-scheduler-discovery.md` | Decisão do próximo passo, limites daemon. |
| `execution-graph-model-discovery.md` | Schema nós/arestas, fingerprints. |
| `graph-overlay-discovery.md` | Shadow/advisory/compare. |
| `graph-replay-discovery.md` | Replay e side effects. |
| `graph-observability-discovery.md` | inspect-graph, timelines. |
| `graph-integrity-discovery.md` | Ciclos, retries, verificação. |

---
*Discovery apenas — sem implementação de scheduler final, execução DAG real ou paralelismo.*
