# Phase 3 — Required Seed Validation

**Execução:** 2026-05-16T13:01:12 (local)  
**Âmbito:** enforcement do seed mínimo obrigatório `.IA` SPEC v1.0 (após validação Git da Phase 2).

## Objetivo

Bloquear execução quando `docs/.IA` está versionada no Git mas não contém todos os ficheiros obrigatórios do seed v1.0.

## Arquivos alterados

| Arquivo | Alteração |
|---------|-----------|
| `core/validate-project-knowledge-base.js` | `REQUIRED_SEED_FILES`, `validateRequiredKnowledgeSeed`, `KNOWLEDGE_BASE_INVALID_SEED` |
| `core/validate-project-knowledge-base.test.js` | Testes seed completo, parcial e por ficheiro em falta |
| `core/pre-run-error.js` | Catálogo `KNOWLEDGE_BASE_INVALID_SEED`, `missingFiles` no enrich |
| `core/pre-run-error.test.js` | Contrato estruturado INVALID_SEED |
| `scripts/daemon/lib/pre-run-observability.js` | Trace `knowledge_seed_validation_failed`, metadata seed |
| `scripts/daemon/lib/pre-run-observability.test.js` | Teste evento/diagnostics seed |
| `scripts/daemon/lib/run-intake-api.js` | Propagação `missingFiles` / `requiredFiles` / `existingFiles` |
| `scripts/daemon/lib/run-intake-api.test.js` | Teste integração INVALID_SEED |
| `scripts/daemon/runtime-api.js` | HTTP 400 para `KNOWLEDGE_BASE_INVALID_SEED` |
| `scripts/test-helpers/ensure-docs-ia-dir.js` | `ensureRequiredKnowledgeSeed` (4 ficheiros) |
| `frontend/lib/runtime/intake/pre-run-error.ts` | Parse/render seed, `intakeMissingFiles` |
| `frontend/lib/runtime/intake/pre-run-error.test.ts` | Testes frontend INVALID_SEED |
| `frontend/lib/runtime/intake/intake-adapters.ts` | Código KB INVALID_SEED |
| `frontend/components/features/intake/TaskComposer.tsx` | Lista ficheiros em falta inline |
| `frontend/components/features/observability/PreRunDiagnosticEventCard.tsx` | Lista ficheiros em falta |

## Validators adicionados

- **`validateRequiredKnowledgeSeed(projectRootAbs, trackedFiles)`** — verifica os 4 paths SPEC v1.0 tracked **e** presentes no disco.
- **`buildInvalidSeedFailure(seed, docsIaPath)`** — erro `KNOWLEDGE_BASE_INVALID_SEED` com payload seed.

## Regras implementadas

**Seed obrigatório (SPEC v1.0):**

1. `docs/.IA/index.md`
2. `docs/.IA/system/seed-rules.md`
3. `docs/.IA/system/bootstrap-discovery.md`
4. `docs/.IA/system/bootstrap-create.md`

**Fluxo:**

1. Phase 2 (Git) passa → `git ls-files -- docs/.IA` não vazio.
2. Phase 3 (seed) → todos os obrigatórios tracked + ficheiro no disco.
3. Falha → `KNOWLEDGE_BASE_INVALID_SEED`, fase pública `validate_knowledge_seed`, trace `knowledge_seed_validation_failed`.

**Resultado estruturado (validação):**

```json
{
  "valid": false,
  "seedValid": false,
  "missingFiles": [],
  "requiredFiles": [],
  "existingFiles": []
}
```

(incluído em `details.seedValidation` e campos top-level no erro API)

## Testes executados

```bash
node --test core/validate-project-knowledge-base.test.js core/pre-run-error.test.js \
  scripts/daemon/lib/pre-run-observability.test.js scripts/daemon/lib/run-intake-api.test.js

node --experimental-strip-types --test frontend/lib/runtime/intake/pre-run-error.test.ts
```

**Resultado:** 38 + 3 testes, todos passaram.

## Limitações

- Valida apenas o seed mínimo v1.0 (4 ficheiros); domínios opcionais, governance structure, drift, index e language ficam fora de escopo.
- Exige ficheiro tracked **e** existente no working tree (coerente com Git da Phase 2).
- Teste frontend isolado com `node --experimental-strip-types`.

## Resultado final

O runtime deixa de aceitar “qualquer ficheiro tracked em `docs/.IA`” e exige o seed mínimo SPEC v1.0 antes de criar run. Erros pre-run, traces, diagnostics e UI mostram `missingFiles`, ações sugeridas e mantêm o draft do utilizador na tela de intake.
