# MVP Fase 3 — Strategy runtime (pós-clarificação)

Documentação de encerramento da **Fase 3 (MVP)**: após **`phase2.status = ready_for_execution`** e **`approval-state.json`** com **`approved`**, o runtime gera artefactos sob **`strategy/`** e consolida o handoff **`execution-ready-handoff.json`**. **Não** executa código do projeto alvo, **não** invoca executor/review/correction da Fase 4.x, **não** cria DAG nem scheduler.

## Objetivo

- Transformar o plano refinado e o contexto da corrida numa **estratégia preparada**: complexidade, modo IA recomendado, decomposição em subtasks, ordem linear de execução, contexto partilhado, validação de prontidão e **handoff único** para fases futuras.
- Manter o MVP **auditável** (JSON em disco, `strategy-diagnostics.json`, `run-context.phase3`).

## Pré-requisitos

| Condição | Detalhe |
|----------|---------|
| Output de **intake** válido | `run_type: intake` e artefactos intake coerentes. |
| **Fase 2** concluída para execução | `run-context.phase2.status === "ready_for_execution"`. |
| Aprovação | `approval-state.json` com **`status: "approved"`**. |
| `run-context.json` | Presente e legível na pasta de output. |

Sem estes requisitos, o runtime devolve erro codificado (ex.: `STRATEGY_PHASE2_NOT_READY`, `STRATEGY_APPROVAL_NOT_APPROVED`).

## Fluxo completo (ordem lógica)

1. **Análise de complexidade** → `strategy/complexity-analysis.json` (fase 3.2 no artefacto).
2. **Recomendação de estratégia IA** → `strategy/ai-strategy.json` (3.3).
3. **Decomposição** → `strategy/decomposition.json` + `strategy/subtasks/*.json` (3.4).
4. **Ordem de execução** (linear) → `strategy/execution-order.json` (3.5).
5. **Contexto runtime partilhado** → `strategy/shared-runtime-context.json`; refs aplicadas às subtasks (3.6).
6. **Manifest intermédio** (3.6) e atualização de `run-context.phase3` (estado parcial até readiness).
7. **Readiness** → `strategy/strategy-readiness.json` (3.7); só prossegue se `validation.valid === true`.
8. **Handoff** → `strategy/execution-ready-handoff.json` (3.8); `execution-strategy.json` com `handoff_ready: true`; manifest final **3.8**; `run-context.phase3.handoff`.
9. **Validação final** → `validateStrategyArtifacts(outputDir)` (inclui 3.8 por defeito).
10. **Diagnósticos** → `strategy/strategy-diagnostics.json` (eventos + resumo + `handoff_ready`, `final_phase`, contagens).

## Artefactos gerados (`<output>/strategy/`)

| Ficheiro | Papel |
|----------|--------|
| `strategy-manifest.json` | Inventário da corrida: `run_id`, `strategy_artifacts[]`, fase/status finais (**3.8** / `execution_ready_handoff_completed`). |
| `execution-strategy.json` | Flags de preparação (`*_ready`, `strategy_ready`, `handoff_ready`); `execution_mode: "preparation_only"` (não confundir com `execution_mode` no **handoff**, ver contratos abaixo). |
| `complexity-analysis.json` | Scores, classificação, sinais e recomendações de complexidade. |
| `ai-strategy.json` | Modo recomendado (basic/standard/expert), perfis de custo/qualidade, `recommended_usage`. |
| `decomposition.json` | Estratégia de decomposição, contagem e resumo das subtasks. |
| `subtasks/*.json` | Uma ficheiro por subtask (`001.json`…); scope, dependências, critérios de aceite, `shared_context_refs`. |
| `execution-order.json` | Ordem linear (`ordering_mode: "linear"`), `ordered_subtasks`, avisos de dependências. |
| `shared-runtime-context.json` | Objetivo global, constraints, resumo estratégico agregado, refs. |
| `strategy-readiness.json` | Validação consolidada, `summary`, lista de artefactos considerados, `generated_at`. |
| `execution-ready-handoff.json` | **Entrada única** recomendada para fases futuras: resumo compacto, mapa de paths, lista `subtasks`, `next_phase: "phase4_execution_runtime"`; `execution_mode: "strategy_only"` neste documento. |
| `strategy-diagnostics.json` | Linha temporal de eventos (`strategy_runtime_started`, …, `execution_ready_handoff_*`, `strategy_runtime_completed`) e métricas de topo. |

Também são atualizados na raiz do output: **`run-context.json`** (`phase3` com blocos `complexity`, `ai_strategy`, `decomposition`, `execution_order`, `shared_context`, `readiness`, `handoff`).

## Contratos principais (resumo)

- **`strategy-manifest.json`**: `version`, `phase` (**3.8** quando concluído), `status` (`execution_ready_handoff_completed`), `created_at`, `run_id`, `strategy_artifacts` (deve incluir todos os ficheiros listados na tabela acima, incluindo handoff e subtasks).
- **`execution-strategy.json`**: `version`, `strategy_status`, `execution_mode` (**preparation_only**), booleanos de readiness por sub-fase + `handoff_ready: true` ao fim.
- **`execution-ready-handoff.json`**: `version`, `phase: "3.8"`, `status: execution_ready_handoff_completed`, `execution_mode: "strategy_only"`, `summary`, `artifacts` (object com paths), `subtasks[]`, `shared_context_ref`, `next_phase`, `generated_at`.
- **`run-context.phase3.handoff`**: `{ "status": "execution_ready_handoff_completed", "artifact": "strategy/execution-ready-handoff.json" }`.

Para schemas exactos e regras de validação, ver código em `scripts/runtime/strategy-runtime/validate-strategy-artifacts.js` e `run-strategy-runtime.js`.

## CLI — `npm run strategy`

```bash
npm run strategy -- --run <runId-ou-caminho-output>
npm run strategy -- --run <runId> --force
npm run strategy -- --run <runId> --json
```

- **`--run`**: obrigatório. Aceita **runId** (resolvido via índice global, ver `core/run-resolver`) ou **caminho absoluto** para a pasta de output do intake.
- **`--force`**: ignora o atalho idempotente e **regenera** toda a árvore `strategy/` (útil após correção manual de `task-plan-refined.md` ou migração de corrida antiga só até 3.7).
- **`--json`**: stdout só com objeto JSON (`ok`, `skipped`, `artifacts`, `error`, …).

### Quando usar `--force`

- Pasta já tinha Fase 3 válida mas alterou inputs relevantes (ex.: plano refinado) e o **skip** impediria atualizar.
- Corrida gerada antes do handoff **3.8** e validação a falhar por artefactos em falta: uma execução com `--force` alinha ao contrato actual.

### Idempotência (sem `--force`)

Se `validateStrategyArtifacts` passa e `run-context.phase3` já reflecta readiness + handoff completos, o runtime **não reescreve** ficheiros e responde com **skip** (mensagem e/ou `skipped: true` em JSON).

## Relação com `ready_for_execution`

A Fase 3 **só arranca** quando a Fase 2 terminou com **`phase2.status === "ready_for_execution"`** e aprovação **`approved`**. Isto garante plano refinado e decisão humana antes de gastar decomposição e artefactos de estratégia.

## Relação futura com a Fase 4

- O handoff aponta `next_phase: "phase4_execution_runtime"` como **convenção documental**; a Fase 4 (executor real, review, etc.) **não** faz parte deste MVP.
- Consumidores futuros devem preferir **`execution-ready-handoff.json`** como índice em vez de ler cada ficheiro isoladamente.

## Limitações MVP

- Ordenação **linear** apenas (`ordering_mode: "linear"`).
- Sem execução de comandos, builds ou testes no projeto alvo.
- Sem DAG, scheduler distribuído, workers nem retries automáticos.
- Depende da qualidade de `task-plan-refined.md` e do estado intake/clarify.

## Testes e smoke recomendados

```bash
node --test scripts/runtime/strategy-runtime/run-strategy-runtime.test.js scripts/runtime/strategy-runtime/validate-strategy-artifacts.test.js
node --test --test-name-pattern="executeClarification --approve" scripts/runtime/clarification/clarification-runtime.test.js
npm run smoke:mvp-phase2-clarification
```

A smoke da Fase 2 inclui validação de artefactos de clarificação que, em `ready_for_execution`, exigem também a **Fase 3** válida no output.

## Troubleshooting

| Sintoma | Verificar |
|---------|-----------|
| `STRATEGY_RUN_CONTEXT_MISSING` | Pasta correcta? Existe `run-context.json`? |
| `STRATEGY_PHASE2_NOT_READY` | `phase2.status` deve ser `ready_for_execution`. |
| `STRATEGY_APPROVAL_NOT_APPROVED` | `approval-state.json` com `approved`? |
| `STRATEGY_VALIDATION_FAILED` | Mensagens de `validateStrategyArtifacts`; correr com `--force` após corrigir inputs. |
| `STRATEGY_READINESS_INVALID` | `strategy-readiness.json` com `validation.valid: false`; ver `validation.errors`. |
| Skip inesperado | Remover inconsistências ou usar `--force` para regenerar. |
| Mensagem «Strategy runtime já concluído (skip)» | Comportamento normal se a corrida já está em 3.8 válido. |

## Referências

- Runtime: `scripts/runtime/strategy-runtime/run-strategy-runtime.js`, `build-execution-ready-handoff.js`, `validate-strategy-artifacts.js`.
- CLI: `scripts/strategy.js`.
- Fase 2: `docs/mvp-phase2-clarification-runtime.md`.
- Roadmap / evolução: `docs/setup-boss-roadmap.md`, `docs/setup-boss-evolution.md`.
