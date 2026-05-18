# Phase 4 — Governance Structure Validation

**Execução:** 2026-05-16T13:15:00 (local)  
**Âmbito:** validação da estrutura governada `.IA` SPEC v1.0 (após Git + seed).

## Objetivo

Garantir que projectos com seed válido possuem domínios core, indexes obrigatórios e bootstrap prompts apenas em `docs/.IA/system/`, bloqueando execução antes da criação da run.

## Arquivos alterados

| Arquivo | Alteração |
|---------|-----------|
| `core/validate-ia-governance-structure.js` | **Novo** — validação estrutura + ownership bootstrap |
| `core/validate-project-knowledge-base.js` | Integração pós-seed (estrutura → ownership → OK) |
| `core/validate-project-knowledge-base.test.js` | Testes integrados + `gitTrackCompliantIa` |
| `core/validate-ia-governance-structure.test.js` | **Novo** — testes unitários governance |
| `core/pre-run-error.js` | Catálogo + enrich para INVALID_STRUCTURE / BOOTSTRAP_OWNERSHIP |
| `core/pre-run-error.test.js` | Contrato enrich estrutura |
| `scripts/daemon/lib/pre-run-observability.js` | Traces `knowledge_governance_structure_failed` / `knowledge_bootstrap_ownership_failed` |
| `scripts/daemon/lib/run-intake-api.js` | Propagação campos estrutura no pre-run |
| `scripts/daemon/runtime-api.js` | HTTP 400 para novos códigos |
| `scripts/daemon/lib/run-intake-api.test.js` | Teste integração INVALID_STRUCTURE |
| `scripts/test-helpers/ensure-docs-ia-dir.js` | `ensureGovernanceStructure` (indexes core) |
| `frontend/lib/runtime/intake/pre-run-error.ts` | UX + helpers `intakeMissingDirectories`, etc. |
| `frontend/lib/runtime/intake/pre-run-error.test.ts` | Testes frontend estrutura/ownership |
| `frontend/components/features/intake/TaskComposer.tsx` | Listas inline pastas/indexes/bootstrap |
| `frontend/components/features/observability/PreRunDiagnosticEventCard.tsx` | Mesmas listas em observabilidade |
| `frontend/lib/runtime/intake/intake-adapters.ts` | Códigos KB novos |

## Regras implementadas

**Domínios core (diretório + index tracked e no disco):**

| Domínio | Index obrigatório |
|---------|-------------------|
| `docs/.IA/system/` | `index-system.md` |
| `docs/.IA/architecture/` | `index-architecture.md` |
| `docs/.IA/environment/` | `index-environment.md` |
| `docs/.IA/standards/` | `index-standards.md` |
| `docs/.IA/prompts/` | `index-prompts.md` |

**Erro `KNOWLEDGE_BASE_INVALID_STRUCTURE`** — faltam domínio(s) ou index(es).  
Campos: `missingDirectories`, `missingIndexFiles`, `requiredDirectories`, `requiredIndexFiles`.

**Erro `KNOWLEDGE_BASE_BOOTSTRAP_OWNERSHIP_VIOLATION`** — `bootstrap-discovery.md` / `bootstrap-create.md` fora de `docs/.IA/system/`.  
Campos: `invalidBootstrapFiles`, `allowedBootstrapFiles`.

**Ordem de validação (com Git tracked):** seed → estrutura → ownership → OK.

**Fase pública pre-run:** `validate_knowledge_structure`.

## Testes executados

```bash
node --test core/validate-project-knowledge-base.test.js \
  core/validate-ia-governance-structure.test.js core/pre-run-error.test.js \
  scripts/daemon/lib/pre-run-observability.test.js scripts/daemon/lib/run-intake-api.test.js

node --experimental-strip-types --test frontend/lib/runtime/intake/pre-run-error.test.ts
```

**Resultado:** 49 + 5 testes, todos passaram.

## Limitações

- Não valida conteúdo semântico dos indexes nem densidade de domínios opcionais.
- Scan de bootstrap no disco limitado a profundidade 6 sob `docs/.IA`.
- Domínios opcionais (`decisions/`, `runbooks/`, etc.) não são exigidos nesta fase.
- Sem auto-fix nem migrations.

## Resultado final

A `.IA` compliant exige seed v1.0 **e** estrutura governada core **e** ownership correcto dos bootstrap prompts. Falhas aparecem em pre-run diagnostics, runtime trace e UI de intake/observabilidade, com draft preservado e acções sugeridas por código de erro.
