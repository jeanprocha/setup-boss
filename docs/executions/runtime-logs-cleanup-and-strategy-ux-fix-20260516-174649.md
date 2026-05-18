# Fix — Runtime logs noise + strategy pending UX

**Execução:** 2026-05-16T17:46:49 (local)  
**Âmbito:** Fases A–C do discovery `runtime-logs-payload-strategy-ux-discovery-20260516-164423.md`.

---

## Causa raiz (resumo)

| Problema | Causa |
|----------|--------|
| Payload ~393k na UI | Tail de `runtime.log` (~393KB) podia entrar inteiro em `detail` quando `runId=` casava no bloco; `finalProjects` inflacionava o ficheiro |
| `runtime.projects.*` na run | Logs globais de `GET /projects` sem exclusão no bundle |
| Duplicate keys React | `BulletList` com `key={item}` em listas com bullets repetidos |
| Estratégia confusa | Badge `PENDING` com bundles desalinhados; timeline «Gerar estratégia» só fazia scroll |

---

## Fase A — Runtime logs payload cleanup

### Alterações

| Arquivo | Mudança |
|---------|---------|
| `scripts/daemon/runtime-api.js` | `finalProjects` removido do log; `sampleProjectIds` (máx. 5) + stats existentes |
| `scripts/daemon/lib/run-observability-bundle.js` | Denylist `runtime.projects.pipeline` / `runtime.projects.list`; cap `detail` 12 000 chars; `detailTruncated`, `detailBytes` |
| `scripts/daemon/lib/run-observability-bundle.test.js` | +4 testes (global exclude, truncation, cap no parse) |
| `frontend/lib/api/runtime-types.ts` | Campos opcionais `detailTruncated`, `detailBytes` |
| `frontend/.../RuntimeObservabilityLogs.tsx` | Meta JSON quando detail truncado no servidor |

### Payload antes / depois

| Aspecto | Antes | Depois |
|---------|-------|--------|
| Log `pipeline` | `finalProjects=[{…}]` (KB por poll) | `sampleProjectIds=["proj_…",…]` (≤5 ids) |
| Bundle run | `detail` até ~393KB | `detail` ≤ 12 000 chars + metadata |
| Eventos globais na run | Incluídos se `runId=` no bloco | **Excluídos** por nome de evento |

`scripts/runtime/logger.js` — **sem alteração** (truncate 4KB/linha já existia; ganho principal foi parar de logar o array completo).

---

## Fase B — React duplicate keys

| Arquivo | Mudança |
|---------|---------|
| `frontend/components/features/clarification/RefinedPlanReview.tsx` | `BulletList`: `key={\`${index}-${item.slice(0,40)}\`}`; `risks`: mesmo padrão |

Layout inalterado.

---

## Fase C — Strategy pending UX

| Arquivo | Mudança |
|---------|---------|
| `frontend/lib/runtime/strategy/strategy-operational-state.ts` | `strategyAwaitingUserKickoff` true se `clarification.session.runtimePhase === "strategy_pending"` (hero resiliente) |
| `frontend/lib/runtime/mission/mission-workflow-stages.ts` | Badge `WAITING_USER_ACTION` também quando clarificação reporta `strategy_pending` |
| `frontend/lib/runtime/execution/build-execution-timeline-cards.ts` | Ação «Ir para estratégia»; copy aponta para «Iniciar estratégia» na etapa Estratégia |

`RunViewShell` / `StrategyStageHero` — sem diff: `active={dominantStrategyHandoff}` passa a ser true mais cedo via `strategy-operational-state`.

---

## Testes executados

```bash
node --test scripts/daemon/lib/run-observability-bundle.test.js
# 8/8 pass

cd frontend && npx tsx --test lib/runtime/observability/runtime-logs-scroll.test.ts
# 1/1 pass
```

---

## Validação manual recomendada

1. Observabilidade de uma run — sem «389974 caracteres omitidos»; sem linhas `runtime.projects.pipeline`.
2. Expandir payload daemon — ≤12KB + meta `detailTruncated` se aplicável.
3. Aprovar plano — badge **AGUARDA SI**; botão **Iniciar estratégia** visível na etapa 3.
4. Console — sem warning duplicate key em `RefinedPlanReview`.
5. Timeline — «Ir para estratégia» faz scroll; POST só no hero.

---

## Limitações

- Tail ainda lê 393KB do disco (custo I/O); só o **payload à UI** foi limitado.
- `GET /projects` continua a poluir `runtime.log` (entradas pequenas com `sampleProjectIds`) — não aparecem no bundle da run.
- Clipboard no painel de logs ainda usa `DETAIL_CAP` 3200 na UI para exibição; cópia usa texto já truncado no servidor no `detail`.

---

## Resultado final

- Observabilidade por run deixa de receber megabytes de `finalProjects` / blocos globais `projects.*`.
- UX pós-approve alinha badge, hero e copy da timeline com a acção real (POST em `StrategyStageHero`).
- Warnings React de keys duplicadas eliminados no plano refinado.
