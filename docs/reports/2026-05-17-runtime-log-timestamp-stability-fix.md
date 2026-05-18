# Runtime logs — estabilidade de timestamps no painel

**Data:** 2026-05-17  
**Escopo:** Observabilidade → Logs do runtime (frontend apenas).

---

## Causa raiz

Dois mecanismos faziam o relógio visual (`clockLabel` / `timestamp`) mudar para **todos** ou **muitos** itens quando chegava um evento SSE ou um novo poll do bundle de observabilidade:

1. **`fallbackTs` global em `RuntimeObservabilityLogs`**  
   O `useMemo` da lista usava `obsQ.dataUpdatedAt` (hora do último refetch do `useRunObservabilityBundle`) como fallback para entradas daemon sem `tsIso`. Cada invalidação SSE → refetch → **novo instante único** aplicado a **todas** as linhas daemon ainda sem timestamp parseado no tail.

2. **`groupRepeatedRuntimeLogEntries` sobrescrevia o horário do grupo**  
   Ao fundir ruído/técnico consecutivo, `last.timestamp` e `last.clockLabel` passavam para o evento **mais recente** do grupo. Novos ticks ruído atualizavam o relógio de linhas já visíveis.

Secundário: `daemonEntryToNormalizedInput` chamava `new Date().toISOString()` em cada rebuild (só normalização, mas reforçava o padrão de “hora volátil”).

Eventos SSE/API com `tsIso` válido já eram estáveis na origem; o sintoma “tudo no mesmo instante” aparecia sobretudo com **muitas linhas daemon** e/ou **grupos de ruído** após cada refresh.

---

## Ficheiros alterados

| Ficheiro | Alteração |
|----------|-----------|
| `frontend/components/features/observability/RuntimeObservabilityLogs.tsx` | Remove `fallbackTs` ligado a `dataUpdatedAt`; remove dependência `obsQ.dataUpdatedAt` do `useMemo` |
| `frontend/stores/runtime-observability-logs-store.ts` | Fixa `tsIso` na **primeira ingestão** por `id`; não reescreve em polls seguintes |
| `frontend/lib/runtime/observability/runtime-log-entry-view-model.ts` | Agrupamento preserva timestamp/relógio da **primeira** linha do grupo; `buildRuntimeLogEntryFromDaemon` sem fallback volátil |
| `frontend/lib/runtime/observability/normalize-runtime-log-for-ui.ts` | `daemonEntryToNormalizedInput` deixa de usar `Date.now()` |
| `frontend/lib/runtime/observability/runtime-log-entry-view-model.test.ts` | Assert de timestamp estável no agrupamento + rebuild |
| `frontend/stores/runtime-observability-logs-store.test.ts` | **novo** — ingestão estável de `tsIso` |

**Preservado:** `RuntimeLogEntryViewModel`, `RuntimeConsoleLogRow`, pipeline SSE/backend.

---

## Correção aplicada

- **Daemon:** `tsIso` imutável após primeira ingestão no store (`tsIso ?? new Date().toISOString()` uma vez). Polls posteriores com o mesmo `id` não alteram o horário.
- **Lista:** rebuild da lista deixa de depender de `dataUpdatedAt`; daemon usa só `d.tsIso` do store (fallback epoch só se ainda ausente).
- **Agrupamento:** incrementa `groupedCount` sem tocar em `timestamp` / `clockLabel` da linha já renderizada.
- **Eventos:** continuam a usar `ev.tsIso` + `formatLogClockShort` no build (imutável por evento).

---

## Validações executadas

| Validação | Resultado |
|-----------|-----------|
| `node --test frontend/stores/runtime-observability-logs-store.test.ts` | OK — `tsIso` fixo após segundo poll com timestamp diferente |
| Lint nos ficheiros tocados | Sem erros |
| Testes `runtime-log-entry-view-model.test.ts` via `node --test` directo | Falha por alias `@/` (limitação pré-existente do runner; testes incluídos no script `npm test` do monorepo) |

**Manual recomendado:** com runtime online, abrir Logs do runtime, anotar horários de 3–5 linhas antigas, provocar eventos SSE; confirmar que horários antigos **não** mudam, scroll auto e expansão de detalhe intactos.

---

## Riscos restantes

- Entradas daemon **sem** `tsIso` no ficheiro e ingestadas **antes** desta correção na mesma sessão podem ainda mostrar epoch (`1970-01-01…`) até novo run ou limpar store — aceitável vs. horário “agora” falso.
- Linhas agrupadas (ruído/técnico) mostram o horário do **primeiro** evento do burst, não do último — comportamento mais honesto; contador `×N` indica repetições.
- Rebuild completo do view model a cada evento SSE mantém-se (custo CPU baixo para ≤500 linhas); cache por `id` não foi introduzido para manter o diff mínimo.
