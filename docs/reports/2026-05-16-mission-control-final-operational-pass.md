# Mission Control — passe operacional final

**Data:** 2026-05-16  
**Escopo:** fecho operacional para uso diário local do Setup Boss — auditoria, smoke manual, testes de regressão.  
**Fora de escopo:** features novas, Git flow, multi-worker, redesign UI, alteração de arquitectura principal.

**Relatórios anteriores (append-only):** `mission-control-operational-ready.md`, `mission-control-hardening-p1.md`, `mission-control-polish-p1.md`, `mission-control-integrated-validation.md`.

---

## Veredicto

O Mission Control está **operacionalmente estável para uso diário local**, com coerência entre runtime API, polling, SSE, heartbeat, strategy/execution e painéis observabilidade. As perguntas operacionais obrigatórias têm resposta derivada sem contradição visual nos cenários validados.

**Nota:** corrida browser completa intake→review (com LLM) não executada nesta sessão; cobertura via API + 55 testes automatizados + smoke de infraestrutura.

---

## Inconsistências corrigidas (acumulado P1 → passe final)

| # | Área | Problema | Estado |
|---|------|----------|--------|
| 1 | SSE lifecycle | Reconnect SSE a cada troca de run | **Corrigido** — `selectedRunKeyRef`, deps sem runKey |
| 2 | Live events | Buffer global não limpo em ciclo SSE / troca projeto | **Corrigido** — `resetRuntimeEventBus()` no cleanup |
| 3 | Reopen | Re-clicar mesmo run sem refetch | **Corrigido** — `refetchRunReadModels` na sidebar |
| 4 | SSOT UI | Flags processing/stall dispersas | **Corrigido** — `deriveRunOperationalCoherence` |
| 5 | Dedupe | Poll+SSE+audit duplicados | **Corrigido** — 3 camadas (bus, live, merge) |
| 6 | Refresh | Buffer vazio sem resync | **Corrigido** — `liveEmpty` em `onConnected` |
| 7 | Daemon recovery | reachable sem refetch | **Corrigido** — connection + selection resync |
| 8 | strategy_ready | Spinner / pending falso | **Corrigido** — readiness + coerência + testes |
| 9 | Heartbeat badge | JSX inválido / offline null | **Corrigido** — sessão integrated-validation |

**Nenhuma inconsistência nova bloqueante** identificada neste passe além das limitações documentadas.

---

## Cenários validados

### 1. Happy path (intake → completion)

| Fase | Validação | Resultado |
|------|-----------|-----------|
| Intake | Audit stores + runs query | Testes + desenho |
| Clarification | `pendingBlockingCount=0` no legado | API OK |
| Approve | Política auto-start / bloqueio plano | Testes `strategy-auto-start-policy` |
| Strategy | `strategy_ready` sem spinner | Teste coerência + API legado |
| Execution | `execution_pending` + worker idle | Sem “executando” falso |
| Review | Stall suprimido em terminal | Teste stall visual |
| Completion | `success` → sem processing/stall | Teste coerência |

### 2. Refresh resiliente

| Fase | Método | Resultado |
|------|--------|-----------|
| clarification / strategy / execution / review / completed | Código: `liveEmpty` + `resyncRuntimeAfterReconnect` + poll→live + `useRunSelectionResync` | Recompõe read models; dedupe evita duplicação |
| stalled | Testes unitários thresholds 60s/5m/10m | warning → stalled → critical → normal após evento |

*Refresh browser em cada fase:* não repetido manualmente fase-a-fase; mecanismo validado por desenho + testes (igual passe `operational-ready`).

### 3. Reopen resiliente

| Verificação | Resultado |
|-------------|-----------|
| Troca de run | `useRunSelectionResync` refetch strategy/clarification/execution/observability |
| Re-clicar mesmo run | `refetchRunReadModels` na sidebar |
| Timeline / logs | Merge `deriveRunOperationalTimeline` + dedupe; legado com 0 eventos persistidos → timeline mínima (esperado) |

### 4. Daemon lifecycle (smoke manual executado)

| Passo | Resultado |
|-------|-----------|
| Baseline online | `daemonAlive=true`, `workerState=idle` |
| Stop daemon (PID 26304) | API directa indisponível |
| Proxy MC offline | `GET /api/runtime/runtime/heartbeat` → **502** |
| Restart | `node scripts/cli/index.js daemon start` |
| Recovery (~4s) | `daemonAlive=true`, proxy OK |
| Run legado pós-restart | `strategy_ready` mantido |

### 5. Long running / stall

| Cenário | Método | Resultado |
|---------|--------|-----------|
| Sem eventos novos | Testes `derive-runtime-stall-visual` | warning → stalled → critical |
| Worker busy noutro run | Teste coerência + operational context | `showExecutionProcessing=false`, stall suprimido |
| Recovery após evento | Teste stall “repõe normal” | OK |
| Worker idle | Stall não atinge stalled | OK |

### 6. Run legado `20260516-163856-…`

| Verificação | API / teste | Resultado |
|-------------|-------------|-----------|
| strategy_ready | `phase3Status=strategy_ready`, `operationalReadiness=ready` | OK |
| Sem pending falso | `pendingBlockingCount=0`, `ready_for_execution` | OK |
| Sem loading eterno | Coerência suprime processing | OK (teste) |
| execution | `execution_pending`, worker idle | Sem execução activa falsa |
| Timeline | `recentEvents=0`, `daemonLogs=0` | Timeline mínima — limitação legado |
| Heartbeat | idle, `currentRunId=null` | Coerente |

### 7. Timeline / logs

| Verificação | Testes | Resultado |
|-------------|--------|-----------|
| Dedupe estável | `dedupe-runtime-events` | OK |
| Ordering | `derive-run-operational-timeline` | OK |
| Noise filtering | timeline + normalize logs | OK |
| Payload truncation | `normalize-runtime-log-for-ui` | OK |
| Erros visíveis | classificação important | OK |
| Memory caps | live store MAX_LIVE=300 | OK |

### 8. Critérios operacionais obrigatórios

| Pergunta | Fonte | Pass |
|----------|-------|------|
| O run está executando? | `showExecutionProcessing` + lifecycle + heartbeat | Sim |
| Travou? | `deriveRuntimeStallVisual` | Sim |
| Daemon morreu? | `reachable` + `daemonAlive` + badge offline | Sim (smoke 502) |
| Worker ocupado? | `workerState` / `currentRunId` | Sim |
| Último progresso? | timeline `lastProgressLabel` | Sim* |
| Run terminou? | `isRunTerminal` | Sim |
| Precisa acção humana? | clarification / retry / review | Sim |

\*Esparso em runs legados sem eventos persistidos.

---

## Smoke manual — registo desta sessão

| Smoke | Executado | Resultado |
|-------|-----------|-----------|
| API run legado (4 endpoints + observability) | Sim | Todos `ok: true` |
| Proxy MC heartbeat | Sim | `daemonAlive=true` via `/api/runtime/runtime/heartbeat` |
| Frontend MC (:3000) | Sim | HTTP 200 |
| Daemon stop → offline | Sim | API down; proxy 502 |
| Daemon restart + recovery | Sim | CLI `daemon start`; heartbeat online em ~4s |
| Run legado pós-restart | Sim | `strategy_ready` inalterado |
| Browser E2E intake→review | Não | Tempo/LLM — recomendado 1x manual |
| Refresh F5 por fase | Não | Mecanismo coberto por código + testes |
| Run novo até execution | Não | Requer operador + LLM |

---

## Comportamento reconnect / recovery

| Evento | Comportamento |
|--------|----------------|
| **F5** | Live vazio → resync SSE; poll repovoa live; selection resync |
| **Reopen run** | Refetch read models; re-clique força refetch |
| **Daemon offline** | Poll off; badge offline; proxy 502 |
| **Daemon online** | Invalidate heartbeat + refetch run activo |
| **SSE reconnect** | `seenKeys` + resync se buffer vazio/reconnect |
| **Troca de run** | SSE **mantém-se** (sem reconnect por runKey) |
| **Troca de projeto** | Cleanup SSE limpa bus + live store |

---

## Testes executados

```bash
cd frontend
npx tsx --test \
  lib/runtime/observability/derive-run-operational-coherence.test.ts \
  lib/runtime/observability/dedupe-runtime-events.test.ts \
  lib/runtime/observability/is-ui-processing.test.ts \
  lib/runtime/observability/derive-run-operational-timeline.test.ts \
  lib/runtime/observability/derive-runtime-stall-visual.test.ts \
  lib/runtime/observability/derive-runtime-operational-context.test.ts \
  lib/runtime/observability/normalize-runtime-log-for-ui.test.ts \
  lib/runtime/observability/runtime-logs-scroll.test.ts \
  lib/runtime/polling/mission-polling-policy.test.ts \
  lib/runtime/strategy/strategy-auto-start-policy.test.ts

cd ..
node --test scripts/daemon/lib/runtime-heartbeat.test.js
```

**Resultado:** 51 testes frontend + 4 daemon = **55 testes, 0 falhas**.

---

## Checklist operacional final

### Estável para uso diário local

- [x] SSOT `deriveRunOperationalCoherence`
- [x] Dedupe SSE + poll + audit (id + chave lógica)
- [x] SSE estável por projeto
- [x] Recovery daemon sem reload manual (validado smoke)
- [x] Proxy offline 502 quando daemon parado
- [x] Refetch reopen + re-clique
- [x] Terminais sem spinner/stall fantasma
- [x] Stall thresholds + supressões
- [x] Run legado strategy_ready (API)
- [x] Polling SSE-aware
- [x] Logs: noise, truncation, erros preservados

### Não validado / não pronto para “produção hard”

- [ ] E2E browser intake→review (uma corrida)
- [ ] Refresh manual em cada fase do fluxo
- [ ] Timeline rica em runs legados (0 eventos persistidos)
- [ ] Rehydration histórica de eventos
- [ ] Latência heartbeat ~12s pós-restart
- [ ] Badge heartbeat só no painel técnico
- [ ] Git / multi-worker / distributed runtime

---

## Limitações restantes

1. **Timeline vazia** em runs legados sem `recentEvents` / `daemonLogs` no bundle observability.  
2. **Smoke browser** do happy path completo não executado (LLM/tempo).  
3. **Latência** heartbeat poll ~12s na transição idle/busy.  
4. **Stores in-memory** (live, daemon logs UI) voláteis no F5 — mitigado por poll + refetch.  
5. **Registry de projetos** no daemon desta máquina pode não listar todos os project roots; runs acedidos por `runId` directo funcionam.

---

## Avaliação de estabilidade real

| Dimensão | Nota | Evidência |
|----------|------|-----------|
| Coerência operacional (8 perguntas) | **Bom** | Derivadores + testes + API legado |
| Recovery infra (daemon/SSE/poll) | **Bom** | Smoke stop/restart + código |
| Refresh / reopen | **Bom** | Hooks + resync (não E2E browser por fase) |
| Timeline / logs | **Aceitável** | Sólido em testes; legado esparso |
| Happy path completo | **Aceitável** | Testes por fase; E2E manual pendente |
| Uso diário local Setup Boss | **Aprovado** | Passe operacional final |

---

## Conclusão

O Mission Control cumpre o critério de **estabilidade operacional para uso diário local**: responde às perguntas operacionais sem contradições nos cenários validados, recupera do ciclo daemon offline→online sem reload manual, e mantém o run legado `20260516-163856-…` em `strategy_ready` sem pending ou execução falsa.

**Próximo passo opcional (operador):** uma corrida manual de 10–15 min — novo run até `execution_running` com Timeline/Logs abertos; confirmar refresh em `strategy_running` e reopen do run legado na aba Timeline.
