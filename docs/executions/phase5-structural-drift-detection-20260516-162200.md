# Phase 5 — Structural Drift Detection

**Execução:** 2026-05-16T16:22:00 (local)  
**Âmbito:** detecção de drift estrutural da `.IA` SPEC v1.0 (após Git, seed e estrutura governada).

## Objetivo

Detectar drift estrutural simples na `.IA`, reportar em diagnostics, bloquear apenas drift crítico e manter UX clara — sem engine semântica, auto-fix ou health score.

## Drift checks implementados

| Check | Severidade | Comportamento |
|-------|------------|---------------|
| `.IA/` na raiz coexistindo com `docs/.IA/` | Crítico | Bloqueia (`KNOWLEDGE_BASE_STRUCTURAL_DRIFT`) |
| `bootstrap-*.md` fora de `docs/.IA/system/` | Crítico | Bloqueia |
| `docs/.IA/prompts/bootstrap-discovery.md` / `bootstrap-create.md` | Crítico | Bloqueia (via scan bootstrap) |
| Pastas desconhecidas em `docs/.IA/` | Warning | Permite execução |
| Ficheiros soltos na raiz de `docs/.IA/` (≠ `index.md`) | Warning | Permite execução |
| Domínio opcional sem `index-<folder>.md` | Warning | Permite execução |

**Códigos:** erro `KNOWLEDGE_BASE_STRUCTURAL_DRIFT`; avisos em `driftValidation.warnings` (não bloqueiam).

**Resultado estruturado (`driftValidation`):**

```json
{
  "driftValid": false,
  "criticalDrift": [],
  "warnings": [],
  "unknownFolders": [],
  "unexpectedRootFiles": [],
  "legacyIaPath": null,
  "duplicatedBootstrapPrompts": []
}
```

## Arquivos alterados

| Arquivo | Alteração |
|---------|-----------|
| `core/validate-ia-structural-drift.js` | **Novo** — `detectStructuralDrift`, `buildStructuralDriftFailure` |
| `core/validate-ia-structural-drift.test.js` | **Novo** — 8 testes unitários drift |
| `core/validate-project-knowledge-base.js` | Integração pós-estrutura; substitui ownership isolado por drift |
| `core/validate-project-knowledge-base.test.js` | Testes legado, unknown folder, root file |
| `core/pre-run-error.js` | Catálogo + enrich drift |
| `core/pre-run-error.test.js` | Contrato STRUCTURAL_DRIFT |
| `scripts/daemon/lib/pre-run-observability.js` | Trace `knowledge_structural_drift_failed`, metadata drift |
| `scripts/daemon/lib/pre-run-observability.test.js` | Teste diagnostics drift |
| `scripts/daemon/lib/run-intake-api.js` | Propagação campos drift no pre-run |
| `scripts/daemon/runtime-api.js` | HTTP 400 para `KNOWLEDGE_BASE_STRUCTURAL_DRIFT` |
| `frontend/lib/runtime/intake/pre-run-error.ts` | Helpers + UX drift |
| `frontend/lib/runtime/intake/pre-run-error.test.ts` | Teste frontend STRUCTURAL_DRIFT |
| `frontend/lib/runtime/intake/intake-adapters.ts` | Código KB drift |
| `frontend/components/features/intake/TaskComposer.tsx` | Listas drift crítico/warnings/legado |
| `frontend/components/features/observability/PreRunDiagnosticEventCard.tsx` | Mesmas listas em observabilidade |

## Ordem de validação (com Git tracked)

seed → estrutura governada → **drift estrutural** → OK (com `driftWarnings` se aplicável)

## Testes executados

```bash
node --test core/validate-ia-structural-drift.test.js \
  core/validate-project-knowledge-base.test.js core/pre-run-error.test.js \
  scripts/daemon/lib/pre-run-observability.test.js

node --experimental-strip-types --test frontend/lib/runtime/intake/pre-run-error.test.ts
```

**Resultado:** 46 + 6 testes, todos passaram.

## Limitações

- Não valida conteúdo semântico, idioma, secrets nem migrations.
- Scan de bootstrap limitado a profundidade 6 sob `docs/.IA`.
- Warnings não bloqueiam; não há auto-fix nem remoção de ficheiros.
- `KNOWLEDGE_BASE_BOOTSTRAP_OWNERSHIP_VIOLATION` mantido no catálogo para compatibilidade de traces antigos; fluxo novo usa `STRUCTURAL_DRIFT`.

## Resultado final

Drift crítico bloqueia a criação da run com título *"Drift estrutural detectado na `.IA`"* e diagnóstico copiável (crítico, bootstrap duplicados, caminho legado). Warnings aparecem sem bloquear. Draft do intake e observabilidade pre-run preservados.
