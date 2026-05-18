# Fase C — Complexidade coerente para tarefas visualOnly

**Data:** 2026-05-18  
**Base:** `docs/reports/2026-05-18-discovery-plano-v2-pos-comentario-bugs-restantes.md`  
**Pré-requisitos:** Fases A e B

---

## Heurística antiga (problema)

Em `canonicalize-operational-plan.js`, `inferComplexity` usava score aditivo:

```text
score = deliverableCount + integrate + responsive + theme
high se score >= 5 OU deliverableCount >= 4
```

**Caso chat + botão + integração + responsividade + tema:**

| Fator | Pontos |
|-------|--------|
| deliverableCount (3) | 3 |
| integrate | 1 |
| responsive | 1 |
| theme | 1 |
| **Total** | **6 → alta** |

Problemas:

- Dupla contagem: chat + botão + integração implícita somavam como entregáveis separados **e** flag `integrate`.
- Validações de qualidade (tema/responsividade) tinham o mesmo peso que entregáveis funcionais.
- `visualOnly` não limitava o teto da complexidade.

---

## Nova estratégia de scoring

Módulo central: **`core/infer-operational-plan-complexity.js`**

### 1. Elevação para **alta** (antes do cap visual)

- **Funcional no escopo:** backend, WebSocket, persistência, tempo real, microserviços, etc. (`hasFunctionalWorkInScope`).
- **UI avançada:** canvas, drag-and-drop, virtualização, editor rico, sincronização pesada, etc. (`hasAdvancedUiSignals`).

### 2. Cap **visualOnly**

Se `visualOnly === true` e sem sinais acima:

- Peso de entregáveis UI com `visualDeliverableWeight` (chat + botão + integração sem triplicar).
- Peso moderado para qualidade: responsividade + tema (+ reutilização) somam no máximo ~0,85.
- **Teto: `medium`** (exceto UI mínima → `low`).

### 3. Justificativa textual

Para `medium` visualOnly qualificado, o motivo inclui:

```text
…, sem backend, persistência ou comunicação em tempo real
```

via `buildReasonFromFactors(..., { visualOnlyQualified: true })` em `operational-plan-complexity.js`.

### 4. Escopos não visuais

Mantém scoring legado moderado (sem cap visual), ainda sem inflar só por tema/responsividade.

---

## Arquivos alterados

| Arquivo | Alteração |
|---------|-----------|
| `core/infer-operational-plan-complexity.js` | **Novo** — scoring, cap visualOnly, detecção alta funcional/UI avançada |
| `core/infer-operational-plan-complexity.test.js` | **Novo** — 9 cenários Fase C |
| `core/canonicalize-operational-plan.js` | Delega a `inferCanonicalComplexity` |
| `core/operational-plan-complexity.js` | `buildReasonFromFactors` com qualificador visualOnly |
| `core/render-operational-plan-humanized.js` | Propaga `visualOnlyQualified` |
| `core/canonicalize-operational-plan.test.js` | Espera **média** no cenário chat |
| `core/canonicalize-operational-plan.phase-b.test.js` | Assert de complexidade medium |

**Não alterado:** multi-átomos, outOfScope, critérios, formatação de frase (Fase A), merge semântico (Fase B).

---

## Testes executados

```bash
node --test \
  core/infer-operational-plan-complexity.test.js \
  core/canonicalize-operational-plan.test.js \
  core/canonicalize-operational-plan.phase-b.test.js \
  core/polish-operational-plan-presentation.test.js \
  core/generate-full-updated-plan-presentation.test.js \
  core/operational-plan-complexity.test.js \
  core/normalize-operational-plan-structure.test.js \
  scripts/runtime/plan-comment/generate-updated-plan-heuristic.test.js \
  frontend/lib/runtime/operational/operational-plan-complexity.test.ts
```

**Resultado:** todos pass.

### Casos obrigatórios

| Cenário | Resultado |
|---------|-----------|
| Chat + botão + tema + responsividade | `medium` |
| UI visual mínima (só chat) | `low` |
| Backend + WebSocket no escopo | `high` |
| Persistência + sincronização | `high` |
| Canvas / drag-and-drop | `high` |
| Só responsividade + tema (visualOnly) | `medium` (nunca `high`) |

---

## Resultado esperado (cenário chat)

**Complexidade:** Média

**Motivo (armazenado):**

```text
envolve criação de componentes visuais reutilizáveis, integração na tela de Integrações, validação de responsividade, validação de tema claro/escuro, sem backend, persistência ou comunicação em tempo real
```

**Frase na UI:**

```text
A tarefa foi avaliada como média porque envolve criação de componentes visuais reutilizáveis, integração na tela de Integrações, validação de responsividade, validação de tema claro/escuro, sem backend, persistência ou comunicação em tempo real.
```

---

## Critérios de conclusão

| Critério | Estado |
|----------|--------|
| Chat visual + botão deixa de ser alta | OK |
| visualOnly com scoring coerente | OK |
| Backend/realtime/UI avançada ainda geram alta | OK |
| Sem regressão Fases A/B | OK |
| Explicações humanizadas com qualificador | OK |
