# Fase A — Correção da duplicação de complexidade no plano operacional

**Data:** 2026-05-18  
**Discovery:** `docs/reports/2026-05-18-discovery-plano-v2-pos-comentario-bugs-restantes.md`

---

## Causa raiz

Dois pontos montavam a mesma frase:

1. **Backend** (`renderComplexityExplanation` em `render-operational-plan-humanized.js`) persistia `complexity.explanation` já no formato completo: *«A tarefa foi avaliada como … porque …»*.
2. **UI** (`PlanComplexitySentence` em `PlanExecutionProfileBlock.tsx`) voltava a envolver `explanation` com o mesmo template.

Resultado na interface: *«… porque a tarefa foi avaliada como … porque …»*.

---

## Abordagem escolhida

**Responsabilidade única para a frase completa:** `formatComplexitySentence` em `core/operational-plan-complexity.js`.

**Formato interno canónico:**

```js
complexity: {
  level: "medium",
  levelLabelPt: "Média",
  reason: "envolve criação de componentes reutilizáveis, …",  // motivo puro
  explanation: "envolve …"  // legado — mesmo valor que reason
}
```

- `reason` / `explanation` **nunca** guardam o prefixo «A tarefa foi avaliada…».
- Planos antigos com `explanation` completa são normalizados via `extractComplexityReason` / `normalizeComplexityObject`.
- A UI chama apenas `formatOperationalPlanComplexitySentence(complexity)`.

---

## Arquivos alterados

| Arquivo | Alteração |
|---------|-----------|
| `core/operational-plan-complexity.js` | **Novo** — extract, build payload, format sentence, normalize |
| `core/operational-plan-complexity.test.js` | **Novo** — testes da Fase A |
| `core/render-operational-plan-humanized.js` | `renderComplexityReason` + `buildComplexityPayload` |
| `core/generate-full-updated-plan-presentation.js` | `buildComplexityReason` + payload canónico |
| `core/polish-operational-plan-presentation.js` | `normalizeComplexityObject` na saída |
| `core/load-base-plan-presentation.js` | v1 com `reason` + `explanation` |
| `core/canonicalize-operational-plan.test.js` | asserts em `reason` + `formatComplexitySentence` |
| `core/polish-operational-plan-presentation.test.js` | idem |
| `core/generate-full-updated-plan-presentation.test.js` | idem + anti-duplicação |
| `frontend/lib/runtime/operational/operational-plan-types.ts` | campo `reason` |
| `frontend/lib/runtime/operational/operational-plan-complexity.ts` | **Novo** — bridge TS → core |
| `frontend/lib/runtime/operational/operational-plan-complexity.test.ts` | **Novo** — UI |
| `frontend/components/features/planning/PlanExecutionProfileBlock.tsx` | frase via `formatOperationalPlanComplexitySentence` |
| `frontend/lib/runtime/operational/operational-plan-fallbacks.ts` | `reason` nos fallbacks |
| `frontend/lib/runtime/operational/translate-operational-plan.ts` | `reason` no map da strategy |
| `scripts/runtime/plan-comment/plan-comment-analysis-schema.js` | normalização ao mapear apresentação |

**Fora de escopo desta fase (conforme pedido):** inferência de complexidade, tema, fora do escopo, critérios, multi-átomos.

---

## Testes executados

```bash
node --test \
  core/operational-plan-complexity.test.js \
  core/generate-full-updated-plan-presentation.test.js \
  core/canonicalize-operational-plan.test.js \
  core/polish-operational-plan-presentation.test.js \
  scripts/runtime/plan-comment/generate-updated-plan-heuristic.test.js \
  frontend/lib/runtime/operational/operational-plan-complexity.test.ts
```

**Resultado:** 24 testes, 24 pass.

Cobertura principal:

1. `reason` puro em payload e plano v2 pós-polish  
2. `formatComplexitySentence` sem duplicação de prefixo  
3. Compatibilidade com `explanation` legada (simples e duplicada)  
4. Plano v2 heurístico (chat + botão)  
5. Fallback sem `reason`  
6. UI TypeScript com frase final correta  

---

## Exemplo

**Armazenado:**

```json
{
  "level": "high",
  "reason": "envolve integração visual e múltiplos componentes"
}
```

**Exibido (única montagem):**

```text
A tarefa foi avaliada como alta porque envolve integração visual e múltiplos componentes.
```

---

## Critérios de conclusão

| Critério | Estado |
|----------|--------|
| Sem duplicação na frase de complexidade na UI | OK |
| Frase completa montada num único ponto (`formatComplexitySentence`) | OK |
| Formato interno consistente (`reason` puro) | OK |
| Compatibilidade planos antigos | OK (`normalizeComplexityObject`) |
| Testes passando | OK |
| Sem regressão no restante do plano | OK (escopo limitado à complexidade) |
