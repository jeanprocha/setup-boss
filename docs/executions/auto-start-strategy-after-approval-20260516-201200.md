# Fix — Auto-start strategy after plan approval

**Execução:** 2026-05-16T20:12:00 (local)  
**Decisão de produto:** Aprovar plano → gerar estratégia automaticamente (sem segundo clique).

---

## Causa do handoff desnecessário

O runtime já transitava para `strategy_pending` após approve, mas o produto exigia POST explícito (`strategy_waiting_user_action` + CTAs «Iniciar estratégia»). O `emitStrategyContinuationSignals` só emitia evento/hint — não chamava `triggerStrategyRun`.

---

## Regra nova

| Momento | Comportamento |
|---------|----------------|
| POST approve OK (backend) | `autoStartStrategyAfterApproval` → `triggerStrategyRun` (idempotente) |
| Log | `strategy_auto_started_after_approval` |
| Falha auto-start | `strategy_auto_start_failed` — approve mantém-se OK |
| UI pós-approve | «A gerar estratégia…», badge RUNNING, sem «Aguarda início» |
| Reload sem approve | **Não** dispara POST (só no fluxo approve) |
| `strategy_failed` | CTA «Tentar gerar estratégia novamente» (retry manual) |
| Execute | Inalterado — não auto-dispara |

---

## Arquivos alterados

| Arquivo | Mudança |
|---------|---------|
| `scripts/daemon/lib/run-clarification.js` | `autoStartStrategyAfterApproval` substitui handoff passivo |
| `frontend/lib/runtime/strategy/strategy-auto-start-policy.ts` | **Novo** — política auto-start vs retry |
| `frontend/lib/runtime/strategy/strategy-operational-state.ts` | Kickoff manual só em `strategy_failed` |
| `frontend/lib/runtime/execution/build-execution-timeline-cards.ts` | UX «A gerar»; retry só em falha |
| `frontend/lib/runtime/execution/semantic-workflow-mapper.ts` | Strategy `running` durante auto-start |
| `frontend/lib/runtime/mission/mission-workflow-stages.ts` | RUNNING em vez de WAITING_USER_ACTION |
| `frontend/components/features/strategy/StrategyStageHero.tsx` | Auto-start spinner; retry em falha |
| `frontend/components/features/run-detail/RunViewShell.tsx` | Props autoStartMode / needsRetry |
| `frontend/components/features/clarification/RefinedPlanPanel.tsx` | Mensagem pós-approve |
| `frontend/hooks/use-clarification-mutations.ts` | Audit «a gerar estratégia automaticamente» |
| `frontend/lib/runtime/strategy/strategy-auto-start-policy.test.ts` | **Novo** — 3 testes |
| `frontend/lib/runtime/execution/strategy-pending-cta-visibility.test.ts` | Atualizado — 6 testes |

---

## Testes executados

```bash
cd frontend
npx tsx --test lib/runtime/strategy/strategy-auto-start-policy.test.ts lib/runtime/execution/strategy-pending-cta-visibility.test.ts
# 9/9 pass
```

---

## Validação manual

1. [ ] Nova atividade → clarificação → aprovar plano
2. [ ] Network: POST approve + POST `/runs/:runId/strategy` (no mesmo fluxo backend)
3. [ ] Log: `strategy_auto_started_after_approval`
4. [ ] UI: «A gerar estratégia…» — sem «Iniciar estratégia» / «Aguarda início»
5. [ ] Estado → `strategy_generating` / `strategy_ready`
6. [ ] Reload da página **sem** novo approve → sem POST strategy extra
7. [ ] Execute continua a exigir acção própria

---

## Fora de escopo (respeitado)

- Sem auto-execução da tarefa final
- Sem refactor grande da timeline
- Sem mudanças `.IA` / guards de execute
