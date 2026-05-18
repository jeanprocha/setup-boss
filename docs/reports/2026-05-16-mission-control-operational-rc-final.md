# Mission Control — fecho RC operacional final

**Data:** 2026-05-16  
**Tipo:** Fecho definitivo RC — pronto para uso diário local do Setup Boss  
**Fora de escopo:** features novas, redesign, Git flow, multi-worker, refactor estrutural, nova arquitectura runtime.

**Cadeia append-only:** `mission-control-rc-operational.md` → `mission-control-final-operational-pass.md` → `mission-control-operational-ready.md` → hardening/polish/integrated.

---

## Veredicto final

O Mission Control está **operacionalmente pronto para uso diário local**.

A camada operacional mínima está fechada: coerência UI/runtime via SSOT, recovery automático pós-daemon, refresh/reopen resilientes por desenho, dedupe em três camadas, e validação integrada (55 testes + smoke API + ciclo daemon).

**Única recomendação pós-fecho:** uma corrida manual opcional de run novo (intake→execution) no browser com Timeline/Logs abertos — confirmação humana, não bloqueante para uso local.

---

## Auditoria integrada — resultado

| Área auditada | Estado | Evidência |
|---------------|--------|-----------|
| UI ↔ runtime divergence | **Fechado** | `deriveRunOperationalCoherence` |
| Stale state / cache | **Fechado** | resync + refetch + invalidate on recovery |
| Reconnect SSE | **Fechado** | SSE estável; `seenKeys`; throttle resync |
| Refresh inconsistente | **Fechado** | `liveEmpty` + poll→live + selection resync |
| Polling/SSE mismatch | **Fechado** | `mission-polling-policy` (intervalos por fase SSE) |
| Ordering / dedupe residual | **Fechado** | timeline + `dedupeRuntimeEvents` |
| Loading residual | **Fechado** | `isLoading && !bundle`; heartbeat unknown |
| Heartbeat stale | **Fechado** | poll 12s; invalidate on recovery |
| Timeline inconsistente | **Fechado** | derive + testes; legado esparso documentado |
| Race conditions leves | **Fechado** | SSE sem deps runKey; resync throttle |
| Recovery pós daemon restart | **Fechado** | smoke stop→502→start→OK |

**Nenhuma inconsistência bloqueante nova** neste fecho.

---

## Inconsistências corrigidas (acumulado completo)

| # | Correção | Passe |
|---|----------|-------|
| SSOT `deriveRunOperationalCoherence` | Hero + execution + stall alinhados | Hardening P1 |
| SSE estável por projeto | `selectedRunKeyRef` | Operational-ready |
| Live store cleanup | `resetRuntimeEventBus` no cleanup SSE | Operational-ready |
| Reopen / re-clique | `refetchRunReadModels` | Operational-ready |
| Dedupe 3 camadas | bus SSE + live `getMerged` + merge final | Polish + P1 |
| Refresh `liveEmpty` resync | `onConnected` | Hardening P1 |
| Daemon recovery | `useRuntimeConnectionRecovery` | Polish |
| strategy_ready / pending falso | readiness + auto-start policy | P0 + integrated |
| Heartbeat badge loading gap | unknown badges vs `null` | RC |
| Resync storm | throttle `resyncInFlight` + janela 2s | RC |

### Código RC final (sem alterações adicionais neste fecho)

Validação confirmou que os ficheiros RC já estão correctos; **0 ficheiros alterados** nesta sessão de fecho.

---

## Cenários validados

### 1. Happy path completo (novo run)

| Garantia | Mecanismo | Validado |
|----------|-----------|----------|
| Sem pending falso | `pendingBlockingCount` + coerência | Testes + API legado |
| Sem spinner infinito | `showStrategyProcessing` + `is-ui-processing` | Testes |
| Sem strategy_running residual | `strategy_ready` suprime auto-start | Testes auto-start |
| Sem worker busy falso | `currentRunId` mismatch | Testes context |
| Sem stalled falso | supressões ready/terminal/idle | 12 testes stall |
| Sem waiting_user incorreto | timeline classify + log noise filter | Testes |
| Timeline / logs / heartbeat | derivadores | Testes |
| Terminal estável | `isRunTerminal` | Teste coerência |

**Browser E2E novo run:** não executado (LLM) — pendência operador.

### 2. Refresh resiliente

| Fase | Mecanismo |
|------|-----------|
| clarification, strategy_running, execution_running, stalled, review, completion | `resyncRuntimeAfterReconnect` + poll→live + `useRunSelectionResync` + dedupe |

Refresh F5 fase-a-fase no browser: **não repetido**; stack validada por desenho + 51 testes frontend.

### 3. Reopen resiliente

| Verificação | Resultado |
|-------------|-----------|
| Troca de run | refetch read models |
| Re-clicar mesmo run | `refetchRunReadModels` |
| Timeline / logs | merge + dedupe |
| Sem loading residual | bundle cache pattern |

### 4. Recovery daemon (smoke fecho final)

| Passo | Resultado |
|-------|-----------|
| Stop daemon | API down |
| Proxy MC | **502** |
| `daemon start` | Recovery ~4s |
| Heartbeat | `daemonAlive=true`, `worker=idle` |
| Run legado pós-restart | `strategy_ready` mantido |
| Spinner antigo | Não reactivado (coerência + terminal) |

### 5. Long running / stall

| Cenário | Resultado |
|---------|-----------|
| warning → stalled → critical | OK (testes) |
| Recovery após evento | OK |
| Supressão idle / completion / strategy_ready | OK |

### 6. Run legado `20260516-163856-…`

| Campo | Smoke fecho |
|-------|-------------|
| strategy | `strategy_ready`, `operationalReadiness=ready` |
| clarification | `pendingBlockingCount=0` |
| execution | `execution_pending`, worker idle |
| observability | `recentEvents=0`, job `completed` |
| proxy | `daemonAlive=true` |

### 7. Timeline / logs robustness

51 testes cobrem: ordering, dedupe, noise, truncation, stall recovery, scroll class. Live cap 300 eventos.

---

## Critérios operacionais obrigatórios

| Pergunta | Resposta derivada | Fecho |
|----------|-------------------|-------|
| O run está executando? | `showExecutionProcessing` ∧ worker alinhado | OK |
| Travou? | `deriveRuntimeStallVisual` | OK |
| Daemon morreu? | `reachable` + `daemonAlive` + badge | OK (502 smoke) |
| Worker ocupado? | `workerState` / `currentRunId` | OK |
| Último progresso? | timeline `lastProgressLabel` | OK* |
| Run terminou? | `isRunTerminal` | OK |
| Precisa acção humana? | clarification / retry / review | OK |

\*Timeline mínima em runs legados sem eventos persistidos.

**Sem contradição** entre: `runtimePhase`, `operationalReadiness`, `workerState`, timeline, cards, heartbeat, logs, strategy/execution hero — via SSOT + adapters.

---

## Comportamento reconnect / recovery

| Evento | Comportamento |
|--------|----------------|
| F5 / refresh | live vazio → resync; poll repovoa; dedupe |
| Reopen / re-clique | refetch coordenado |
| SSE reconnect | seenKeys + throttle 2s; sem storm |
| Troca de run | SSE mantém-se |
| Troca de projeto | limpa bus + live store |
| Daemon offline | badge offline; proxy 502; poll off |
| Daemon online | invalidate heartbeat + events + refetch run |
| Pós-restart | sem reload manual obrigatório |

---

## Testes executados (fecho final)

```bash
cd frontend && npx tsx --test \
  lib/runtime/observability/*.test.ts \
  lib/runtime/polling/mission-polling-policy.test.ts \
  lib/runtime/strategy/strategy-auto-start-policy.test.ts

cd .. && node --test scripts/daemon/lib/runtime-heartbeat.test.js
```

**55 testes — 0 falhas.**

---

## Smoke manual (fecho final)

| Smoke | Executado | Resultado |
|-------|-----------|-----------|
| API legado (5 endpoints) | Sim | OK |
| Proxy heartbeat | Sim | OK |
| Daemon stop → 502 → restart | Sim | OK |
| Run legado pós-restart | Sim | `strategy_ready` |
| Testes automatizados | Sim | 55/55 |
| Browser novo run E2E | Não | Opcional |
| Refresh por fase (browser) | Não | Stack validada |

---

## Checklist operacional final

### Pronto — uso diário local

- [x] Happy path (por testes + API; E2E browser opcional)
- [x] Refresh/reopen (código + hooks)
- [x] Recovery daemon (smoke)
- [x] Long running / stall (testes)
- [x] Run legado validado
- [x] Timeline/logs robustness (testes)
- [x] 8 perguntas operacionais
- [x] Cross-surface coherence
- [x] RC fixes (badge + resync throttle)

### Documentado — não bloqueia uso local

- [ ] E2E browser run novo completo
- [ ] Refresh manual em cada fase
- [ ] Timeline rica em runs legados sem eventos
- [ ] Latência heartbeat ~12s
- [ ] Git / multi-worker / distributed

---

## Limitações restantes

1. Timeline vazia em runs sem eventos persistidos no runtime.  
2. E2E browser intake→completion — uma corrida manual recomendada como confirmação, não como bloqueio.  
3. Latência heartbeat poll ~12s após restart do daemon.  
4. Stores in-memory (live, daemon logs UI) voláteis no F5 — mitigado por poll + refetch.  
5. Badge heartbeat no painel técnico (sem redesign de layout global).

---

## Avaliação final — estabilidade uso diário local

| Dimensão | Nota | Fecho |
|----------|------|-------|
| Coerência operacional (8 perguntas) | **Bom** | SSOT + 55 testes |
| Recovery infraestrutura | **Bom** | Smoke daemon repetido |
| Refresh / reopen / reconnect | **Bom** | Código fechado em RC |
| Timeline / logs | **Aceitável** | Sólido em testes; legado esparso |
| Happy path novo run (browser) | **Aceitável** | Testes por fase |
| **Uso diário local Setup Boss** | **Aprovado** | Fecho RC operacional final |

---

## Conclusão

O Mission Control cumpre o critério de **fecho RC operacional final**: última passada de auditoria integrada sem regressões, testes verdes, smoke daemon validado, run legado coerente, e stack de recovery/reconnect fechada.

**O Mission Control pode ser utilizado no dia-a-dia local do Setup Boss** com as limitações documentadas acima.

### Confirmação opcional (5–10 min)

1. `npm run dev:stack`  
2. Run legado `20260516-163856-…` — sem spinner, strategy disponível  
3. Daemon stop/start — recovery sem F5  
4. (Opcional) Novo run até `execution_running` com Timeline + Logs
