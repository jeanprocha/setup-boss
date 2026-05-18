# Relatório — Refactor UX operacional visual (pipeline simplificado)

**Data:** 2026-05-17  
**Escopo:** Camada visual/operacional do Mission Control (UX-C) — runtime interno inalterado  
**Execução:** append-only

---

## Resumo

O fluxo operacional visível passou de 11 checkpoints (com Estratégia, Revisão, Correção, Conhecimento e Aprovação/Git separados) para **6 passos** alinhados com uma corrida de desenvolvimento real. O runtime continua a emitir e processar todas as fases internas; apenas a apresentação dominante mudou.

---

## Arquitetura anterior vs nova

### Anterior (UX-C / timeline)

| Ordem | Checkpoint visual | Origem runtime |
|------:|-------------------|----------------|
| 1 | Intake | intake |
| 2 | Clarificação | clarification |
| 3 | Plano | plan |
| 4 | Aprovação | approval |
| 5 | Git | git |
| 6 | Estratégia | strategy |
| 7 | Execução | execution |
| 8 | Revisão | review |
| 9 | Correção | correction |
| 10 | Conhecimento | knowledge |
| 11 | Concluído | completed |

Banner e labels expunham explicitamente «Estratégia», «Revisão», «Git», etc.

### Nova (modelo simplificado)

| Ordem | Checkpoint visual | Agrega (runtime interno) |
|------:|-------------------|---------------------------|
| 1 | Intake | intake |
| 2 | Clarificação | clarification |
| 3 | Plano refinado | plan + approval |
| 4 | Versionamento | git / branch prepare |
| 5 | Execução | strategy, execution, review, correction, knowledge, workspace |
| 6 | Concluído | terminal success |

Banner dominante: apenas `Intake`, `Clarificação`, `Plano refinado`, `Versionamento`, `Execução`, `Concluído`, `Falhou`, `Aguardando ação`.

---

## Checkpoints removidos (visualmente)

- `approval` → fundido em **Plano refinado**
- `git` → renomeado/representado como **Versionamento**
- `strategy` → oculto; eventos sob **Execução**
- `review` → oculto; eventos sob **Execução**
- `correction` → oculto; eventos sob **Execução**
- `knowledge` → oculto; eventos sob **Execução**

**Não removidos no runtime:** handlers, orchestration, SSE, review/correction/knowledge pipelines.

---

## Novos mappings

### Módulo central: `operational-visual-model.ts`

- `mapInternalActiveStepToVisual()` — `RunUxActiveStep` → passo visual
- `mapUxKindToVisualCheckpoint()` — evento UX → checkpoint da timeline
- `executionMacroActivityMessage()` — copy viva do macro-step Execução
- `versioningCheckpointMessage()` + `needsVersioningPrepareCta()` — Versionamento + CTA

### Estado UX: `derive-run-ux-state.ts`

- Novo campo `visualStep` em `RunUxState`
- Headlines de strategy/review/correction deixam de mencionar «estratégia» na superfície; usam mensagens de execução contínua

### Timeline: `derive-execution-timeline.ts`

- 6 checkpoints fixos
- Opção `versioning` para contexto Git (branch, `executeBlockCode`, pending)
- `showPrepareBranchCta` no checkpoint Versionamento

### Banner: `resolve-active-step-banner-view.ts`

- Labels só do modelo visual
- CTA **Preparar branch** quando `git_branch_required` / falha de branch

---

## Eventos agregados em «Execução»

| Tipo de evento (runtime) | Apresentação no feed / execução |
|--------------------------|----------------------------------|
| `strategy_*` | Macro-fase «Execução»; mensagem ex. «A analisar e planear alterações…» |
| `execution_*` | «Execução» |
| `review_*` | «Execução»; ex. «A executar revisão automática…» |
| `correction_*` | «Execução»; ex. «A aplicar correção…» |
| `knowledge_*` | «Execução» |
| `workspace_run.*` | «Execução» |

`build-runtime-activity-feed.ts`: campo `macroPhaseLabel` (badge no feed).

Aba **Execução técnica** (`RuntimeObservabilityTechnical`): inalterada — eventos brutos.

Aba **Logs do runtime**: passa a usar `RuntimeActivityFeed` (humanizado + macro-fase).

---

## Componentes removidos / refatorados

| Componente | Alteração |
|------------|-----------|
| `RunViewShell` | Removido cartão hero **Estratégia** (`StrategyStageHero` + `StrategyPanel`) da coluna central |
| `RunViewShell` | Adicionados `OperationalUxPanel` + `OperationalDetailCollapse` |
| `OperationalUxPanel` | **novo** — banner + timeline UX-C |
| `OperationalDetailCollapse` | **novo** — timeline técnica legada recolhida |
| `ActiveStepBanner` | CTA Preparar branch; versioning context |
| `ExecutionTimelineView` | CTA no passo Versionamento |
| `semantic-workflow-mapper.ts` | Fases strategy/review mapeadas para card **Execução** |
| `project-run-workflow-feedback.ts` | Sem passos «Gerando estratégia» / «Estratégia pronta» |
| `mission-workflow-stages.ts` | `deriveAttentionHint` sem copy de estratégia dominante |
| `ObservabilityPanel` | `runtime_logs` → `RuntimeActivityFeed` |

**Mantidos (runtime / técnico):** `StrategyPanel`, hooks de strategy, `buildExecutionTimelineCards`, orchestration, git APIs.

---

## Impacto visual

1. **Uma timeline dominante** com 6 passos — utilizador vê imediatamente onde está.
2. **Execução contínua** — strategy/review/correction aparecem como progresso no mesmo passo, não como fases «mortas».
3. **Versionamento explícito** — substitui gate Git opaco; CTA «Preparar branch» no passo e no banner.
4. **Menos ruído cognitivo** — sem card grande «Estratégia em curso» na coluna principal.
5. **Detalhe técnico opt-in** — `CentralExecutionTimeline` dentro de collapse fechado por defeito.

---

## Validação

| Verificação | Resultado |
|-------------|-----------|
| Testes `frontend/lib/runtime/ux/*.test.ts` | **52/52** pass |
| Linter ficheiros editados | Sem erros reportados |
| Fluxo manual (approve → branch → exec → review → completed) | Pendente validação humana com `npm run dev:stack` |

### Checklist manual sugerido

- [ ] Aprovar plano refinado → passo visual correto + CTA se aplicável
- [ ] Preparar branch (timeline + banner)
- [ ] Execução com strategy/review/correction → mensagens vivas em «Execução»
- [ ] Feed «Logs do runtime» com badge macro-fase
- [ ] Aba técnica com eventos completos
- [ ] Workspace / SSE / child runs sem regressão

---

## Possíveis próximos passos

1. Unificar `useRunUxState` num único hook partilhado por painel central e observabilidade (evitar dupla normalização).
2. Passar `lastEventType` ao `ProjectRunWorkflowStatusStrip` se voltar a ser usado noutro contexto.
3. i18n completo para strings hardcoded PT em `operational-visual-model` / CTAs.
4. Indicador de progresso sub-fase dentro de Execução (opcional, sem reabrir checkpoints separados).
5. Validação E2E automatizada do fluxo simplificado.

---

## Ficheiros principais alterados

- `frontend/lib/runtime/ux/operational-visual-model.ts` (novo)
- `frontend/lib/runtime/ux/derive-execution-timeline.ts`
- `frontend/lib/runtime/ux/derive-run-ux-state.ts`
- `frontend/lib/runtime/ux/runtime-ux-types.ts`
- `frontend/lib/runtime/ux/resolve-active-step-banner-view.ts`
- `frontend/lib/runtime/ux/build-runtime-activity-feed.ts`
- `frontend/lib/runtime/mission/project-run-workflow-feedback.ts`
- `frontend/lib/runtime/mission/mission-workflow-stages.ts`
- `frontend/lib/runtime/execution/semantic-workflow-mapper.ts`
- `frontend/components/features/run-detail/OperationalUxPanel.tsx` (novo)
- `frontend/components/features/run-detail/OperationalDetailCollapse.tsx` (novo)
- `frontend/components/features/run-detail/RunViewShell.tsx`
- `frontend/components/features/run-detail/ActiveStepBanner.tsx`
- `frontend/components/features/run-detail/ExecutionTimelineView.tsx`
- `frontend/components/features/run-detail/RuntimeActivityFeed.tsx`
- `frontend/components/features/observability/ObservabilityPanel.tsx`
- `frontend/locales/pt-BR.ts`, `frontend/locales/en.ts`
- Testes UX atualizados (`*.test.ts`)
