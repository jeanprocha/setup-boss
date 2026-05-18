# Relatório — Execution Timeline Phase UX-C

**Data:** 2026-05-17  
**Tipo:** append-only (execução Cursor)

---

## Resumo

Timeline operacional por 11 checkpoints fixos, derivada de `RuntimeUxEvent[]` + `RunUxState`, renderizada em `ExecutionTimelineView` abaixo do `ActiveStepBanner`. Timeline central, observabilidade e backend intactos.

---

## Arquivos criados

| Arquivo |
|---------|
| `frontend/lib/runtime/ux/derive-execution-timeline.ts` |
| `frontend/lib/runtime/ux/derive-execution-timeline.test.ts` |
| `frontend/components/features/run-detail/ExecutionTimelineView.tsx` |
| `docs/runtime-execution-timeline-phaseUX-C.md` |
| `docs/reports/2026-05-17-runtime-execution-timeline-phaseUX-C.md` |

## Arquivos alterados

| Arquivo | Alteração |
|---------|-----------|
| `frontend/components/features/run-detail/RunViewShell.tsx` | `deriveExecutionTimeline` + `ExecutionTimelineView` |
| `package.json` | Teste UX-C em `npm test` |

---

## Modelo de checkpoints

Ordem fixa em `EXECUTION_TIMELINE_CHECKPOINT_ORDER`. Cada checkpoint agrega sinais dos eventos por `kind` (workspace → execução). Resolução de status: **failed → completed → waiting → active → skipped → pending**.

Casos especiais:
- `strategy_completed` + `skipped: true` → `completed` com mensagem humana
- `git_branch_prepared` → `completed` na etapa Git
- `completed` (checkpoint final) → `completed` só quando `ux.status === completed`

---

## Decisões UX

1. **Checklist vertical compacto** — estilo CI, sem percentagem.
2. **11 etapas sempre visíveis** — pending explícito para etapas futuras.
3. **`completed` vence `waiting`** — evita aprovação ficar presa em waiting após approve.
4. **Workflow strip mantido** — duplicidade mínima; banner + pipeline resumido acima da timeline central.
5. **Ícone spinner só em `active`** — sem animações complexas.

---

## Validações

```bash
node --experimental-strip-types --test frontend/lib/runtime/ux/derive-execution-timeline.test.ts
```

**12/12** testes passaram.

Cenários: intake active, clarification waiting, plan completed, approval waiting/completed, git, strategy skipped, execution active, completed terminal, strategy failed.

---

## Limitações

- Correção/review opcionais permanecem `pending` até evento.
- Git `pending` até `git_branch_prepared` (sem inferência de skip).
- Conhecimento só avança com eventos `knowledge`.
- Normalização duplicada (`useRunUxState` + `RunViewShell`) — aceitável nesta fase.
- Não substitui `CentralExecutionTimeline` nem observabilidade.

---

## Próximos passos

- UX-D: Activity Feed vs Debug Console
- Colapsar workflow strip quando pipeline UX estiver estável
- Hook `useExecutionTimeline` partilhado para evitar double normalize
