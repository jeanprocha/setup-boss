# Phase 8 — Content Policy Validation

**Execução:** 2026-05-16T18:30:00 (local)  
**Âmbito:** validações leves de conteúdo da `.IA` (secrets + idioma) conforme SPEC v1.0.

## Objetivo

Adicionar detecção bloqueante de possíveis segredos e heurística de idioma (warning) na Knowledge Base, com diagnóstico estruturado (`iaValidation.policy`) e UI colapsável.

## Regras implementadas

| Regra | Código | Bloqueante | Fase |
|-------|--------|------------|------|
| Private key PEM, AWS key, password/token/secret/bearer assignments | `KNOWLEDGE_BASE_SENSITIVE_DATA` | Sim | `validate_knowledge_content_policy` |
| Excesso de stopwords PT/ES em `.md` | `KNOWLEDGE_BASE_LANGUAGE_WARNING` | Não (warning) | `validate_knowledge_content_policy` |

**Ordem de validação (tracked):** Git → Seed → Spec Version → Structure → Drift → **Content Policy** → OK.

**Payload secrets:** `matchedFiles`, `ruleIds`, `redactedSamples` (sempre mascarados, limite de matches).

**Payload language:** `suspectedFiles`, `confidence`, `sampleReason`.

## Arquivos alterados

| Arquivo | Alteração |
|---------|-----------|
| `core/validate-ia-content-policy.js` | **Novo** — scan de secrets + heurística de idioma |
| `core/validate-ia-content-policy.test.js` | **Novo** — 8 testes unitários |
| `core/validate-project-knowledge-base.js` | Integração pós-drift |
| `core/validate-project-knowledge-base.test.js` | Teste fake password bloqueia |
| `core/ia-validation-diagnostics.js` | Check `policy`, secção `policy`, warnings combinados |
| `core/ia-validation-diagnostics.test.js` | Testes policy fail / language warn / copy |
| `core/pre-run-error.js` | Catálogo SENSITIVE_DATA + LANGUAGE_WARNING + enrich |
| `scripts/daemon/lib/pre-run-observability.js` | Evento `knowledge_content_policy_failed` |
| `scripts/daemon/lib/run-intake-api.js` | Propagação campos policy |
| `scripts/daemon/runtime-api.js` | HTTP 400 para `KNOWLEDGE_BASE_SENSITIVE_DATA` |
| `frontend/lib/runtime/intake/ia-validation.ts` | Tipo `policy` |
| `frontend/lib/runtime/intake/ia-validation.test.ts` | **Novo** — parse policy |
| `frontend/lib/runtime/intake/pre-run-error.ts` | Códigos + títulos UX |
| `frontend/lib/runtime/intake/pre-run-error.test.ts` | Copy com policy |
| `frontend/lib/runtime/intake/intake-adapters.ts` | Códigos policy |
| `frontend/components/features/observability/IaValidationDiagnosticSections.tsx` | Secção Content Policy + blocos UX |

## Testes executados

```bash
node --test core/validate-ia-content-policy.test.js core/ia-validation-diagnostics.test.js core/validate-project-knowledge-base.test.js

node --experimental-strip-types --test frontend/lib/runtime/intake/pre-run-error.test.ts frontend/lib/runtime/intake/ia-validation.test.ts
```

**Resultado:** 49 + 10 testes, todos passaram.

## Limitações

- Heurística de idioma leve (stopwords PT/ES); sem NLP nem bloqueio por idioma.
- Scan limitado a ficheiros tracked sob `docs/.IA` (máx. ~48 ficheiros por run).
- Language warning não gera pre-run error; apenas `policyWarnings` no caminho OK.
- Sem auto-fix, migrations, health score ou anti-bloat semântico.
- Amostras de segredo nunca retornam valor bruto (redacção fixa).

## Resultado final

O runtime valida content policy após drift: secrets bloqueiam com `KNOWLEDGE_BASE_SENSITIVE_DATA`, diagnóstico consolidado (`iaValidation` com check `policy`, `secretScan`, `languageScan`), traces `knowledge_content_policy_failed` e UI com secção **Content Policy** (títulos SPEC para secrets e aviso de idioma). Cópia de diagnóstico inclui bloco `policy` completo.
