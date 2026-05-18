# P1d — Polling Cleanup

**Data:** 2026-05-16  
**Escopo:** Reduzir polling redundante e flicker no Mission Control (sem SSE-only, sem backend).

## Polls encontrados (antes)

| Hook / query | Intervalo (aprox.) | Notas |
|--------------|-------------------|--------|
| `useRuntimeHealth` | 8s / 15s erro | + status queue |
| `useProjects` | 25s | lista projetos |
| `useRuns` / `projectRunsQueryOptions` | 18s | por projeto expandido |
| `usePreRunDiagnostics` | 12s sempre | mesmo com run activa |
| `useRuntimeEvents` | 12–45s | já dependia de SSE; queryKey mudava com `ssePhase` |
| `useExecution` | 10–20s | só orquestração activa |
| `useRunObservabilityBundle` | 16s fixo | paralelo a events/SSE |
| `useProjectGovernance` | sem interval | só `enabled` registry |
| SSE + `publishSseRuntimeEvent` | invalidação throttle 750ms | complementa polling |

## Regras aplicadas

Módulo: `frontend/lib/runtime/polling/mission-polling-policy.ts`

| Caso | Regra |
|------|--------|
| Pre-run diagnostics | `enabled` + poll **só** sem run activa na shell (`selectedRunId` + não `newActivityFlow`) |
| Governance | `enabled` via `canFetchProjectGovernance`; `refetchInterval: false` |
| Runtime events | SSE `connected` → **90s**; degraded/reconnecting → 22s; offline stream → 14s |
| Execution | Poll só com `runKey` válido + orquestração activa; SSE → 28s, senão 12s |
| Observability bundle | Só com run válida; SSE → 45s, senão 20s |
| Project runs | SSE → 28s, senão 20s |
| Health | 12s ok / 20s erro; `retryDelay` 2.5s (menos agressivo) |

Anti-flicker: `mission-query-stable.ts` — `placeholderData: keepPreviousData` + `refetchOnWindowFocus: false` nos hooks de missão.

`useRuntimeEvents`: removido `ssePhase` da `queryKey` (evita refetch duplicado ao conectar SSE).

## Ficheiros alterados

- `frontend/lib/runtime/polling/mission-polling-policy.ts` (novo)
- `frontend/lib/runtime/polling/mission-polling-policy.test.ts` (novo)
- `frontend/lib/runtime/polling/mission-query-stable.ts` (novo)
- `frontend/hooks/use-pre-run-diagnostics.ts`
- `frontend/hooks/use-runtime-events.ts`
- `frontend/hooks/use-execution.ts`
- `frontend/hooks/use-run-observability-bundle.ts`
- `frontend/hooks/use-runtime-health.ts`
- `frontend/hooks/use-runs.ts`
- `frontend/hooks/use-project-governance.ts`
- `frontend/components/features/observability/RuntimeObservabilityLogs.tsx`

## Testes executados

```text
node --experimental-strip-types --test frontend/lib/runtime/polling/mission-polling-policy.test.ts
→ 6/6 pass
```

## Validação manual (checklist)

1. Mission Control **sem run** — Network: pre-run diagnostics ~15s; sem poll execution/obs bundle.
2. **Com run activa** — pre-run diagnostics para; execution/obs só se fase aplicável.
3. SSE **connected** — events/runs/execution com intervalos maiores; menos picos na Network tab.
4. Projeto stale/offline — governance query `enabled: false`.
5. UI mantém último estado durante refetch (sem skeleton repetitivo nos painéis que usam estas queries).

## Efeito esperado na UX

- Menos chamadas HTTP paralelas e menos invalidações “em onda”.
- Logs/pre-run deixam de competir com polling da corrida activa.
- Transições mais estáveis na sidebar, timeline e observability (dados anteriores visíveis até o refetch completar).

## Não implementado

- SSE-only, alterações no daemon, refactor da fila, redesign de observabilidade.
