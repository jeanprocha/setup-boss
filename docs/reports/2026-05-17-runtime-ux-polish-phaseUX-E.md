# Relatório — Runtime UX Polish (Phase UX-E)

**Data:** 2026-05-17  
**Execução:** Cursor (append-only)

## Resumo

Polish final da UX operacional do Mission Control: uma timeline/checkpoint dominante, banner de estado ativo, feed humano sem ruído e detalhe técnico recolhido por defeito.

## Duplicidades removidas

| Elemento | Decisão |
|----------|---------|
| `ProjectRunWorkflowStatusStrip` | Removido do `RunViewShell` (competia com `ExecutionTimelineView`) |
| `CentralExecutionTimeline` | Mantido para dados/painéis; envolvido em `OperationalDetailCollapse` (fechado por defeito) |
| Banner + timeline | Agrupados num único card com hierarquia visual |

## Labels ajustados

- `humanize-runtime-copy.ts`: sanitização de `skipped=`, `governance.*`, `runtime.*`, truncagem > 140 chars.
- `normalize-runtime-event.ts`: títulos/mensagens passam por `sanitizeHuman*`; fallback sem `Evento: type`.
- `strategy_completed` skipped: título «Estratégia concluída», mensagem humana.
- Timeline: checkpoints `pending` sem mensagem genérica repetida; rótulo «Progresso da corrida».
- Estado inicial (`derive-run-ux-state`): «A iniciar execução» / «A recolher o primeiro progresso…».

## Noise reduction

- Padrões `workspace_run_sync.*`, `stream-*`, `sse_*`, jobs de fila → `hidden`.
- Governance, output dir, preflight, payloads grandes → `technical` (Debug).
- Feed filtra linhas só com título técnico sem mensagem humana.

## Decisões UX

1. **Não apagar eventos** — só roteamento `operational | technical | hidden`.
2. **Detalhe técnico opt-in** — utilizador expande «Detalhe técnico da execução» para cards/painéis legados.
3. **Estados vazios não são erro** — copy distingue offline, SSE, corrida nova e espera HITL.
4. **Expand no feed** — JSON bruto só ao expandir linha (debug pontual).

## Arquivos alterados

- `frontend/components/features/run-detail/RunViewShell.tsx`
- `frontend/components/features/run-detail/OperationalDetailCollapse.tsx` (novo)
- `frontend/components/features/run-detail/ActiveStepBanner.tsx`
- `frontend/components/features/run-detail/ExecutionTimelineView.tsx`
- `frontend/components/features/run-detail/RuntimeActivityFeed.tsx`
- `frontend/lib/runtime/ux/humanize-runtime-copy.ts` (novo)
- `frontend/lib/runtime/ux/humanize-runtime-copy.test.ts` (novo)
- `frontend/lib/runtime/ux/normalize-runtime-event.ts`
- `frontend/lib/runtime/ux/classify-runtime-event-visibility.ts`
- `frontend/lib/runtime/ux/build-runtime-activity-feed.ts`
- `frontend/lib/runtime/ux/derive-execution-timeline.ts`
- `frontend/lib/runtime/ux/derive-run-ux-state.ts`
- `frontend/locales/pt-BR.ts`, `frontend/locales/en.ts`
- `docs/runtime-ux-polish-phaseUX-E.md`

## Validações

| Verificação | Resultado |
|-------------|-----------|
| Testes UX (`frontend/lib/runtime/ux/*.test.ts`) | **50/50** pass |
| Linter nos ficheiros editados | Sem erros reportados |
| Fluxo manual completo (criar run → conclusão) | Pendente validação humana com `npm run dev:stack` |

## Limitações restantes

- `ProjectRunWorkflowStatusStrip` permanece no código (pode ser reutilizado noutro contexto); não renderizado na coluna central.
- Normalização duplicada em vários hooks (`useRunUxState`, feed, timeline) — melhoria futura: hook unificado.
- Validação manual do fluxo ponta-a-ponta não executada nesta sessão automatizada.
- Sem filtros avançados nem replay persistente (fora de escopo).

## Próximo passo sugerido

Validar manualmente no stack local: progresso contínuo, ausência de flicker, feed limpo e Debug com eventos completos.
