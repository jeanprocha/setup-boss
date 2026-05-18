# Fase E — Regen defensivo + invalidação de planos stale

**Data:** 2026-05-18  
**Base:** [2026-05-18-discovery-plano-v2-browser-regressao-pos-fases-abc.md](./2026-05-18-discovery-plano-v2-browser-regressao-pos-fases-abc.md)  
**Depende de:** [Fase D — SSOT](./2026-05-18-fase-d-single-source-of-truth-plano-operacional.md)

---

## 1. Resumo executivo

Planos `updated-plan.json` antigos ou parciais deixam de ser aceites como válidos. O sistema detecta staleness (schema, canonicalização, tema, fora do escopo, complexidade, critérios) e **regenera ou re-polish automaticamente** no servidor. O cliente aplica polish defensivo e usa os mesmos critérios de regen via `planV2NeedsRegeneration` endurecido.

**Fora de escopo (conforme pedido):** invalidação de `sessionStorage`, `mergeRemoteThread`, cache frontend, E2E browser.

---

## 2. Causa raiz endereçada

| Problema | Correção |
|----------|----------|
| `planV2NeedsRegeneration` só verificava overlap superficial | Módulo `operational-plan-staleness.js` com 10+ critérios |
| JSON antigo idempotente nunca regenerava | `generateUpdatedPlanForComment` regen se stale |
| Leitura devolvia plano sem polish completo | `normalizeUpdatedPlanDoc` + repair em `readUpdatedPlan` |
| `schemaVersion` / `canonicalized` ausentes | `OPERATIONAL_PLAN_SCHEMA_VERSION = 2` em todos os artefatos |
| Cliente renderizava payload cru | `mapPresentation` → `sanitizeUpdatedPlanPresentation` |

---

## 3. Arquivos alterados / criados

| Ficheiro | Alteração |
|----------|-----------|
| `core/operational-plan-staleness.js` | **Novo** — detecção de stale + `planV2NeedsRegeneration` endurecido |
| `core/operational-plan-staleness.test.js` | **Novo** — testes de critérios + repair em disco |
| `core/generate-full-updated-plan-presentation.js` | Re-exporta `planV2NeedsRegeneration` do módulo staleness |
| `scripts/runtime/plan-comment/plan-comment-analysis-schema.js` | `schemaVersion`, `canonicalized`, `needsSchemaMigration` |
| `scripts/runtime/plan-comment/plan-comment-store.js` | `readUpdatedPlanRaw`, repair automático, migração schema |
| `scripts/runtime/plan-comment/generate-updated-plan.js` | Regen se stale; `regenerateStaleUpdatedPlanForComment` |
| `scripts/runtime/plan-comment/analyze-plan-comment.js` | Sempre gera/atualiza plano (sem skip por existente) |
| `core/plan-presentation-base-snapshot.js` | Schema v2 + migração na leitura |
| `frontend/lib/runtime/operational/plan-comment-actions.ts` | Polish + meta schema no regen cliente |
| `frontend/lib/runtime/operational/plan-comment-follow-up-types.ts` | Campos `schemaVersion`, `canonicalized` |

---

## 4. Estratégia

### 4.1 `planV2NeedsRegeneration` — critérios de regen

Regenera se qualquer um:

- `schemaVersion < 2` ou `canonicalized !== true`
- linhas meta/internas no plano
- perda de tema (base tinha, v2 não)
- `outOfScope` vazio com base rica (≥2 itens)
- `completionCriteria` sem tema quando base tinha
- critérios significativamente reduzidos
- `complexity.reason` ausente ou texto legado «A tarefa foi avaliada…»
- `visualOnly` + `complexity.level === high`
- base `medium` + v2 `high` em escopo visualOnly
- nenhum item do v1 preservado em `whatWillBeDone`

### 4.2 Fluxo servidor

```
readUpdatedPlan
  → normalize + polish
  → stale? → regenerateStaleUpdatedPlanForComment (se comment+analysis)
  → needsSchemaMigration? → rewrite com schema 2

generateUpdatedPlanForComment
  → existing + !stale → idempotente
  → stale ou ausente → regen + overwrite

GET plan-comments (listPlanCommentThreads)
  → cada thread passa por readUpdatedPlan (repair automático)
```

### 4.3 Fluxo cliente

```
mapUpdatedPlan → sanitizeUpdatedPlanPresentation
postPlanCommentAnalysis → regenerateUpdatedPlanIfNeeded(meta schema)
```

### 4.4 Schema persistido (`updated-plan.json`)

```json
{
  "schemaVersion": 2,
  "canonicalized": true,
  "commentId": "...",
  "planVersion": 2,
  "presentation": { ... }
}
```

---

## 5. Testes

```bash
node --test core/operational-plan-staleness.test.js \
  core/plan-presentation-base-snapshot.test.js \
  core/load-base-plan-presentation.snapshot.test.js \
  core/load-base-plan-presentation.test.js
```

| Cenário | Resultado |
|---------|-----------|
| schemaVersion 1 | exige regen |
| canonicalized false | exige regen |
| tema perdido | exige regen |
| outOfScope vazio | exige regen |
| visualOnly + high | exige regen |
| plano fresco v2 | não exige regen |
| `readUpdatedPlan` em JSON stale | repara → medium, OOS, tema, botão |
| `regenerateStaleUpdatedPlanForComment` | sobrescreve artefato |

---

## 6. Riscos

- **Regen em massa** na primeira leitura após deploy se muitas runs tiverem `updated-plan.json` pré-Fase E (comportamento desejado).
- **Dependência de comment.json + analysis** para repair automático — sem esses ficheiros, só migração schema/polish.
- **sessionStorage** ainda pode mostrar v2 antigo até Fase F — utilizador pode precisar refresh após servidor reparar.

---

## 7. Próxima fase sugerida (F)

- Invalidar `sessionStorage` / `mergeRemoteThread` quando remoto mais novo ou `schemaVersion` superior.
- E2E browser com cenário chat + botão.

---

## 8. Validação manual

1. Run com `updated-plan.json` antigo (high, sem tema, OOS vazio).
2. `GET /runs/:id/plan-comments` ou novo comentário.
3. Confirmar ficheiro reescrito com `schemaVersion: 2`, `canonicalized: true`, complexidade média, tema e OOS.
