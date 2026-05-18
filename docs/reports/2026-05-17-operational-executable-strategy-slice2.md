# Relatório — Estratégia operacional executável (Slice 2)

**Data:** 2026-05-17  
**Tipo:** integração runtime + DTO  
**Contrato:** [`docs/operational-executable-strategy-contract.md`](../operational-executable-strategy-contract.md)

---

## Resumo

O OES (Slice 1) passou a ser gerado automaticamente pelo Strategy Runtime, persistido em `strategy/operational-executable-strategy.json`, e exposto no `StrategyBundleDto` via API `GET /runs/:id/strategy`. Subtasks do bundle são enriquecidas a partir do OES num único módulo de projeção. Runs legados degradam sem quebrar. UI, aprovação e execução **não** foram alterados no comportamento.

---

## Integração realizada

### Runtime hook

Após `applySharedContextRefsToSubtasks` e antes de `buildStrategyReadiness`:

- `buildOperationalExecutableStrategy({ write: true })`
- Artefacto incluído em `strategy-manifest` / lista `genArtifacts`
- Evento de diagnóstico: `operational_executable_strategy_completed`
- Falha OES **não bloqueia** o pipeline (warnings apenas)

**Ficheiro:** `scripts/runtime/strategy-runtime/run-strategy-runtime.js`

### API / collect bundle

`collectStrategyBundle` (`scripts/daemon/lib/run-strategy.js`):

1. `loadOrBuildOperationalExecutableStrategy` — lê disco ou constrói on-the-fly
2. `mapOperationalExecutableStrategyDto` — projeção única
3. `enrichSubtasksFromOesDto` / `enrichOrderingFromOesDto` — enriquece subtasks/ordering legados

**Sem** segunda heurística no frontend para reconstruir estratégia.

### Módulos centrais novos

| Módulo | Função |
|--------|--------|
| `core/load-operational-executable-strategy.js` | Carregar ou construir OES; `resolvePlanVersionFromOutput` |
| `core/map-operational-executable-strategy-dto.js` | Projeção canónica → DTO API/frontend |

### Projeção humana (prep Slice 3)

`operational-plan-humanize.ts` passa a preferir `strategy.executableStrategy` para:

- `buildHumanExecutionStrategy` (ordem, dependências, padrão)
- `buildHumanMiniTasksSection` (IDs `mini-*`, títulos reais)

Sem alteração visual pesada em componentes.

---

## DTOs alterados

### Backend (JSON API)

Campo novo em `data`:

```json
"executableStrategy": {
  "available": true,
  "degraded": false,
  "planVersion": "v1",
  "strategySha256": "...",
  "miniTasks": [ ... ],
  "expectedImpact": { ... },
  "approvalState": { "approved": false, "strategySha256": "..." }
}
```

Subtasks enriquecidas com: `miniTaskId`, `objective`, `scope`, `affectedFiles`, `acceptanceCriteria`, `completionCriteria`, `validationHints`, `complexity`, `risk`.

### Frontend TypeScript

`frontend/lib/runtime/strategy/strategy-types.ts`:

- `OperationalExecutableStrategyDto` e tipos associados
- `StrategyBundleDto.executableStrategy`
- Campos opcionais ricos em `StrategySubtaskDto`

`frontend/lib/runtime/strategy/strategy-adapters.ts`:

- `mapExecutableStrategy`
- `mapSubtasks` com campos ricos
- `buildUnsupportedStrategyBundle` → `executableStrategy: null`

---

## Compatibilidade

| Cenário | Comportamento |
|---------|----------------|
| Run sem strategy/ | `executableStrategy.available === false`; bundle `unsupported` ou degradado |
| Run legado só com plano | OES construído degradado; `ok: true`; mini-tasks do plano |
| Run com strategy sem OES em disco | `loadOrBuild` gera OES sem write (GET) ou runtime já gravou |
| Approval / execução | Inalterados |
| Strategy panel | Continua a funcionar; dados mais ricos quando OES existe |

---

## Testes

```bash
node --test core/build-operational-executable-strategy.test.js \
  scripts/daemon/lib/run-strategy.test.js \
  scripts/runtime/strategy-runtime/run-strategy-runtime.test.js
```

| Teste | Valida |
|-------|--------|
| `runStrategyRuntimeBase` | Gera `operational-executable-strategy.json`, miniTasks, hash, `subtaskId` |
| `collectStrategyBundle` (rich fixture) | DTO com `executableStrategy`, subtasks enriquecidas, deps humanas |
| `collectStrategyBundle` (legado) | `degraded: true`, sem crash |
| Slice 1 golden | Mantidos |

`translate-operational-plan.test.ts` — continua a passar com `executableStrategy: null`.

---

## Arquivos alterados / criados

| Arquivo | Alteração |
|---------|-----------|
| `core/load-operational-executable-strategy.js` | Novo |
| `core/map-operational-executable-strategy-dto.js` | Novo |
| `core/build-operational-executable-strategy.js` | `subtaskId` em miniTasks |
| `scripts/runtime/strategy-runtime/run-strategy-runtime.js` | Hook OES |
| `scripts/daemon/lib/run-strategy.js` | DTO + enrich |
| `frontend/lib/runtime/strategy/strategy-types.ts` | Tipos OES |
| `frontend/lib/runtime/strategy/strategy-adapters.ts` | Mapeamento API |
| `frontend/lib/runtime/operational/operational-plan-humanize.ts` | Prefere OES |
| `frontend/lib/mocks/strategy.ts` | `executableStrategy: null` |
| Testes + `package.json` | Novos casos |

---

## Próximos passos (Slice 3)

1. **UI** — Secção «Estratégia de execução» em `OperationalPlanDocument` (cards por mini-task, impacto, deps).
2. **Timeline** — Mostrar `planVersion` + `strategySha256` na timeline cumulativa.
3. **Comentários (Slice 4)** — Regenerar OES após plano vN+1.
4. **Aprovação** — CTA único + `strategy_sha256` em `approval-state.json`.

---

## Diagrama de fluxo (pós-Slice 2)

```
Strategy Runtime
  → subtasks/*.json + execution-order + …
  → buildOperationalExecutableStrategy (write)
  → strategy/operational-executable-strategy.json

GET /runs/:id/strategy
  → collectStrategyBundle
  → mapOperationalExecutableStrategyDto
  → enrichSubtasksFromOesDto
  → frontend StrategyBundleDto.executableStrategy
  → translateOperationalPlan (humanize usa OES)
```
