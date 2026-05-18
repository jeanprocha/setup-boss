# Relatório — Active Step Banner Phase UX-B

**Data:** 2026-05-17  
**Tipo:** append-only (execução Cursor)

---

## Resumo

Banner operacional dominante no `RunViewShell`, alimentado por `useRunUxState` (UX-A) e `deriveAttentionHint` para ações humanas. Cinco variantes visuais com prioridade determinística. Timeline, observabilidade e backend intactos.

---

## Arquivos criados

| Arquivo |
|---------|
| `frontend/components/features/run-detail/ActiveStepBanner.tsx` |
| `frontend/lib/runtime/ux/resolve-active-step-banner-view.ts` |
| `frontend/lib/runtime/ux/resolve-active-step-banner-view.test.ts` |
| `docs/runtime-active-step-banner-phaseUX-B.md` |
| `docs/reports/2026-05-17-runtime-active-step-banner-phaseUX-B.md` |

## Arquivos alterados

| Arquivo | Alteração |
|---------|-----------|
| `frontend/components/features/run-detail/RunViewShell.tsx` | `useRunUxState` + `ActiveStepBanner` após workflow strip |
| `package.json` | Teste UX-B no script `npm test` |

---

## Estados implementados

| Variante | Condição | Headline exemplo |
|----------|----------|------------------|
| `running` | `status === running` e não stall | Headline do `RunUxState` |
| `waiting_user_action` | `hasHumanAction` ou status waiting | Ação necessária |
| `stalled` | `isStalled && running` | Ainda processando… |
| `completed` | `status === completed` | Execução concluída |
| `failed` | `status === failed` | Execução falhou |

Badge de etapa: Intake, Clarificação, Planeamento, Aprovação, Git, Estratégia, Execução, Revisão, Correção.

---

## Decisões UX

1. **Prioridade única** — failed > completed > waiting > stalled > running (stall nunca mascarado como erro).
2. **`deriveAttentionHint` reutilizado** — detalhe de waiting sem duplicar regras de clarificação/git/strategy.
3. **`React.memo` no banner** — reduz re-renders quando props estáveis.
4. **Visível só com `showOperationalRibbon`** — não aparece em intake vazio / nova atividade sem run.
5. **Workspace** — sem UX dedicada; eventos workspace continuam a alimentar `useRunUxState` via eventos mergeados.

---

## Validações

```bash
node --experimental-strip-types --test frontend/lib/runtime/ux/resolve-active-step-banner-view.test.ts
```

**Resultado:** 26/26 testes UX-A+UX-B passaram (incl. 6 da resolução visual).

Cenários cobertos por testes: running, waiting+hint, stall, waiting>stall, completed, failed, git label.

Validação manual recomendada (dev:stack): clarification, approval, strategy, execution, stall (>90s), completed, failed.

---

## Limitações restantes

- Sem animações além de `animate-spin` no ícone running.
- Stall genérico (não distingue LLM vs filesystem).
- Banner não substitui workflow strip nem timeline.
- Feed semântico / debug console — fases UX-D+.

---

## Próximos passos

- UX-C: timeline com checkpoints fixos
- UX-D: Activity Feed vs Debug Console
- Opcional: esconder banner em estado default “A aguardar eventos” até primeiro evento real
