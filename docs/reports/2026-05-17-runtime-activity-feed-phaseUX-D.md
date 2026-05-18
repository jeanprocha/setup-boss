# Relatório — Runtime Activity Feed Phase UX-D

**Data:** 2026-05-17  
**Tipo:** append-only (execução Cursor)

---

## Resumo

Separação da aba Observabilidade em **Atividade** (feed humano semântico) e **Debug técnico** (logs brutos + painel técnico reutilizado). Classificação pura `operational | technical | hidden` sem apagar eventos do runtime.

---

## Classificação de eventos

| Visibilidade | Critério |
|--------------|----------|
| **operational** | `kind` operacional (intake…knowledge, workspace importante), fase ≠ info, payload ≤12KB |
| **technical** | system/unknown, governance, daemon, `runtime.*`, diagnósticos |
| **hidden** | scheduler_tick, worker_idle, workspace_run_sync.tick/summary, heartbeat, job_available, etc. |

Funções: `classifyRuntimeEventVisibility`, `filterOperationalUxEvents`, `isHiddenRawEventType`.

---

## Arquivos criados

| Arquivo |
|---------|
| `frontend/lib/runtime/ux/classify-runtime-event-visibility.ts` |
| `frontend/lib/runtime/ux/classify-runtime-event-visibility.test.ts` |
| `frontend/lib/runtime/ux/build-runtime-activity-feed.ts` |
| `frontend/lib/runtime/ux/build-runtime-activity-feed.test.ts` |
| `frontend/components/features/run-detail/RuntimeActivityFeed.tsx` |
| `frontend/components/features/run-detail/TechnicalDebugConsole.tsx` |
| `docs/runtime-activity-feed-phaseUX-D.md` |
| `docs/reports/2026-05-17-runtime-activity-feed-phaseUX-D.md` |

## Arquivos alterados

| Arquivo | Alteração |
|---------|-----------|
| `frontend/components/features/execution-timeline/RightTimelinePanel.tsx` | Tabs Atividade / Debug técnico |
| `frontend/locales/pt-BR.ts`, `en.ts` | `activityTab`, `debugTab`, hints do feed |
| `package.json` | Testes UX-D em `npm test` |

---

## Separação operacional / técnica

- **Atividade:** `normalizeRuntimeUxEvents` → `buildRuntimeActivityFeed` → lista com ícone, título, mensagem, hora, expansão JSON.
- **Debug:** `RuntimeObservabilityLogs` + `RuntimeObservabilityTechnical` (comportamento anterior preservado).

---

## Noise reduction aplicada

Feed humano não mostra: worker_idle/busy, sync.tick/summary/backoff, scheduler, maintenance, payloads enormes, clarification_initialized, output_dir_resolved.

Debug mantém **todos** os logs da implementação anterior.

---

## Decisões UX

1. Sub-tabs internas no debug (Logs / Execução técnica) — mínima mudança.
2. Auto-scroll no feed só se utilizador perto do fundo — evita reset de scroll.
3. Dedupe feed por `type+minuto` — reduz duplicatas SSE.
4. Limite 120 itens no feed — performance.

---

## Validações

**8/8** testes unitários passaram (classify + build feed).

Manual recomendado: clarification → approval → strategy → execution; confirmar ruído só no debug; expansão JSON; SSE em tempo real.

---

## Limitações restantes

- Feed e debug usam `useRunEvents` em paralelo (normalização duplicada).
- Classificação heurística — alguns eventos limítrofes podem mudar de bucket.
- Debug ainda mistura categorias no toolbar antigo (filtros por categoria).
- Sem virtualização dedicada no feed (lista ≤120).
- Replay/persistência fora de escopo.

---

## Próximos passos

- Unificar hook `useRunUxPipeline` (events + ux + timeline + feed)
- Filtro “mostrar hidden” opcional no debug
- Collapse workflow strip quando feed estiver estável
