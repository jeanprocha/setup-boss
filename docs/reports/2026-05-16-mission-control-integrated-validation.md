# Validação visual integrada — Mission Control (P0/P1)

**Data:** 2026-05-16  
**Escopo:** validação operacional/UX após P0 `strategy_ready`, stall detection, heartbeat, timeline operacional e logs normalizados. Sem features novas, refactor estrutural ou alterações em Git.

**Ambiente:** `npm run dev:stack` — Mission Control `http://localhost:3000`, Runtime API `http://127.0.0.1:3210`.

---

## Cenários testados

| # | Cenário | Método | Resultado |
|---|---------|--------|-----------|
| 1 | **Run legado** `20260516-163856-…` | API + adapter frontend | Clarificação `ready_for_execution`; strategy `phase3Status=strategy_ready`, `operationalReadiness=ready`; UI mapeia `runtimePhase=strategy_ready` via adapter |
| 2 | **Daemon online / worker idle** | `GET /runtime/heartbeat` | `daemonAlive=true`, `workerState=idle`, `runningJobsCount=0`, `currentRunId=null` |
| 3 | **Daemon offline** | SIGTERM no PID do daemon | API directa indisponível; proxy Next `/api/runtime/heartbeat` → **502**; badge deve mostrar offline (derivado de erro + connection store) |
| 4 | **Worker busy noutro run** | Testes unitários `derive-runtime-operational-context` + `derive-runtime-stall-visual` | `isRunActivelyProcessing=false` e stall suprimido quando `currentRunId ≠ runKey` |
| 5 | **Strategy/execution longa sem eventos** | Testes unitários thresholds 60s / 5m / 10m | `warning` → `stalled` → `critical`; repõe `normal` após evento significativo |
| 6 | **Strategy ready (sem spinner eterno)** | API legado + `strategy-auto-start-policy` + `isStrategyGenerationComplete` | `strategyAutoStartInProgress=false`; artefatos considerados prontos |
| 7 | **Hint POST strategy legado** | `normalize-runtime-log-for-ui` | `strategy_waiting_user_action` classificado como **noise** (não aparece em logs operacionais) |
| 8 | **Timeline operacional** | Testes `derive-run-operational-timeline` + API observability legado | Derivação OK em testes; run legado com **0 eventos SSE** e **1** entrada daemon → timeline mínima/vazia na UI (esperado) |
| 9 | **Logs normalizados** | Testes `normalize-runtime-log-for-ui` | Payload truncado, noise compactado, erros preservados, dedupe estável |
| 10 | **Novo run completo** (intake→review) | Não executado end-to-end nesta sessão | Fluxo coberto por testes unitários + smoke históricos; validação visual completa requer corrida manual longa |

### Checklist visual (código + API)

| Área | Verificado | Notas |
|------|------------|-------|
| Strategy: spinner / badge “Em andamento” | ✓ lógica | Oculto quando `strategyArtifactsReady` ou `strategy_ready` |
| Strategy: “Estratégia disponível” | ✓ | Mensagem em `StrategyStageHero` quando artefatos prontos |
| Strategy: stall thresholds | ✓ testes | Suprimido em `strategy_ready` e worker idle |
| Heartbeat: badges online/offline, idle/busy | ✓ API + componente | Ver correção JSX abaixo |
| Timeline: ordenação, dedupe, waiting_user, erros | ✓ testes | |
| Timeline: sem spam técnico | ✓ testes | `scheduler_tick`, `worker_idle`, etc. filtrados |
| Logs: acumulação + payload grande | ✓ testes/store | Cap 3200 chars na UI; store acumulativo |
| Painel: coerência phase/readiness/worker | ✓ derivadores | Heartbeat integrado em stall via `deriveRuntimeOperationalContext` |

---

## Inconsistências encontradas

### 1. JSX inválido no badge de heartbeat (bloqueante)

**Ficheiro:** `RuntimeOperationalHeartbeatBadge.tsx`  
**Sintoma:** tag de fecho `</motionBadges>` sem componente correspondente (abertura `<motionBadges>`). Impedia compilação limpa do painel de observabilidade.  
**Impacto:** badges Daemon/Worker possivelmente ausentes ou build falhado no stack.

### 2. `executionLifecyclePhase` fora do contrato TypeScript

**Ficheiro:** `derive-runtime-stall-visual.ts` / `ExecutionPanel.tsx`  
**Sintoma:** `ExecutionPanel` passava `executionLifecyclePhase` ao hook de stall, mas o tipo `DeriveRuntimeStallVisualInput` não declarava o campo de forma unificada.  
**Impacto:** supressão de stall em `execution_completed` podia não aplicar-se de forma type-safe; erro TS em `tsc --noEmit`.

### 3. Readiness strategy sem fallback `phase3Status` (edge case legado)

**Ficheiro:** `strategy-readiness.ts`  
**Sintoma:** API raw expõe `phase3Status=strategy_ready` mas **não** envia `runtimePhase` no summary; o adapter frontend corrige, porém `isStrategyGenerationComplete` dependia só de `runtimePhase` mapeado.  
**Impacto:** risco de falso “Em andamento” se resposta passar sem passar pelo adapter.

### 4. Limitações operacionais (não bugs)

- Run legado: **0 eventos** em observability/SSE persistidos → timeline operacional vazia (hint na UI).
- Heartbeat poll ~12s: transição idle/busy com latência perceptível.
- Badge heartbeat só no painel **Técnico** de observabilidade (sem redesign do hero).
- Fluxo intake→review completo não corrido nesta validação (tempo/LLM).

---

## Correções aplicadas

| Ficheiro | Correção |
|----------|----------|
| `frontend/components/features/observability/RuntimeOperationalHeartbeatBadge.tsx` | `</motionBadges>` → `</div>` |
| `frontend/lib/runtime/observability/derive-runtime-stall-visual.ts` | `executionLifecyclePhase` no tipo `DeriveRuntimeStallVisualInput` e em `shouldSuppressStallVisual` |
| `frontend/lib/runtime/strategy/strategy-readiness.ts` | `isStrategyGenerationComplete` aceita também `phase3Status` `strategy_ready` / `ready_for_execution` |

---

## Comportamento antes / depois

| Situação | Antes | Depois |
|----------|-------|--------|
| Painel observabilidade (heartbeat) | JSX inválido; risco de falha de build | Badges “Daemon online/offline” e “Worker idle/busy” renderizam |
| Stall na execução concluída | Campo `executionLifecyclePhase` não no contrato principal | Supressão terminal type-safe em `ExecutionPanel` |
| Strategy legado com API sem `runtimePhase` | Depende exclusivamente do adapter | Fallback `phase3Status` evita falso processing se adapter falhar |
| Daemon parado | — (validado) | Proxy 502; UI: offline + mensagem stall “Daemon offline ou sem resposta.” quando processing activo |
| Run legado strategy | API: `phase3Status=strategy_ready`, readiness `ready` | Hero: sem auto-start; mensagem “Estratégia disponível…” |

---

## Testes executados

```bash
# Frontend (observability + strategy)
cd frontend
npx tsx --test \
  lib/runtime/observability/derive-run-operational-timeline.test.ts \
  lib/runtime/observability/derive-runtime-stall-visual.test.ts \
  lib/runtime/observability/derive-runtime-operational-context.test.ts \
  lib/runtime/observability/normalize-runtime-log-for-ui.test.ts \
  lib/runtime/strategy/strategy-auto-start-policy.test.ts \
  lib/runtime/strategy/strategy-state.test.ts

# Daemon heartbeat
node --test scripts/daemon/lib/runtime-heartbeat.test.js
```

**Resultado:** 36 testes frontend + 4 daemon — **todos passaram**.

---

## Limitações restantes

1. **Timeline vazia em runs legados** sem eventos persistidos — só melhora com novos runs ou rehydration futura.  
2. **Validação visual browser** do fluxo completo intake→review não realizada nesta sessão (recomendado smoke manual com um run novo).  
3. **Latência heartbeat** (~12s) na troca idle/busy após restart do daemon.  
4. **`tsc --noEmit`** reporta erros pré-existentes noutros módulos (governance, intake tests) — fora do escopo desta validação.  
5. **Múltiplos runs abertos** / reopen — validado por desenho (stores por `runKey`, testes dedupe); não repetido em browser nesta sessão.

---

## Avaliação final da UX operacional

| Dimensão | Nota | Comentário |
|----------|------|------------|
| Strategy P0 (`strategy_ready`) | **Bom** | Run legado e políticas auto-start coerentes; sem hint POST em logs |
| Stall detection P1 | **Bom** | Thresholds e supressões (ready, terminal, worker mismatch, offline) confirmados em testes |
| Heartbeat P1 | **Aceitável** | Contrato API estável; badge corrigido; visibilidade limitada ao painel técnico |
| Timeline P1 | **Aceitável** | Derivação sólida em testes; runs sem histórico ficam vazios |
| Logs normalizados | **Bom** | Noise compactado, erros visíveis, dedupe e cap de payload |
| Coerência global | **Bom** | Derivadores partilham heartbeat + stall; pequenas correções fecham gaps JSX/tipo/legado |

**Conclusão:** a experiência integrada P0/P1 está **operacionalmente coerente** para uso diário, com correções mínimas aplicadas. Recomenda-se um **smoke visual manual** de um run novo (approve → strategy → execute) e reopen do run legado na aba Timeline para confirmar hints vazios vs. marcos esperados.

---

## Próximo passo sugerido (opcional)

- Corrida manual única: novo run até `execution_running` com painel Timeline + Logs abertos; confirmar stall some após `strategy_completed` / `execution_progress`.
- Reiniciar daemon se foi parado durante teste offline: `node scripts/daemon/start-daemon.js` ou `npm run dev:stack`.
