# Fix — Strategy CTA action real

**Execução:** 2026-05-16T19:15:00 (local)  
**Âmbito:** Botão «Ir para estratégia» dentro do cartão Estratégia passa a iniciar strategy (POST) em vez de scroll inútil.

---

## Causa raiz

Após approve, o cartão Estratégia (`strategy_generated`) expandido com slot embutido (`StrategyStageHero`) expunha a acção **«Ir para estratégia»** com `intent: "navigate"` / `scroll_focus` em `build-execution-timeline-cards.ts` e, no agregado semântico, **«Gerar estratégia»** (também navigate via `humanCtaToTimelineAction`).

Dentro do próprio cartão, scroll para `strategy` não acrescenta valor — o utilizador clica nesse botão e nada inicia no runtime. O POST real existia só no `StrategyStageHero`, mas o CTA visível no topo do `expandedSlot` era o de navegação.

---

## Comportamento antes / depois

| Contexto | Antes | Depois |
|----------|-------|--------|
| Cartão Estratégia + slot + `strategy_pending` | «Ir para estratégia» → scroll | «Iniciar estratégia» → POST `/runs/:runId/strategy` |
| Cartão sem slot embutido | «Ir para estratégia» → scroll | Igual (scroll) |
| Agregado semântico com slot | «Gerar estratégia» navigate injectado | «Iniciar estratégia» `strategy_kickoff`; sem navigate strategy duplicado |
| `StrategyStageHero` com handoff activo | Botão grande POST | Botão oculto (`suppressKickoffButton`); loading inline no timeline |
| Arranque automático | Não | Não |

---

## Arquivos alterados

| Arquivo | Mudança |
|---------|---------|
| `frontend/lib/runtime/execution/execution-timeline-card-types.ts` | Novo intent `strategy_kickoff` |
| `frontend/lib/runtime/execution/build-execution-timeline-cards.ts` | Slot → `Iniciar estratégia` + kickoff; sem slot → navigate |
| `frontend/lib/runtime/execution/semantic-workflow-mapper.ts` | Com slot + kickoff, filtra CTAs navigate para `strategy` |
| `frontend/components/features/execution-timeline/StrategyKickoffTimelineAction.tsx` | **Novo** — botão POST + loading + erro inline |
| `frontend/components/features/execution-timeline/CentralExecutionTimeline.tsx` | Renderiza `strategy_kickoff`; props `runKey`, `strategyKickoffEnabled` |
| `frontend/components/features/run-detail/RunViewShell.tsx` | Liga timeline ao run; `suppressKickoffButton` no hero |
| `frontend/components/features/strategy/StrategyStageHero.tsx` | `suppressKickoffButton` evita CTA duplicado |
| `frontend/lib/runtime/execution/strategy-pending-cta-visibility.test.ts` | 6 testes (incl. scroll só sem slot) |

---

## Testes executados

```bash
cd frontend
npx tsx --test lib/runtime/execution/strategy-pending-cta-visibility.test.ts
# 6/6 pass
```

---

## Validação manual (checklist)

1. [ ] Aprovar plano → runtime `strategy_pending`
2. [ ] Cartão Estratégia expandido, badge «AGUARDA SI»
3. [ ] Botão no cartão: **«Iniciar estratégia»** (não «Ir para estratégia»)
4. [ ] Clicar → POST `/runs/:runId/strategy` (Network)
5. [ ] Estado → `strategy_generating`
6. [ ] Sem POST antes do clique
7. [ ] Em passo lateral sem slot: «Ir para estratégia» só faz scroll

---

## Fora de escopo (respeitado)

- Sem execução automática
- Sem refactor timeline global
- Sem mudança backend/guards
