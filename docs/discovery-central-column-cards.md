# Discovery — Coluna central: inventário semântico de cards e blocos

**Data:** 2026-05-15  
**Âmbito:** apenas discovery e documentação (sem alterações de código, layout ou design system).  
**Definição de “coluna central”:** região principal do Mission Control renderizada por `RunViewShell` dentro de `ExecutionFeed` (`frontend/components/features/run-detail/RunViewShell.tsx`), excluindo a sidebar de actividades, o painel direito (`RightTimelinePanel`) e o chrome superior — salvo menção explícita a regiões ocultas ou correlacionadas.

---

## 1. Método

- Leitura da composição de `RunViewShell`, `MissionWorkspacePhase`, `ExecutionStepBlock`, adaptadores `dynamic-activity-steps.ts`, `mission-workflow-stages.ts`, `runtime-workflow-phases.ts` e painéis filhos (clarificação, strategy, execução).
- Cruzamento com `docs/setup-boss-mvp-ui-roadmap.md` para expectativas de produto e lacunas.
- **Nota:** `RunActivityStream.tsx` existe e está documentado em relatórios antigos, mas **não** está referenciado no `RunViewShell` actual; trata-se como componente preparado / legado para stream técnico na coluna ou noutra região.

---

## 2. Inventário completo de cards e blocos

### 2.1 Legenda de colunas da tabela mestra

| Coluna | Significado |
|--------|-------------|
| **Nome** | Rótulo operacional percebido pelo operador |
| **Tipo** | `shell` · `timeline` · `fase` · `painel` · `sub-card` · `estado-vazio` |
| **Origem** | Onde a verdade nasce |
| **Estados** | Estados de UI ou de domínio relevantes |
| **Prioridade** | hero · operational · informational · warning · critical · passive · system |
| **Acções** | Interacções típicas |

### 2.2 Tabela mestra — coluna central (ordem aproximada de leitura)

| Nome | Tipo | Origem | Estados | Prioridade | Acções |
|------|------|--------|---------|------------|--------|
| Cabeçalho da actividade (“ribbon” de fase / idle) | shell | frontend + `RunSummaryDto` | carregando · fase activa · idle | passive | — |
| **Entrada da tarefa** (bloco timeline) | timeline | frontend (`buildActivityStepInstances`) | `ExecutionStepSurfaceStatus`: pending/active/done/blocked | operational | composição de texto |
| **Corrida criada / resultado de submit** (`TaskSubmissionCard`) | sub-card | API create-run + frontend | sucesso + badges de classificação | informational → operational | leitura; hint para clarificação |
| **Marcos de evento** com copy operacional (`OperationalCheckpointBody`) | timeline | runtime events + `formatRuntimeCheckpoint` | severity: info/success/warning/error; passo active/done | operational / warning / critical | expandir mentalmente o fluxo; scroll-spy |
| **Marco técnico simples** (`ExecutionEventItem`) | timeline | runtime events | severidade do evento | informational / warning | — |
| **Fase viva** (título derivado de lifecycle + clarificação/strategy) | timeline | orquestração + summary | texto + SSE phase hint | operational | âncora `act-live-phase` |
| **Estado operacional** (`OperationalFocusCard`) | painel | summary + `useRunOperational` + hints | estado da corrida + headline + attention hint + último evento | **hero** (quando activo) | orientação; não é formulário |
| **Etapa 1 — Intake** (`MissionWorkspacePhase` + `TaskComposer`) | fase | runtime phase intake | `MissionWorkspacePhaseStatus` derivado | operational | criar corrida |
| **Etapa 2 — Clarificação** (`ClarificationPanel` e filhos) | fase | API clarification bundle | runtime phases clarificação (lista em §3) | operational / **waiting_input** | responder; aprovar; refinamento |
| **Etapa 3 — Estratégia** (`StrategyStageHero` + `StrategyPanel`) | fase | API strategy | runtime phases strategy | hero quando “dominant strategy handoff” | gerar / rever plano |
| **Etapa 4 — Execução** (`ExecutionPanel` e filhos) | fase | API execution | lifecycle phases execução | operational / running / blocked | controlos de corrida; correlacionar evidência |
| **Resumo pós-sucesso** (`RuntimeSummary`) | painel | agregado read-models | só quando `state === success"` | informational (encerramento) | leitura |
| **Estados vazios** (`EmptyState`, `LoadingState`) | estado-vazio | frontend + conectividade | offline · sem projectos · sem actividade · run não encontrado | warning / passive | criar projecto; refresh; selecção |

### 2.3 Sub-cards dentro da **Clarificação** (`ClarificationPanel`)

| Nome | Objetivo | Origem | Persistência | Conteúdo | Acções |
|------|----------|--------|--------------|----------|--------|
| Estado / indisponível | explicar gap | API + regras `applies` | volátil | texto | refetch |
| `ClarificationQuestionCard` | capturar respostas HITL | bundle | até submit | texto + formulário | editar; enviar |
| `RefinementPreview` | mostrar SPEC refinado | runtime clarificação | sessão | markdown/texto | aprovar fluxo associado |
| `ApprovalFlow` | gate humano SPEC | política + bundle | até decisão | texto + botões | aprovar / rejeitar / pedir refinamento |
| `ClarificationStateBadge` | densidade de estado | `runtimePhase` | reflecte API | badge | — |

### 2.4 Sub-cards dentro da **Strategy** (`StrategyPanel`)

| Nome | Objetivo | Origem | Conteúdo típico | Acções |
|------|----------|--------|-----------------|--------|
| `ComplexityCard` | contexto de risco | strategy bundle | métricas/labels | — |
| `AIRecommendationCard` | recomendação operacional | idem | texto + modo | — |
| Readiness strip (inline) | readiness + ordering | idem | badges counts | — |
| `SubtaskStrategyTree` | decomposição | idem | árvore | navegação |
| `ExecutionOrderingView` | ordem planeada | idem | lista ordenada | — |
| `SharedContextView` | contexto partilhado | idem | texto/lista | — |
| Riscos críticos (`Surface` + lista) | destaque de risco | idem | lista | — |
| `StrategyStateBadge` | estado compacto | `runtimePhase` | badge | — |

### 2.5 Sub-cards dentro da **Execução** (`ExecutionPanel`)

| Nome | Objetivo | Origem | Conteúdo | Acções |
|------|----------|--------|----------|--------|
| `OrchestrationRunControls` | controlar corrida | API + summary | botões (execute, etc.) | accionáveis conforme API |
| `ExecutionProgressCard` | progresso + subtask activa | execution bundle | barras / labels | — |
| Bloqueios (`BlockerList` em `Surface`) | explicar bloqueio | bundle | lista | mitigar fora da UI se necessário |
| `ReviewCorrectionCard` → `ReviewExecutionCard` + `CorrectionLoopCard` | review + correcção | bundle | estado review/correction | aprovação / feedback conforme modelo |
| `RetryRecoveryCard` | retry e recovery | bundle | texto estruturado | retry/resume se exposto |
| `SubtaskExecutionList` | fila de subtarefas | bundle + lista | steps | seguir execução |
| `ExecutionCorrelationStrip` | saltar para evidência | correlação | links | navegar para timeline/stream/diagnostics (scroll) |
| `ExecutionStateBadge` | fase lifecycle | execution | badge | — |

### 2.6 Componentes de execução existentes **não** montados directamente no `ExecutionPanel`

- `ExecutionProgressStrip.tsx` — verificar reutilização noutro sítio; não aparece no trecho analisado de `ExecutionPanel`.
- `SubtaskExecutionCard.tsx` — possível granularidade futura por subtarefa na timeline central vs lista actual.

---

## 3. Estados existentes (duas camadas)

### 3.1 Superfície da timeline (`ExecutionStepSurfaceStatus`)

`pending` · `active` · `done` · `blocked` — controla ênfase visual do `ExecutionStepBlock` e hint (Ativo / Concluído / Pendente / Interrompido; variantes “Atenção” / “Erro” com `checkpointSeverity`).

### 3.2 Cartões de fase (`MissionWorkspacePhaseStatus`)

`ACTIVE` · `COMPLETED` · `WAITING` · `WAITING_USER_ACTION` · `RUNNING` · `BLOCKED` · `FAILED` · `PENDING` · `UPCOMING` — derivados em `deriveMissionWorkspaceStatuses` a partir de `RunSummaryDto` + slices de clarificação, strategy e execução.

### 3.3 Fases de domínio (runtime) — alimentam copy e badges

**Clarificação** (`CLARIFICATION_RUNTIME_PHASES`):  
`clarification_required` · `clarification_empty` · `waiting_answers` · `refining` · `refinement_ready` · `awaiting_approval` · `approved` · `rejected` · `ready_for_execution` · `strategy_pending` · `unavailable`

**Strategy** (`STRATEGY_RUNTIME_PHASES`):  
`strategy_pending` · `strategy_generating` · `strategy_ready` · `strategy_blocked` · `strategy_failed` · `strategy_approved` · `ready_for_execution` · `unavailable`

**Execução** (`EXECUTION_LIFECYCLE_PHASES`):  
`execution_pending` · `execution_running` · `review_running` · `correction_running` · `retry_running` · `rollback_running` · `recovery_running` · `execution_blocked` · `execution_failed` · `execution_completed`

### 3.4 Estados futuros úteis (proposta)

- `streaming` / `partial_output` para tokens ou logs em tempo real na mesma superfície.
- `paused_by_operator` vs `paused_by_policy`.
- `superseded` quando um re-run substitui visualmente uma tentativa (agrupamento de timeline).

---

## 4. Fluxo completo da timeline (jornada operacional)

### 4.1 Caminho feliz (macro)

1. **Shell** — projecto seleccionado; lista de runs.
2. **Nova actividade** — apenas bloco “Entrada da tarefa” com `TaskComposer` (+ `TaskSubmissionCard` após create).
3. **Run seleccionado** — sequência:
   - Bloco timeline **Entrada da tarefa** (intake dentro de `MissionWorkspacePhase` ou equivalente em modo “ribbon operacional”).
   - **Marcos** derivados de eventos filtrados (`shouldIncludeEventInNav`) — job enqueued, run_created, intake_completed, fases, execução, review, etc.
   - **Fase viva** — síntese “onde estamos” (ex.: “Gerando plano”, “Executando subtarefas”).
   - **OperationalFocusCard** — headline + hint de atenção humano + último evento.
4. **Clarificação** (se `applies`) — perguntas → refinamento → aprovação SPEC.
5. **Strategy** (se `applies`) — geração → revisão → aprovação; **hero** quando `needsDominantStrategyCta`.
6. **Execução** (se `applies`) — progresso, subtarefas, review/correction, retry/recovery, correlacionar evidência.
7. **Sucesso** — `RuntimeSummary` como cartão de encerramento.

### 4.2 Caminhos alternativos

| Situação | Comportamento na coluna central |
|----------|----------------------------------|
| Clarificação `rejected` | fase clarify → `BLOCKED`; operador deve recuperar via fluxo suportado pela API |
| Strategy `strategy_failed` | fase strategy → `FAILED` |
| Execução `execution_failed` | fase exec → `FAILED`; timeline pode marcar passo como `blocked` |
| `waiting_approval` na execução | exec → `WAITING_USER_ACTION`; hint no focus card |
| Run missing / API vazia | `EmptyState` “run não encontrado” |
| Daemon offline | empty states de projecto / runtime |

### 4.3 Loops

- **Correcção:** `correction_running` no lifecycle; conteúdo em `ReviewCorrectionCard` / `CorrectionLoopCard`.
- **Retry / recovery:** `RetryRecoveryCard`; fases `retry_running`, `recovery_running`, `rollback_running`.
- **Refinamento SPEC:** `refining` → `refinement_ready` → novo ciclo de aprovação.

---

## 5. Agrupamento arquitetural

| Categoria | Cards / blocos |
|-----------|----------------|
| **Interacção humana** | perguntas clarificação; `ApprovalFlow`; aprovação strategy; review execução; controlos de corrida quando expostem POST |
| **Sistema / infra** | empty states conectividade; hints degradados em painéis; marcos `OperationalCheckpointBody` com `actor` sistema/runtime |
| **Execução** | progresso; lista de subtarefas; review/correction/retry; lifecycle badges |
| **Observabilidade** | último evento no focus card; rodapé técnico em marcos; `ExecutionCorrelationStrip`; (futuro) `RunActivityStream` se reintegrado |
| **Revisão** | strategy readiness + riscos; execution review |
| **Resultado** | `RuntimeSummary`; marcos `success`; checkpoint severity success |

---

## 6. Duplicações e sobreposições semânticas

| Fenómeno | Descrição |
|----------|-----------|
| **Dois modos de intake** | Com `showOperationalRibbon`, intake é `MissionWorkspacePhase` + `TaskComposer` **sem** `TaskSubmissionCard`. No fluxo “nova actividade”, o mesmo conceito usa `ExecutionStepBlock` + `TaskComposer` + card de resultado. Risco de **copy e affordances ligeiramente diferentes** para a mesma operação. |
| **“Fase viva” vs `OperationalFocusCard`** | Ambos comunicam “onde estamos”; o primeiro é um passo de timeline; o segundo é um painel persistente. Pode parecer **redundante** ao operador se os textos divergirem. |
| **Headline operacional vs badge de fase** | Ribbon do header + focus card + badges dentro de `RuntimeSummary` — múltiplas superfícies de **estado global**. |
| **`MissionWorkspacePhase` vs `ExecutionStepBlock`** | Dois contentores com bordas semelhantes (cartão); aninhamento conceptual (timeline vs fases) pode confundir hierarquia. |
| **`RunActivityStream` órfão** | Código preparado para “event stream técnico” não visível no `RunViewShell` actual — duplicação potencial com marcos da timeline se ambos listarem eventos. |

---

## 7. Hierarquia visual (actual e recomendada)

| Elemento | Peso actual | Recomendação discovery |
|----------|-------------|-------------------------|
| `OperationalFocusCard` | forte (ring / sidebar-primary) | manter como **âncora cognitiva** quando há atenção humana ou estado crítico |
| `MissionWorkspacePhase` `visualWeight=hero` | máximo na strategy pós-approve | coerente para **CTA de desbloqueio** |
| `MissionWorkspacePhase` `muted` | clarify quando strategy domina | bom padrão de **relegar etapa fechada** |
| `ExecutionStepBlock` active | sombra + barra lateral | adequado para **marco ou fase activa na timeline** |
| Marcos com `checkpointSeverity` | eleva hint a “Atenção” / “Erro” | deve continuar a mapear **severity → prioridade** unificada |
| `RuntimeSummary` | só no sucesso | funciona como **cartão de encerramento**; considerar também em estados terminais não-sucesso no futuro |

---

## 8. Proposta de padronização (sem implementação)

### 8.1 Famílias de componentes

1. **TimelineRow** — `ExecutionStepBlock` + conteúdo variável (checkpoint, evento simples, fase viva).
2. **PhasePanel** — `MissionWorkspacePhase` como invólucro consistente (título + badge de estado + `visualWeight`).
3. **OperationalBanner** — `OperationalFocusCard` (ou futura variante compacta / sticky).
4. **DomainPanel** — scroll interno com `SectionHeader` + grelha de sub-cards (`Surface`, cards específicos).
5. **TerminalState** — `EmptyState` / `LoadingState` com variantes operacionais.

### 8.2 Variantes sugeridas

- **TimelineRow.checkpoint** vs **TimelineRow.live** vs **TimelineRow.intake**.
- **PhasePanel.hitl** (clarify) vs **PhasePanel.plan** (strategy) vs **PhasePanel.run** (execution).
- **SubCard.metric** · **SubCard.list** · **SubCard.form** para reduzir CSS divergente entre strategy e execution.

### 8.3 Composição base

- **Cabeçalho:** título + estado + acções secundárias.
- **Corpo:** conteúdo principal scrollável.
- **Rodapé opcional:** correlacionar / técnico / última actualização.

### 8.4 Escalabilidade

- Tratar eventos de runtime como **fonte de rows** com `id` estável (`act-ev-*`) e copy via `formatRuntimeCheckpoint` — evita proliferar componentes por tipo de evento.
- Manter **fases** como painéis lazy-friendly (já separados por API).
- Introduzir futuramente **agrupadores** (por “tentativa”, por “subtask”, por “sessão LLM”) sem mudar o modelo de dados na UI — apenas projeção.

---

## 9. Problemas actuais (UX / arquitectura de informação)

- **Duas experiências de intake** podem divergir em detalhe e feedback pós-submit.
- **Densidade alta** na zona média: timeline + focus + três fases grandes — risco de fadiga em monitores pequenos.
- **Stream técnico** (`RunActivityStream`) não integrado — operador pode sentir falta de “lista completa de eventos” na coluna central (hoje parcialmente substituída por marcos).
- **Correlação** aponta para outras regiões (timeline direita, painel inferior oculto) — risco de **descontinuidade espacial** (`BottomRuntimePanel` está `hidden` no `AppShell`).
- **Estados `MissionWorkspacePhaseStatus` vs `ExecutionStepSurfaceStatus`** — vocabulários diferentes para “activo” (cognitivamente duplicado).
- **Sucesso sem falha simétrica:** `RuntimeSummary` só no `success`; estados finais de falha/cancelamento podem carecer de **cartão espelho** para fecho narrativo.

---

## 10. Cards e blocos futuros (produto + runtime implícito)

### 10.1 Já anticipados em documentação de roadmap / visão

- **Activity stream** rico na coluna ou tab dedicada (Fase UI-4 / UI-5 do roadmap).
- **Métricas LLM / custo** quando exportados pelo run (Fase UI-7).
- **DAG / grafo** explícito — explicitamente fora do MVP, mas card futuro “Dependency graph”.
- **Controlo HITL completo** quando todos os POSTs estiverem disponíveis.

### 10.2 Implícitos no modelo de execução / orquestração

| Card proposto | Motivo |
|---------------|--------|
| **Streaming de output do agente** | paridade com Cursor/Claude |
| **Alocação de worker / modelo** | observabilidade tipo Vercel/Actions |
| **Patch preview / diff resumido** | confiança antes de merge |
| **Validação semântica / gates de qualidade** | entre subtarefas |
| **Explicação de retry** | “porque voltou a correr” |
| **Escalamento humano** | quando política bloqueia automação |
| **Troca de provider** | custo/latência |
| **Carregamento de contexto / memória** | transparência de RAG |
| **Operações Git / PR** | fecho do loop dev |
| **Agrupamento de timeline** | runs com muitos eventos |
| **Cartão de cancelamento / timeout** | simetria ao sucesso |

---

## 11. Referências de código (mapa rápido)

| Ficheiro | Papel |
|----------|-------|
| `frontend/components/features/run-detail/RunViewShell.tsx` | Composição da coluna central |
| `frontend/components/features/run-detail/MissionWorkspacePhase.tsx` | Invólucro de fases 1–4 |
| `frontend/components/features/execution-timeline/ExecutionStepBlock.tsx` | Invólucro de linhas da timeline |
| `frontend/lib/runtime/adapters/dynamic-activity-steps.ts` | Construção de passos + títulos |
| `frontend/lib/runtime/mission/mission-workflow-stages.ts` | Derivação de estados de fase |
| `frontend/lib/runtime/mission/runtime-workflow-phases.ts` | Vocabulário de fases de domínio |
| `frontend/lib/runtime/adapters/runtime-checkpoint-copy.ts` | Semântica operacional dos marcos |

---

## 12. Conclusão

A coluna central já combina **três linguagens visuais** em simultâneo: (1) timeline de `ExecutionStepBlock`, (2) painel de síntese `OperationalFocusCard`, (3) painéis de fase `MissionWorkspacePhase` com sub-cards densos. Isso cobre bem intake → clarificação → strategy → execução, mas introduz **redundância de “estado actual”** e **dois padrões de intake**. Para evolução, o caminho mais escalável é **unificar a semântica em famílias** (timeline vs phase vs banner), **alinhar estados** entre superfícies, e **reintegrar ou abandonar explicitamente** o stream técnico como camada de observabilidade de segundo plano.
