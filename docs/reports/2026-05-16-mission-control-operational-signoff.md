# Mission Control — sign-off operacional

**Data:** 2026-05-16  
**Tipo:** Sign-off final da estabilização operacional  
**Fora de escopo:** features novas, redesign, Git flow, multi-worker, refactor estrutural, nova arquitectura runtime.

**Cadeia append-only:** `mission-control-operational-rc-final.md` → `mission-control-rc-operational.md` → `mission-control-final-operational-pass.md` → hardening/polish/integrated.

---

## Conclusão explícita

### Pronto para uso diário local

O Mission Control está **aprovado para uso diário local** no Setup Boss.

O Setup Boss dispõe de uma **base operacional confiável** para operação local: coerência UI/runtime, recovery automático, observabilidade (timeline, logs, heartbeat, stall) e validação integrada repetida neste sign-off.

### Pendências críticas

**Nenhuma.**

As pendências abaixo são **não bloqueantes** para uso local (confirmação humana opcional ou limitações documentadas de runs legados).

---

## Sign-off — auditoria integrada

| Área | Resultado sign-off |
|------|-------------------|
| Stale state residual | Fechado (resync, refetch, invalidate) |
| Reconnect inconsistente | Fechado (SSE estável, seenKeys, throttle) |
| Refresh / reopen | Fechado (liveEmpty, poll→live, selection resync, re-clique) |
| Polling / SSE mismatch | Fechado (`mission-polling-policy`) |
| Dedupe / ordering residual | Fechado (3 camadas + timeline tests) |
| Loading residual | Fechado (`!bundle` gate; heartbeat unknown) |
| Heartbeat stale | Fechado (poll + recovery invalidate) |
| Timeline inconsistente | Fechado (derive); legado esparso = limitação |
| Race conditions leves | Fechado (`selectedRunKeyRef`, resync throttle) |
| Recovery pós daemon restart | Fechado (smoke sign-off) |
| Status visual contraditório | Fechado (`deriveRunOperationalCoherence`) |

**Alterações de código neste sign-off:** nenhuma (stack RC validado sem regressão).

---

## Inconsistências corrigidas (histórico acumulado)

| Correção | Impacto |
|----------|---------|
| `deriveRunOperationalCoherence` (SSOT) | Cards, execution, stall alinhados |
| SSE estável por projeto | Sem reconnect por troca de run |
| `resetRuntimeEventBus` no cleanup SSE | Sem contaminação cross-project |
| `refetchRunReadModels` + re-clique sidebar | Reopen sem stale read models |
| Dedupe 3 camadas | Sem duplicação timeline/logs |
| `liveEmpty` → resync | Refresh recompõe estado |
| `useRuntimeConnectionRecovery` | Daemon online sem F5 |
| strategy_ready / pending falso | Sem spinner/pending fantasma |
| Heartbeat badge loading | Sem gap `null` |
| Resync throttle | Sem storm SSE |

---

## Cenários validados (sign-off)

### 1. Happy path completo

| Garantia | Validação |
|----------|-----------|
| Sem pending / strategy_running / spinner / stalled / worker falso | 51 testes + coerência |
| Timeline, logs, heartbeat, terminal | Testes derive |
| Browser E2E run novo | **Não executado** — não crítico |

### 2. Refresh resiliente

Mecanismos validados por desenho + testes: `resyncRuntimeAfterReconnect`, poll→live, dedupe, `useRunSelectionResync`.  
Refresh F5 fase-a-fase no browser: **não repetido** (não crítico).

### 3. Reopen resiliente

Refetch coordenado; re-clique; merge timeline/logs; sem spinner residual (coerência terminal).

### 4. Recovery daemon (smoke sign-off)

| Passo | Resultado |
|-------|-----------|
| Stop daemon | API down |
| Proxy MC | **502** |
| Restart CLI | ~4s |
| Pós-restart | `daemonAlive=true`, legado `strategy_ready` |

### 5. Long running / stall

12 testes: warning → stalled → critical → normal; supressão idle/completion/ready.

### 6. Run legado `20260516-163856-…`

| Campo | Sign-off API |
|-------|--------------|
| strategy | `strategy_ready`, `ready` |
| clarification | `pending=0` |
| execution | `execution_pending`, worker idle |
| eventos persistidos | 0 — timeline mínima (limitação) |

### 7. Timeline / logs

Ordering, dedupe, noise, truncation, errors, cap 300 — testes OK.

---

## Critérios operacionais (8 perguntas)

| Pergunta | Sign-off |
|----------|----------|
| O run está executando? | OK |
| Travou? | OK |
| Daemon morreu? | OK (smoke 502) |
| Worker ocupado? | OK |
| Último progresso? | OK* |
| Run terminou? | OK |
| Precisa acção humana? | OK |

\*Esparso em runs legados sem eventos no runtime.

**Sem conflito** entre runtimePhase, operationalReadiness, workerState, timeline, heartbeat, logs, cards e hero — nos cenários validados.

---

## Comportamento reconnect / recovery

| Evento | Comportamento |
|--------|----------------|
| F5 / refresh | Resync + poll→live + dedupe |
| Reopen / re-clique | Refetch read models |
| SSE reconnect | seenKeys + throttle 2s |
| Troca run | SSE mantém-se |
| Troca projeto | Limpa bus + live |
| Daemon offline | Badge offline; proxy 502 |
| Daemon online | Invalidate + refetch automático |
| Pós-restart | Sem reload manual; sem reactivar spinner terminal |

---

## Testes (sign-off)

```bash
cd frontend && npx tsx --test lib/runtime/observability/*.test.ts \
  lib/runtime/polling/mission-polling-policy.test.ts \
  lib/runtime/strategy/strategy-auto-start-policy.test.ts
cd .. && node --test scripts/daemon/lib/runtime-heartbeat.test.js
```

**55 testes — 0 falhas** (executado 2026-05-16, sign-off).

---

## Smoke manual (sign-off)

| Smoke | Resultado |
|-------|-----------|
| API legado | OK |
| Proxy heartbeat | OK |
| Daemon stop → 502 → restart | OK |
| Testes 55/55 | OK |
| Browser run novo E2E | Não executado |
| Refresh por fase (browser) | Não executado |

---

## Checklist operacional final

### Aprovado

- [x] Coerência operacional (SSOT + 8 perguntas)
- [x] Recovery daemon sem F5
- [x] Refresh/reopen/reconnect (código)
- [x] Stall long-running + supressões
- [x] Run legado API
- [x] Timeline/logs (testes)
- [x] 55 testes verdes
- [x] Sem pendências críticas

### Não bloqueante (pós sign-off)

- [ ] E2E browser run novo intake→completion
- [ ] Refresh manual em cada fase
- [ ] Timeline rica em runs legados sem eventos
- [ ] Latência heartbeat ~12s
- [ ] Git / multi-worker / distributed

---

## Limitações restantes (aceites no sign-off)

1. Timeline mínima em runs sem eventos persistidos no runtime.  
2. Confirmação browser de run novo — recomendada, não obrigatória.  
3. Latência perceptível do heartbeat (~12s) após restart.  
4. Stores in-memory voláteis no F5 (mitigado).  
5. Badge heartbeat concentrado no painel técnico.

---

## Avaliação de estabilidade — uso diário local

| Dimensão | Nota |
|----------|------|
| Coerência UI/runtime | **Bom** |
| Recovery infraestrutura | **Bom** |
| Observabilidade (timeline/logs/stall) | **Aceitável** |
| Happy path browser E2E | **Aceitável** (testes por fase) |
| **Sign-off uso diário local** | **Aprovado** |

---

## Encerramento

A estabilização operacional do Mission Control está **encerrada**.

O Setup Boss possui base confiável para **uso diário local** com as limitações documentadas. Não há pendências críticas que impeçam o sign-off.

**Próximo passo natural (fora deste sign-off):** features de produto (Git flow, multi-worker, etc.) ou corrida manual opcional de um run novo no browser como confirmação humana final.
