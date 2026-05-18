# Relatório — UX de progresso da Estratégia + logs runtime

**Data:** 2026-05-16  
**Âmbito:** feedback visual na tela principal, histórico de logs sem sobrescrita, normalização de exibição, eventos de progresso no backend.

---

## Causa raiz

| Problema | Causa |
|----------|--------|
| Tela principal sem feedback forte | `StrategyStageHero` só mostrava texto estático + loader pequeno; sem lista de atividades nem tempo decorrido |
| Histórico de logs “sumia” | Cada poll de `useRunObservabilityBundle` devolvia só o slice actual do tail; a UI substituía `daemonLogEntries` em vez de acumular |
| Payloads gigantes na UI | Eventos/daemon com `detail` grande eram renderizados (ou clipados com mensagem confusa) |
| Longa espera sem aviso | Não havia derivação de `lastMeaningfulEventAt` nem thresholds 60s / 5min / 10min |
| Poucos eventos durante strategy | `runStrategyRuntimeBase` era síncrono com logs só no início/fim via `run-strategy-api` |

---

## Arquivos alterados

### Frontend

| Arquivo | Mudança |
|---------|---------|
| `frontend/components/features/strategy/StrategyStageHero.tsx` | Spinner, badge “Em andamento”, tempo decorrido, lista de atividades, avisos de stall |
| `frontend/hooks/use-strategy-phase-progress.ts` | Deriva progresso/stall a partir de eventos reais |
| `frontend/lib/runtime/observability/normalize-runtime-log-for-ui.ts` | Classificação important/progress/technical/noise + mensagens compactas |
| `frontend/lib/runtime/observability/normalize-runtime-log-for-ui.test.ts` | Testes unitários |
| `frontend/stores/runtime-observability-logs-store.ts` | Acumula entradas daemon por `runKey` (máx. 500) |
| `frontend/components/features/observability/RuntimeObservabilityLogs.tsx` | Store acumulativo, dedupe, exibição normalizada |
| `frontend/stores/runtime-live-events-store.ts` | Buffer SSE: 120 → 300 eventos |
| `frontend/components/features/run-detail/RunViewShell.tsx` | Passa `projectId` ao hero |

### Backend

| Arquivo | Mudança |
|---------|---------|
| `scripts/daemon/lib/run-strategy-api.js` | `onProgress` → `emitRuntimeEvent` + logger |
| `scripts/runtime/strategy-runtime/run-strategy-runtime.js` | Eventos: `strategy_plan_loaded`, `strategy_context_prepared`, `strategy_llm_*`, `strategy_decomposition_started`, `strategy_artifacts_written` |

---

## Logs antes vs depois

**Antes:** `merged = events + obsQ.daemonLogEntries + ui` a cada render; novo poll podia omitir entradas antigas do tail.

**Depois:**

1. Poll ingere em `runtime-observability-logs-store` (dedupe por `id`).
2. Lista final = eventos SSE/API + acumulado daemon + UI diagnostics.
3. Dedupe adicional por `runtimeLogDedupeKey` (id ou timestamp+level+channel+message+runId).
4. Limite 500 linhas em memória.

---

## Normalização na UI

- **important / progress:** mensagem legível; payload pequeno expandível.
- **technical / noise:** mensagem compacta (ex. `runtime.projects.pipeline — N projetos…`).
- **detailTruncated:** `Payload técnico grande omitido da visualização rápida. Tamanho: N KB.`
- Payloads > 4KB: omitidos por defeito na vista rápida.

---

## Eventos usados no progresso visual

- `clarification_approve` / aprovação do plano  
- `strategy_started`, `strategy_requested`, `strategy_auto_started_after_approval`  
- `strategy_plan_loaded`, `strategy_context_prepared`  
- `strategy_llm_started`, `strategy_llm_completed`  
- `strategy_decomposition_started`, `strategy_artifacts_written`  
- `strategy_completed` / `strategy_failed`  
- `runtime.strategy_*` (daemon/SSE)

---

## Limitações restantes

- Geração da strategy continua **síncrona** no worker; eventos intermediários só aparecem quando o runtime emite (durante o POST longo, o browser pode só ver início + fim até o SSE refrescar).
- Logs completos permanecem em `logs/runtime.log` no servidor.
- Stall detection usa relógio local (1s) só enquanto `processing === true`.

---

## Validação manual

1. Aprovar plano refinado → hero com spinner, “Gerando estratégia…”, badge **Em andamento**, tempo a subir.
2. Ver **Atividades recentes** a preencher com eventos (plano aprovado, estratégia iniciada, etc.).
3. Painel **Logs do Runtime** — linhas antigas permanecem ao chegar novas; sem bloco JSON de centenas de KB por defeito.
4. Expandir linha técnica — mensagem compacta ou aviso de payload omitido.
5. Simular pausa (daemon parado) → após ~60s aviso leve; após ~5min aviso forte.
6. Concluir strategy → lista marca conclusão; hero passa a “Estratégia disponível”.

---

## Testes

```bash
cd frontend && npx tsx --test lib/runtime/observability/normalize-runtime-log-for-ui.test.ts
node --test scripts/daemon/lib/run-observability-bundle.test.js
```
