# Fix — Strategy pending CTA visibility

**Execução:** 2026-05-16T18:02:00 (local)  
**Discovery:** `strategy-pending-no-cta-discovery-20260516-175810.md`  
**Âmbito:** UX pós-approve — tornar «Iniciar estratégia» visível sem expandir manualmente o cartão.

---

## Causa raiz confirmada

O botão POST «Iniciar estratégia» existia em `StrategyStageHero`, mas:

1. Estava dentro de `expandedContent` do cartão «Estratégia» (`ConversationEntry`).
2. `defaultExpanded` exigia `timelinePhase === "current"` — após approve o passo podia aparecer como **future** → cartão colapsado.
3. Auto-scroll em `RunViewShell` usava só `scrollToExecutionAnchor` — **sem expand** nem foco em `[data-runtime-focus="strategy-primary"]`.
4. Badge «Pendente» vinha de `ExecutionStepBlock` quando `surfaceStatus === "pending"`, mascarando handoff humano.

O runtime (`strategy_pending`, `strategy_waiting_user_action`) estava correcto; não houve alteração de backend/API.

---

## Regra de expansão / foco

| Gatilho | Comportamento |
|---------|----------------|
| `dominantStrategyHandoff` passa a `true` (1.ª vez por corrida) | `navigateRuntimeAction("strategy", "scroll_focus")` → `dispatchTimelineExpand` + scroll + foco `strategy-primary` |
| `strategyKickoffUi` no card (`awaitingKickoff` + handoff/pending) | `defaultExpanded: true`, acção «Ir para estratégia» sempre presente |
| Fase semântica `strategy` + kickoff | `op = waiting_user`, `defaultExpanded: true`, CTA «Gerar estratégia» injectado mesmo com surface ainda não «current» |

**Não** dispara POST automático — apenas navegação/expand/foco.

---

## Arquivos alterados

| Arquivo | Mudança |
|---------|---------|
| `frontend/components/features/run-detail/RunViewShell.tsx` | Handoff → `navigateRuntimeAction("strategy")`; passa `strategyBundle` + `dominantStrategyHandoff` ao mapper semântico |
| `frontend/lib/runtime/execution/build-execution-timeline-cards.ts` | `strategyKickoffUi`: expand + «Ir para estratégia» sem exigir `current` |
| `frontend/lib/runtime/execution/semantic-workflow-mapper.ts` | Kickoff strategy: `waiting_user`, `defaultExpanded`, CTA com `strategyKickoff` |
| `frontend/components/features/execution-timeline/ExecutionStepBlock.tsx` | Fase strategy + handoff → badge «AGUARDA SI»; «Pendente» não sobrescreve `waiting_user` |
| `frontend/lib/runtime/mission/mission-workflow-stages.ts` | Fallback `WAITING_USER_ACTION` quando `clarificationApprovedAwaitingStrategy` |
| `frontend/lib/runtime/execution/strategy-pending-cta-visibility.test.ts` | **Novo** — 5 testes unitários |

---

## Testes executados

```bash
cd frontend
npx tsx --test lib/runtime/execution/strategy-pending-cta-visibility.test.ts
# 5/5 pass
```

Cobertura:

- `strategyAwaitingUserKickoff` após approve (`ready_for_execution`)
- Card `strategy_generated` expandido + «Ir para estratégia» com passo `future`
- Cartão semântico: `waiting_user`, `surface active`, `defaultExpanded`, CTA «Gerar estratégia»
- `deriveMissionWorkspaceStatuses` → `WAITING_USER_ACTION`
- Kickoff não fica com `surface pending` no agregado semântico

---

## Validação manual (checklist)

1. [ ] Nova atividade → clarificação → aprovar plano
2. [ ] Logs: `strategy_waiting_user_action` / `strategy_pending`
3. [ ] Tela rola e **expande** cartão «Estratégia» automaticamente
4. [ ] Botão **«Iniciar estratégia»** visível no hero (sem expand manual)
5. [ ] Badge cartão **«AGUARDA SI»** (não só «Pendente»)
6. [ ] Badge etapa MissionWorkspace **«AGUARDA SI»**
7. [ ] Nenhum POST automático antes do clique
8. [ ] Clicar «Iniciar estratégia» → POST `/runs/:runId/strategy` → `strategy_generating`

---

## Limitações / fora de escopo

- Guards de execução (`execution_not_applicable` no painel direito) inalterados.
- Sem refactor global da timeline.
- Sem execução automática da estratégia.

---

## Resultado

Pós-approve, o handoff strategy torna o CTA POST discoverable: expand automático, scroll+foco, badge «AGUARDA SI», e navegação «Ir para estratégia» disponível mesmo quando o passo operacional ainda não é `current`.
