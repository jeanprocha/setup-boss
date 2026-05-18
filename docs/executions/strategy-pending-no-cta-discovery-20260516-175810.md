# Discovery — Strategy pending sem CTA após aprovar plano

**Execução:** 2026-05-16T17:58:10 (local)  
**Âmbito:** Discovery only — sem alterações de código.  
**Contexto utilizador:** Após aprovar plano refinado, logs mostram `strategy waiting user action` / `phase2=ready_for_execution` / `[hitl:approved]`; UI mostra secção «Estratégia» com copy de kickoff, mas sem botão claro «Iniciar estratégia».

**Relacionado:** `runtime-logs-payload-strategy-ux-discovery-20260516-164423.md`, `runtime-logs-cleanup-and-strategy-ux-fix-20260516-174649.md` (Fase C já aplicada parcialmente).

---

## 1. Causa provável (síntese)

O runtime está **correcto**: após approve, a corrida fica em handoff humano para `POST /runs/:runId/strategy` (`strategy_pending`, evento `strategy_waiting_user_action`). O gap é **discoverability do CTA na UI**:

| # | Causa | Impacto |
|---|--------|---------|
| **A** | O único botão **POST** («Iniciar estratégia») vive em `StrategyStageHero`, que só monta com `active={dominantStrategyHandoff}` e fica dentro do **`expandedContent`** do cartão da timeline (expansível). | Utilizador vê summary/highlight no header do cartão, mas o botão só aparece **depois de expandir** a fase «Estratégia». |
| **B** | Badge **«PENDENTE»** no cartão semântico quando `surfaceStatus === "pending"` (`ExecutionStepBlock` L163), frequentemente porque o passo `strategy_generated` ainda não é `timelinePhase === "current"` (primary index / bundles desalinhados) ou agregação semântica devolve `op === "pending"`. | Parece «ainda não chegou aqui», não «a sua vez — clicar». |
| **C** | Auto-scroll pós-handoff em `RunViewShell` usa só `scrollToExecutionAnchor` **sem** `dispatchTimelineExpand` / `navigateRuntimeAction` (que expande + foca `[data-runtime-focus="strategy-primary"]`). | Scroll até ao cartão colapsado; CTA continua invisível. |
| **D** | Acções da timeline («Ir para estratégia» / CTA «Gerar estratégia») só quando `row.timelinePhase === "current"` (`build-execution-timeline-cards.ts` L701–713); CTA semântico só com `surface === "active"` + `waiting_user` (`semantic-workflow-mapper.ts` L449–453). | Com passo «futuro» ou `surface` pending, **nenhum** botão de navegação no header do cartão. |
| **E** (menos frequente) | `useStrategyStageGeneration` pode marcar `strategyArtifactsReady === true` se o probe GET strategy devolver `operationalReadiness` partial/ready + fase `strategy_ready` — hero mostra mensagem verde **sem** botão (`StrategyStageHero.tsx` L73–78). | Falso «já gerado» com kickoff ainda pendente no daemon. |

**Divergência painel direito vs centro:** esperada. `deriveExecuteAvailability` com `summary.phase` em `clarification` devolve `execution_not_applicable` (`orchestration-state.ts` L197–204). O centro fala de **estratégia**; o painel técnico fala de **execução** — fontes diferentes, não bug de runtime.

---

## 2. Estado da estratégia (runtime vs derivados UI)

### 2.1 Runtime / logs

| Sinal | Origem | Significado |
|-------|--------|-------------|
| `strategy_waiting_user_action` | `scripts/daemon/lib/run-clarification.js` `emitStrategyContinuationSignals` | Handoff explícito; hint `POST /runs/:runId/strategy` |
| `runtimePhase: strategy_pending` | Clarificação / session após approve | Não avança sozinho para geração |
| `phase2=ready_for_execution` | Phase2 clarificação | Plano aprovado; próximo passo operacional é strategy |
| `[hitl:approved] Plano aprovado para execução` | Mutação UI / daemon | Gate HITL fechado |

### 2.2 Funções de derivação (frontend)

| Função | Ficheiro | Papel |
|--------|----------|--------|
| `strategyAwaitingUserKickoff(clarification, strategy)` | `strategy-operational-state.ts` | **Verdade** para handoff: `srp === strategy_pending` OU `clarification.session.runtimePhase === strategy_pending` OU (`approval === approved` + phase2 `strategy_pending` \| `ready_for_execution` + `!isStrategyGenerationComplete`) |
| `needsDominantStrategyCta` | `mission-workflow-stages.ts` | Alias de `strategyAwaitingUserKickoff` |
| `dominantStrategyHandoff` | `RunViewShell.tsx` | `useMemo` → alimenta hero, compact clarificação, `defaultExpanded` timeline |
| `deriveMissionWorkspaceStatuses` | `mission-workflow-stages.ts` | Badge MissionWorkspace: `strategy = WAITING_USER_ACTION` se `dominantStrategy \|\| srp === strategy_pending \|\| clarificationStrategyPending` |
| `deriveStrategyOperationalStatus` | `strategy-operational-state.ts` | Pipeline: `strategy_pending` → `waiting_user` |
| `deriveOperationalPrimaryIndex` | `derive-operational-pipeline.ts` | Com clarificação completa → índice **9** (`strategy_generated`); se `strategy_ready`… → **10** |

### 2.3 `StrategyStageHero`

```21:31:frontend/components/features/strategy/StrategyStageHero.tsx
export function StrategyStageHero({ runKey, phase, state, active }: Props) {
  // ...
  if (!active || !runKey) return null;
```

- `active` ← `dominantStrategyHandoff` em `RunViewShell.tsx` L351–355.
- Botão POST: L86–98, `data-runtime-focus="strategy-primary"`.
- Se `gen.strategyArtifactsReady` → **substitui** botão por copy «Estratégia disponível no runtime» (L73–78).

---

## 3. Onde o CTA deveria aparecer (mapa de renderização)

```
RunViewShell
├── dominantStrategyHandoff = strategyAwaitingUserKickoff(...)
├── useEffect → scrollToExecutionAnchor("semantic-phase-strategy")  // SEM expand
├── embeddedSlots["strategy_generated"]
│   └── MissionWorkspacePhase (badge WAITING_USER_ACTION | PENDING)
│       ├── StrategyStageHero  active={dominantStrategyHandoff}  ← ÚNICO POST
│       └── StrategyPanel      (read-model; sem botão kickoff)
└── CentralExecutionTimeline
    └── ExecutionStepBlock (cartão «Estratégia»)
        ├── StepHint → «Pendente» se surfaceStatus pending
        ├── summaryLine / highlights (podem mostrar «Aguarda início» mesmo colapsado)
        └── expandedContent (só se expandido)
            ├── sections + actions timeline
            └── embeddedSlots → MissionWorkspacePhase + Hero
```

| Superfície | CTA POST? | Notas |
|------------|-----------|--------|
| `StrategyStageHero` | **Sim** | Condicionado `active` + não `strategyArtifactsReady` + `runtimeReachable` |
| `StrategyPanel` | Não | Só visualização decomposição/ordering |
| Cartão timeline (header) | Não | «Ir para estratégia» = navigate/scroll (`build-execution-timeline-cards.ts` L701–713) |
| CTA semântico «Gerar estratégia» | Não (scroll) | `semantic-workflow-mapper.ts` + `runtime-translation-layer.ts` STRATEGY_MAP |
| Painel direito «Próxima ação» | Não | `orch.availability.message` → execução, não strategy kickoff |
| `ExecuteRunButton` | Não | Guard de execução, não geração strategy |

---

## 4. Condições que escondem o botão

| Condição | Efeito |
|----------|--------|
| `!dominantStrategyHandoff` | `StrategyStageHero` → `null` (sem hero) |
| `!orch.strategy.applies` | Slot `strategy_generated` não monta (`RunViewShell` L342; `strategyAppliesToRun` exige phase/state compatíveis) |
| `!showOperationalRibbon` | Sem run/summary → sem slots |
| Cartão **colapsado** (`expandable` + `defaultExpanded === false`) | `expandedContent` oculto (`ConversationEntry.tsx` L99–106) — hero dentro do slot |
| `row.timelinePhase !== "current"` | Sem acção «Ir para estratégia»; `defaultExpanded` do card strategy false (`build-execution-timeline-cards.ts` L716–721) |
| `surfaceStatus === "pending"` | `ExecutionStepBlock` força label **«Pendente»** (L163); CTA semântico não injecta (`semantic-workflow-mapper.ts` L449–451) |
| `strategyArtifactsReady` | Hero sem botão, só mensagem verde |
| `!runtimeReachable` | Botão disabled (`StrategyStageHero` L37, L90) |
| `selectedRunId` / bundle desync | Poll atrasado: clarificação ainda `awaiting_approval` → primary index **8**, strategy **future** → badge Pendente + sem acções current |

### 4.1 Copy «PENDENTE» vs «AGUARDA SI»

- **Cartão timeline «PENDENTE»:** `ExecutionStepBlock` + `operationalToSurfaceStatus("pending")` — não é o badge `MissionWorkspacePhase`.
- **Badge etapa «PENDING»:** `deriveMissionWorkspaceStatuses` cai em `PENDING` (L115) se `strategy.applies` mas nem `dominantStrategy` nem `srp === strategy_pending` nem `clarificationStrategyPending` — típico com `srp === "unavailable"` e clarificação ainda sem `strategy_pending` no bundle após approve.
- **Badge «AGUARDA SI»:** `WAITING_USER_ACTION` quando handoff detectado nos bundles.

Utilizador pode ver **simultaneamente** highlight «Aguarda início» (card builder, não gated em `current`) e badge «Pendente» (surface pending).

---

## 5. UX após approve (scroll, colapso, CSS)

| Verificação | Resultado |
|-------------|-----------|
| Auto-scroll para strategy | `RunViewShell.tsx` L130–137 — **só scroll**, sem `SB_RUNTIME_NAV_EVENT` expand |
| `navigateRuntimeAction("strategy")` | `expandTimeline: true` + foco `strategy-primary` (`runtime-action-target.ts` L104–110) — **não** usado no efeito pós-approve |
| `ClarificationPanel` compact | `workflowPostApproveCompact={dominantStrategyHandoff}` colapsa clarificação — OK |
| `RefinedPlanPanel` | Permanece na timeline; empurra strategy para baixo |
| Hero fora do viewport | Provável sem expand; scroll não revela CTA |
| Botão existe mas CSS | Improvável; problema estrutural é **slot dentro de `expandedContent`** |
| Copy «PENDENTE» errada | Sim para acção humana — deveria ser «A sua vez» / `waiting_user` no cartão |

---

## 6. Logs/estado — divergência centro vs painel direito

| Camada | Mensagem típica | Fonte |
|--------|-----------------|--------|
| Daemon / SSE | `strategy waiting user action`, `strategy_pending` | Evento + `runtime.strategy_pending` log |
| Cartão central | «Plano aprovado — inicie a geração…», ESTADO «Aguarda início» | `cardStrategyGenerated` + `strategyAwaitingUserKickoff` |
| Painel direito | «Execução não aplicável nesta fase» | `deriveExecuteAvailability` + `GUARD_MESSAGES.execution_not_applicable` quando `phaseRaw` é intake/clarify/clarification |
| Hint atenção (se montado) | «Depende de si: inicie a geração… (botão na etapa Estratégia)» | `deriveAttentionHint` quando `needsDominantStrategyCta` |

**Conclusão:** não é inconsistência de runtime; são **superfícies com guards diferentes** (strategy kickoff vs execute run).

---

## 7. Onde corrigir (ficheiros / condição)

| Prioridade | Ficheiro | Alteração sugerida |
|------------|----------|-------------------|
| P0 | `RunViewShell.tsx` L130–137 | Pós-handoff: usar `navigateRuntimeAction("strategy", "scroll_focus")` em vez de só `scrollToExecutionAnchor` |
| P0 | `build-execution-timeline-cards.ts` + `semantic-workflow-mapper.ts` | Forçar `defaultExpanded: true` quando `awaitingKickoff` (mesmo se passo ainda não `current`); ou `expandable: false` na fase strategy em handoff |
| P1 | `ExecutionStepBlock.tsx` L163 | Não mapear `pending` → «Pendente» quando `operationalStatus === waiting_user` |
| P1 | `derive-operational-pipeline.ts` / primary index | Garantir `strategy_generated` **current** assim que `strategyAwaitingUserKickoff` (evitar future + Pendente) |
| P1 | `build-execution-timeline-cards.ts` L701–713 | Acção «Ir para estratégia» quando `awaitingKickoff` **independente** de `timelinePhase === "current"` |
| P2 | `StrategyStageHero.tsx` | Banner/sticky com botão quando `strategyArtifactsReady` falso mas kickoff true; ou duplicar CTA no summary do cartão (POST, não só scroll) |
| P2 | `mission-workflow-stages.ts` | Se `needsDominantStrategyCta` → sempre `WAITING_USER_ACTION` (mesmo `srp === unavailable`) |
| P2 | `RuntimeObservabilityTechnical.tsx` | Próxima acção: hint strategy quando `strategyAwaitingUserKickoff`, não só `availability.message` de execução |

---

## 8. Plano cirúrgico (implementação futura)

### Fase 1 — Visibilidade imediata do CTA (~30–50 LOC)

1. Expand + foco no handoff (`RunViewShell` → `navigateRuntimeAction`).
2. `defaultExpanded` true para cartão strategy quando `dominantStrategyHandoff || awaitingKickoff`.
3. Corrigir badge «Pendente» para fases `waiting_user` no cartão.

### Fase 2 — Acções timeline (~20 LOC)

4. «Ir para estratégia» sempre que `awaitingKickoff`.
5. Alinhar copy secção expandida (já aponta para hero; garantir expand).

### Fase 3 — Resiliência bundles (~40 LOC)

6. `deriveMissionWorkspaceStatuses`: `WAITING_USER_ACTION` ligado a `needsDominantStrategyCta` apenas.
7. Revisar `isStrategyGenerationComplete` vs `strategy_pending` no probe (evitar esconder botão).

### Fase 4 — Observabilidade copy (opcional)

8. Linha «Próxima ação» no painel técnico: ramo strategy kickoff quando aplicável.

---

## 9. Testes recomendados

| # | Tipo | Caso |
|---|------|------|
| 1 | Unit | `strategyAwaitingUserKickoff`: clarificação `ready_for_execution` + approved + strategy null → `true` |
| 2 | Unit | `strategyAwaitingUserKickoff`: strategy `strategy_ready` + partial readiness → `false` e hero não esconde POST indevidamente |
| 3 | Unit | `deriveMissionWorkspaceStatuses`: `needsDominantStrategyCta` + `srp unavailable` → `WAITING_USER_ACTION` |
| 4 | Unit | `aggregateGroupOperationalStatus` + primary 9: strategy card não `pending` quando kickoff |
| 5 | Component | `StrategyStageHero` com `active=true` renderiza botão; `strategyArtifactsReady` controla visibilidade |
| 6 | Integration | Approve plano → um frame com bundles mock atrasados → CTA ainda visível após Fase 1 |
| 7 | E2E | Fluxo existente `p1e-human-e2e-live-smoke.js`: approve → click «Iniciar estratégia» → POST strategy |

---

## 10. Validação manual

1. Corrida em clarificação → responder → aprovar plano refinado.
2. Confirmar logs: `strategy_waiting_user_action`, `runtimePhase=strategy_pending`.
3. **Sem expandir nada:** procurar botão «Iniciar estratégia» — hoje **deve falhar** (confirma bug).
4. Expandir cartão «Estratégia» na timeline central → botão deve aparecer no hero (se `dominantStrategyHandoff`).
5. Clicar «Ir para estratégia» (se visível) → cartão expande + scroll + foco no botão.
6. Painel direito: «Execução não aplicável» é esperado; verificar se hint global / atenção menciona strategy.
7. Após POST strategy → fase `strategy_generating` → badge RUNNING / copy «A gerar…».

---

## 11. Investigação executada (comandos / leitura)

```text
Grep: strategyAwaitingUserKickoff, needsDominantStrategyCta, StrategyStageHero, strategy_pending
Read: RunViewShell.tsx, StrategyStageHero.tsx, strategy-operational-state.ts
Read: mission-workflow-stages.ts, build-execution-timeline-cards.ts (cardStrategyGenerated)
Read: semantic-workflow-mapper.ts, derive-operational-pipeline.ts
Read: ExecutionStepBlock.tsx, ConversationEntry.tsx, orchestration-state.ts
Read: runtime-action-navigation.ts, runtime-action-target.ts
Read: run-clarification.js (emitStrategyContinuationSignals)
Cross-ref: runtime-logs-cleanup-and-strategy-ux-fix-20260516-174649.md (Fase C já mergeada)
```

---

## 12. Resultado

| Pergunta | Resposta |
|----------|----------|
| O sistema devia executar sozinho? | **Não** — handoff `strategy_pending` é intencional. |
| Falta CTA? | Falta CTA **visível sem expandir**; POST existe em `StrategyStageHero` condicionado. |
| Causa #1 | Hero dentro de `expandedContent` + cartão frequentemente colapsado / badge «Pendente». |
| Causa #2 | Auto-scroll pós-approve não expande o cartão nem foca o botão. |
| Divergência painel direito | Guard de **execução** vs fase **clarification** — não contradiz centro. |

**Próximo passo sugerido:** Fase 1 do plano cirúrgico (expand no handoff + `defaultExpanded` + badge cartão).
