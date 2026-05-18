# Fase D — Single Source of Truth do plano operacional pós-comentário

**Data:** 2026-05-18  
**Base:** [2026-05-18-discovery-plano-v2-browser-regressao-pos-fases-abc.md](./2026-05-18-discovery-plano-v2-browser-regressao-pos-fases-abc.md)

---

## 1. Resumo executivo

Implementada a **fonte única canonicalizada** do plano v1 em `plan-presentation-base.json` no `outputDir` da run. O fluxo de comentário no servidor passa a preferir este snapshot em vez de reconstruir apenas a partir de markdown quando o ficheiro existe. A UI persiste o plano exibido (`translateOperationalPlan` + polish) via `PUT /runs/:id/plan-presentation-base` ao entrar na fase de aprovação (plano v1 ativo).

**Fora de escopo desta fase (conforme pedido):** invalidação de `sessionStorage`, versionamento de artefatos stale, regen automática no cliente, polish defensivo no browser.

---

## 2. Causa raiz endereçada

| Antes | Depois |
|-------|--------|
| UI: `translateOperationalPlan` | UI grava o mesmo objeto canonicalizado em disco |
| Servidor: `loadBasePlanPresentation` ← markdown | Servidor: cadeia de comentários → **snapshot** → markdown (fallback) |
| Merge de comentário com base diferente da vista pelo utilizador | Merge usa `plan-presentation-base.json` quando existir |

---

## 3. Arquivos alterados / criados

| Ficheiro | Papel |
|----------|--------|
| `core/plan-presentation-base-snapshot.js` | Leitura/escrita do snapshot (`schemaVersion`, `canonicalized`, `presentation`) |
| `core/load-base-plan-presentation.js` | Ordem: cadeia v2 → snapshot → markdown + bootstrap automático |
| `scripts/daemon/lib/run-plan-presentation-base.js` | Handlers GET/PUT para API |
| `scripts/daemon/runtime-api.js` | Rotas `GET/PUT /runs/:id/plan-presentation-base` |
| `frontend/lib/api/client.ts` | `runtimePutJson` |
| `frontend/lib/runtime/operational/plan-presentation-base-actions.ts` | `persistPlanPresentationBaseSnapshot` |
| `frontend/components/features/planning/ApprovalPhasePanel.tsx` | `useEffect` persiste v1 quando `activePlanVersion === 1` |
| `core/plan-presentation-base-snapshot.test.js` | Testes de persistência do snapshot |
| `core/load-base-plan-presentation.snapshot.test.js` | Testes SSOT + v2 pós-comentário |

---

## 4. Estratégia

### 4.1 Formato `plan-presentation-base.json`

```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-05-18T…",
  "canonicalized": true,
  "source": "ui",
  "planVersion": 1,
  "presentation": { … }
}
```

A `presentation` é sempre passada por `sanitizeUpdatedPlanPresentation` (polish + Fases A/B/C).

### 4.2 Ordem em `loadBasePlanPresentation`

1. Último `updated-plan.json` de comentários anteriores (cadeia v2+).
2. **`plan-presentation-base.json`** (SSOT v1).
3. Markdown + clarificação (legado); ao construir, **grava** snapshot (`source: legacy-bootstrap`).

### 4.3 Fluxo UI

```
translateOperationalPlan → polish (já existente)
        ↓
ApprovalPhasePanel (v1 ativo)
        ↓
PUT /runs/:id/plan-presentation-base { presentation }
        ↓
plan-presentation-base.json
        ↓
POST plan-comments → loadBasePlanPresentation → merge v2
```

### 4.4 Compatibilidade

Runs antigas sem snapshot: primeira chamada a `loadBasePlanPresentation` gera snapshot a partir de markdown (bootstrap), depois reutiliza.

---

## 5. Testes

```bash
node --test core/plan-presentation-base-snapshot.test.js \
  core/load-base-plan-presentation.snapshot.test.js \
  core/load-base-plan-presentation.test.js
```

**8/8 pass.**

Cenários cobertos:

| Teste | Assert |
|-------|--------|
| Escrita snapshot | `schemaVersion`, `canonicalized`, ficheiro no disco |
| Leitura | tema, `outOfScope`, `complexity.medium` |
| Preferência snapshot vs markdown pobre | snapshot vence |
| v2 após comentário botão | tema, OOS, média, critérios com tema |
| Bootstrap legado | cria `plan-presentation-base.json` se ausente |
| Regressão `load-base-plan-presentation.test.js` | fluxo markdown anterior intacto |

---

## 6. Próximas fases (não implementadas aqui)

| Fase | Conteúdo |
|------|----------|
| E | Endurecer `planV2NeedsRegeneration` + regen/polish no cliente |
| F | `planSchemaVersion` em `updated-plan.json` + invalidação de stale |
| G | E2E browser/API com cenário chat + botão |

---

## 7. Riscos de regressão

- **Primeira visita offline:** persistência PUT falha silenciosamente; servidor usa bootstrap legado (markdown) até UI sincronizar.
- **Snapshot desatualizado:** se estratégia/clarificação mudar após snapshot sem novo PUT, base pode ficar antiga — mitigação futura: bump de hash ou re-persist em mudança de bundle.
- **Runs só servidor:** sem UI, bootstrap legado continua (comportamento anterior melhorado com auto-persist).

---

## 8. Validação manual sugerida

1. Abrir run na fase de aprovação (plano v1 com tema/OOS/média).
2. Confirmar `plan-presentation-base.json` no `outputDir`.
3. Comentar: «criar também componente de botão que vai abrir/fechar o chat».
4. Verificar v2: tema, fora do escopo, complexidade média, botão no escopo.

Se existir `updated-plan.json` antigo de sessão anterior, limpar artefato + `sessionStorage` (Fase E/F) antes de validar comportamento novo.
