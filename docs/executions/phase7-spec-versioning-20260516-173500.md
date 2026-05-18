# Phase 7 — Spec Versioning

**Execução:** 2026-05-16T17:35:00 (local)  
**Âmbito:** detecção e validação da versão SPEC declarada em `docs/.IA/index.md`.

## Objetivo

Preparar o runtime para entender versões da SPEC `.IA`, com suporte oficial à **v1.0**, sem migrations nem auto-fix.

## Regra de versão

| Situação | Código | Fase |
|----------|--------|------|
| Linha `Version:` ausente em `docs/.IA/index.md` | `KNOWLEDGE_BASE_VERSION_MISSING` | `validate_knowledge_spec_version` |
| Valor malformado (ex.: `abc`) | `KNOWLEDGE_BASE_VERSION_INVALID` | `validate_knowledge_spec_version` |
| Versão válida mas não suportada (ex.: `2.0`) | `KNOWLEDGE_BASE_UNSUPPORTED_VERSION` | `validate_knowledge_spec_version` |
| `Version: 1.0` (ou `**Version:** 1.0`) | OK | — |

**Versões suportadas:** `1.0` apenas.

**Ordem de validação (tracked):** Git → Seed → **Spec Version** → Structure → Drift → OK.

## Arquivos alterados

| Arquivo | Alteração |
|---------|-----------|
| `core/validate-ia-spec-version.js` | **Novo** — parser + `validateIaSpecVersion` + failures |
| `core/validate-ia-spec-version.test.js` | **Novo** — 9 testes unitários |
| `core/validate-project-knowledge-base.js` | Integração pós-seed, `specVersion` no OK |
| `core/validate-project-knowledge-base.test.js` | Testes VERSION_MISSING / UNSUPPORTED + index com Version |
| `core/ia-validation-diagnostics.js` | Check `version`, secção `version`, `specVersion` detectada |
| `core/ia-validation-diagnostics.test.js` | Teste versão em iaValidation |
| `core/pre-run-error.js` | Catálogo + enrich `specVersion` / `supportedVersions` |
| `scripts/daemon/lib/pre-run-observability.js` | Evento `knowledge_spec_version_failed` |
| `scripts/daemon/lib/pre-run-observability.test.js` | Trace UNSUPPORTED_VERSION |
| `scripts/daemon/lib/run-intake-api.js` | Propagação campos versão |
| `scripts/daemon/runtime-api.js` | HTTP 400 para códigos VERSION_* |
| `scripts/test-helpers/ensure-docs-ia-dir.js` | `index.md` com `Version: 1.0` |
| `core/validate-ia-governance-structure.test.js` | Fixtures com versão |
| `core/validate-ia-structural-drift.test.js` | Fixtures com versão |
| `frontend/lib/runtime/intake/ia-validation.ts` | Tipo `version` + `supportedVersions` |
| `frontend/lib/runtime/intake/pre-run-error.ts` | UX versão + campos parse |
| `frontend/lib/runtime/intake/pre-run-error.test.ts` | Teste UNSUPPORTED_VERSION |
| `frontend/lib/runtime/intake/intake-adapters.ts` | Códigos VERSION_* |
| `frontend/components/features/observability/IaValidationDiagnosticSections.tsx` | Secção Version colapsável |

## Testes executados

```bash
node --test core/validate-ia-spec-version.test.js core/ia-validation-diagnostics.test.js \
  core/validate-project-knowledge-base.test.js scripts/daemon/lib/pre-run-observability.test.js

node --experimental-strip-types --test frontend/lib/runtime/intake/pre-run-error.test.ts
```

**Resultado:** 54 + 8 testes, todos passaram.

## Limitações

- Apenas SPEC **1.0** suportada; sem matrix de compatibilidade nem upgrade automático.
- Parser limitado à linha `Version:` no `index.md` (aceita markdown bold).
- `iaValidation.specVersion` reflecte a versão **detectada**; em falhas Git/seed anteriores fica `null`.
- Sem validação semântica do restante do `index.md`.

## Resultado final

O runtime valida a versão declarada antes de estrutura e drift, bloqueia versões ausentes/inválidas/não suportadas com diagnóstico consolidado (`iaValidation` com check `version`), traces `knowledge_spec_version_failed` e UI com título *"Versão da SPEC `.IA` inválida"* e cópia de diagnóstico completa.
