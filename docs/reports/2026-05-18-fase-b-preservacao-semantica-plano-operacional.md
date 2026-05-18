# Fase B — Preservação semântica do plano operacional pós-comentário

**Data:** 2026-05-18  
**Base:** `docs/reports/2026-05-18-discovery-plano-v2-pos-comentario-bugs-restantes.md`  
**Pré-requisito:** Fase A (`core/operational-plan-complexity.js`)

---

## Causa raiz (resumo)

| Problema | Causa |
|----------|--------|
| Perda de tema/reutilização | `parseLineToAtom` devolvia **1 átomo/linha**; linhas compostas perdiam sinais secundários |
| Flags incompletas | Tema só no `mainObjective` não gerava `task:validate_theme` |
| Fora do escopo vazio | `extractOutOfScope` ignorava `presentation.outOfScope`; `visualOnly` falso com `outOfScope: []` |
| Critérios sem tema | `flags.theme === false` na canonicalização |
| Validações ausentes em «O que será feito» | Texto da `approach` continha «tema/responsividade» e impedia linhas `Validar…` |

---

## Abordagem escolhida

### 1. Multi-átomos por linha

- `extractSemanticSignalAtoms` — extrai `reusable`, `responsive`, `theme` da linha **inteira** (regex, sem split por vírgula).
- `parseLineToAtomPrimary` — entregável/exclusão/anexo (lógica anterior, sem sinais duplicados).
- `parseLineToAtoms` — união de sinais + primário, depois `mergeAtomsByKind`.
- `parseLineToAtom` mantido para compatibilidade (retorna o átomo prioritário).

### 2. Flags reforçadas

- `buildFlags(atoms, visualOnly, sourceLines)` varre **todo o corpus** (objetivo, critérios, escopo, etc.) além dos átomos.

### 3. Fora do escopo preservado

- `extractOutOfScope(atoms, visualOnly, originalOutOfScope)`:
  1. Normaliza entradas do array original (átomos `scope_out:*` ou texto normalizado).
  2. Mescla átomos de exclusão do parse.
  3. Aplica defaults visuais **sem sobrescrever** entradas existentes.

### 4. `detectVisualOnlyScope` ampliado

- Chat/UI visual **sem** backend no escopo → `visualOnly` mesmo com `outOfScope: []` → defaults seguros.

### 5. Renderização

- Bloqueio de `approach` como entregável genérico no parse.
- `renderDeliverables` só considera linhas `Validar…` explícitas antes de omitir validações.

**Fora de escopo (Fase B):** inferência/score de complexidade (Fase C).

---

## Arquivos alterados

| Arquivo | Alteração |
|---------|-----------|
| `core/normalize-operational-plan-structure.js` | Multi-átomos, sinais semânticos, filtro de approach |
| `core/normalize-operational-plan-structure.test.js` | Testes de linha composta |
| `core/normalize-operational-plan-language.js` | `detectVisualOnlyScope` ampliado |
| `core/canonicalize-operational-plan.js` | `parseLineToAtoms`, `buildFlags`+corpus, `extractOutOfScope`+merge |
| `core/render-operational-plan-humanized.js` | Checagem de linhas `Validar…` |
| `core/canonicalize-operational-plan.test.js` | Assert de critério de tema |
| `core/canonicalize-operational-plan.phase-b.test.js` | **Novo** — cenários obrigatórios Fase B |

---

## Testes executados

```bash
node --test \
  core/normalize-operational-plan-structure.test.js \
  core/canonicalize-operational-plan.test.js \
  core/canonicalize-operational-plan.phase-b.test.js \
  core/polish-operational-plan-presentation.test.js \
  core/generate-full-updated-plan-presentation.test.js \
  core/operational-plan-complexity.test.js \
  scripts/runtime/plan-comment/generate-updated-plan-heuristic.test.js \
  frontend/lib/runtime/operational/operational-plan-complexity.test.ts
```

**Resultado:** 35 testes, 35 pass. Sem regressão da Fase A.

### Cenários Fase B cobertos

1. Linha composta → `flags.theme`, critério de tema  
2. Comentário botão → tema preservado no v1  
3. `outOfScope` do v1 mantido após comentário  
4. `outOfScope: []` → defaults (envio real, backend, persistência, WebSocket, IA/API)  
5. Critérios: desktop/mobile, tema, reutilização, botão  

---

## Critérios de conclusão

| Critério | Estado |
|----------|--------|
| Requisitos anteriores não desaparecem após comentário | OK |
| Tema claro/escuro preservado | OK |
| Fora do escopo não some indevidamente | OK |
| Critérios refletem flags finais | OK |
| Merge preserva e expande contexto | OK |
| Fase A intacta | OK |
