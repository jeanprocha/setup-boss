# Relatório — Estratégia operacional executável (Slice 1)

**Data:** 2026-05-17  
**Tipo:** implementação base (sem UI / sem fluxo)  
**Contrato:** [`docs/operational-executable-strategy-contract.md`](../operational-executable-strategy-contract.md)

---

## Resumo

Implementada a base técnica do artefacto **Operational Executable Strategy (OES)**: builder central, hash estável, fallbacks para runs legados, fixtures golden e testes. **Nenhuma alteração** em UI, aprovação, execução ou Strategy Runtime automático.

---

## Decisões aplicadas

| Decisão | Valor |
|---------|--------|
| Path canónico | `strategy/operational-executable-strategy.json` |
| ID mini-task | `mini-{order}-{slug}` |
| `affectedComponents` | Heurística path + basename PascalCase + domínio |
| Aprovação futura | Um CTA (plano + estratégia) — não implementado neste slice |
| Runs legados | `ok: true`, `degraded: true`, fallback a partir do plano refinado |

---

## O que foi implementado

### Builder central

`core/build-operational-executable-strategy.js`

- Lê `strategy/subtasks/*.json`, `execution-order.json`, `ai-strategy.json`, `decomposition.json`, `complexity-analysis.json`, `task-plan-refined.md`
- Monta `OperationalExecutableStrategy` com mini-tasks ricas (objective, scope, files, domains, deps, complexity, risk, critérios, validationHints)
- `macroOrder`, `dependencies`, `expectedImpact`, `executionPattern`, `validationApproach`
- `computeStrategySha256` com `stableStringify` (exclui `approvalState`, `generatedAt`, `provenance`, `runId`, `sourcePlanSha256`)
- `writeOperationalExecutableStrategy` para persistir no path canónico (opt-in via `write: true`)
- Runs sem subtasks: não falha; degrada com passos do plano ou artefacto mínimo

### Testes golden

`core/build-operational-executable-strategy.test.js` + fixtures em `core/fixtures/operational-executable-strategy/`:

| Caso | Fixture | Resultado |
|------|---------|-----------|
| Estratégia rica | `rich-complete/` | 3 mini-tasks, deps, hash, write em disco |
| Parcial | `partial/` | Fallbacks objective/complexity/criteria |
| Legado | `legacy/` | `ok`, `degraded`, mini-tasks do plano |
| Hash | rich-complete | Determinístico; título alterado muda hash |

---

## Arquivos criados / alterados

| Arquivo | Ação |
|---------|------|
| `core/build-operational-executable-strategy.js` | Criado |
| `core/build-operational-executable-strategy.test.js` | Criado |
| `core/fixtures/operational-executable-strategy/**` | Criado |
| `docs/operational-executable-strategy-contract.md` | Decisões fechadas + status |
| `docs/reports/2026-05-17-operational-executable-strategy-slice1.md` | Este relatório |
| `package.json` | Teste adicionado ao script `npm test` |

**Não alterados:** UI, `approval.js`, `run-strategy-runtime.js`, execução, `validate-mini-activity` (materialização).

---

## Testes

```bash
node --test core/build-operational-executable-strategy.test.js
```

6 testes, 0 falhas.

---

## Schema do artefacto (Slice 1)

Campos principais persistidos em `strategy/operational-executable-strategy.json`:

- `version` (número `1`)
- `planVersion` / `sourcePlanVersion` (strings `v1`, `v2`, …)
- `orderingMode`, `executionPattern`, `macroOrder`, `dependencies`, `validationApproach`
- `expectedImpact` (files, components, modules, riscos)
- `miniTasks[]` com IDs `mini-NNN-slug`
- `approvalState.approved` (sempre `false` até Slice de aprovação)
- `approvalState.strategySha256`
- `provenance` (auditoria; excluída do hash)

---

## Próximos slices

| Slice | Entrega |
|-------|---------|
| **2** | Enriquecer `mapSubtasks` / `StrategyBundleDto`; expor OES na API |
| **3** | Secção estratégia em `OperationalPlanDocument` |
| **4** | Comentário → regen OES + timeline vN |
| **5** | Handoff `miniActivities` (`mini-{order}-{slug}` → `miniActivityId`) |
| **Aprovação** | CTA único + `strategy_sha256` em `approval-state.json` |

### Integração pendente (não feita no Slice 1)

Chamar o builder após `runStrategyRuntimeBase` e/ou no endpoint de strategy — apenas quando Slice 2 for iniciado.

---

## Riscos residuais

- Decomposição heurística continua fraca; OES reflecte o que existe em `subtasks/*.json`.
- `affectedComponents` pode gerar falsos positivos em domínios genéricos (`frontend`).
- Hash não inclui `plan_sha256` até aprovação unificada (Slice futuro).
