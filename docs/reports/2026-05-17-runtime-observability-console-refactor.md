# Runtime observability — refactor console logs

**Data:** 2026-05-17  
**Escopo:** painel direito Observabilidade (sub-abas + Logs do runtime).

---

## Arquitetura da normalização

1. **Camada existente** (`normalize-runtime-log-for-ui.ts`): classifica `uiTier`, compacta mensagens técnicas, omite payloads grandes com tamanho em KB/B.
2. **Nova camada** (`runtime-log-entry-view-model.ts`): produz `RuntimeLogEntryViewModel` com `stepTitle`, `shortMessage`, `details.json`, `rawEvent`, `icon`, `expandable`.
3. **UI** (`RuntimeConsoleLogRow`): consome apenas o view model; expand/collapse local por linha.

Fontes unificadas: eventos SSE/API (`RuntimeEventDto`), entradas daemon (`ObservabilityDaemonLogEntryDto`), diagnósticos UI (`ui-diagnostics-store`).

Dedupe: `runtimeLogDedupeKey` (id estável ou chave composta).  
Agrupamento: `groupRepeatedRuntimeLogEntries` para eventos consecutivos `noise`/`technical` com mesma `groupKey`.

---

## Modelo `RuntimeLogEntryViewModel`

Ver `docs/runtime-observability-console-phase.md`.

Campos mínimos exigidos pelo spec: **id, level, category, stepTitle, shortMessage, timestamp, details, rawEvent, expandable** — mais metadados de apresentação (`icon`, `uiTier`, `groupedCount`, `clockLabel`).

---

## Ficheiros alterados

| Ficheiro | Alteração |
|----------|-----------|
| `frontend/lib/runtime/observability/runtime-log-entry-view-model.ts` | **novo** — view model + builders + agrupamento |
| `frontend/lib/runtime/observability/runtime-log-entry-view-model.test.ts` | **novo** — testes unitários |
| `frontend/lib/runtime/observability/normalize-runtime-log-for-ui.ts` | texto payload omitido `Payload técnico grande (N KB)` |
| `frontend/lib/runtime/observability/normalize-runtime-log-for-ui.test.ts` | assert actualizado |
| `frontend/components/features/observability/RuntimeConsoleLogRow.tsx` | **novo** — linha estilo console |
| `frontend/components/features/observability/RuntimeObservabilityLogs.tsx` | refatorado para view model + rows memoizados |
| `frontend/components/features/execution-timeline/RightTimelinePanel.tsx` | removida sub-aba Timeline |
| `frontend/locales/pt-BR.ts`, `frontend/locales/en.ts` | `logsDetailTruncated` |

**Não removidos (legado/reuso):** `RunOperationalTimelinePanel.tsx`, `derive-run-operational-timeline.ts`, `use-run-operational-timeline.ts`.

---

## Melhorias UX

- Formato de linha: **ícone + passo + mensagem curta + hora + [+]**
- JSON estruturado ao expandir (`runId`, `phase`, `payload`, `metadata`, `stack` quando existir)
- Menos ruído: opacidade em debug/heartbeat; agrupamento `×N` em repetições técnicas
- Scroll: auto-scroll apenas quando entram linhas novas (não em cada refetch SSE)
- Expansão isolada por row (sem `expanded` global no pai)

---

## Compatibilidade mantida

- Ingestão SSE + bundle observability (`useRunEvents`, `useRunObservabilityBundle`)
- Filtros nível/categoria/pesquisa, agrupar por minuto, copiar, limpar vista, pausar scroll
- Eventos antigos: builders aceitam payload/metadata opcionais
- Pré-run / sem run: cartões diagnóstico + linhas UI no mesmo formato console

---

## Validações

| Item | Estado |
|------|--------|
| Logs via SSE | Mantido (`useRunEvents`) |
| Expansão | Estado local em `RuntimeConsoleLogRow` |
| Scroll não reseta em refetch | Auto-scroll só se `filtered.length` aumentar |
| Lista sem flicker de expansão | Expansão fora do map pai |
| Payload grande | Cap JSON 48k no painel + label KB na linha |
| Testes unitários view model / normalize | Ficheiros `.test.ts` adicionados/actualizados |
| Typecheck linha logs | `events.map((ev) => build…)` corrige overload `.map` |

Validação manual recomendada: abrir Observabilidade → Logs com run activo, expandir estratégia/Git/erro, pausar scroll, filtrar `strategy` + `ERROR`.

---

## Limitações restantes

- Sem virtualização de lista (não existia antes; janela limitada a 500 entradas)
- `RunOperationalTimelinePanel` ainda no repositório mas não exposto na UI
- Humanização de `stepTitle` heurística (tabela strategy + regex por categoria); eventos muito custom podem cair no fallback capitalizado
- Detalhe truncado no painel (>48k chars) — export completo não implementado nesta fase
- Agrupamento só para tiers `noise`/`technical` consecutivos
