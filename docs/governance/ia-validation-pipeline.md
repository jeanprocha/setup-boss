# `.IA` Governance Validation — Pipeline Operacional

Documentação operacional das validações core (Phases 2–8), consolidadas na Phase 9.

## Lifecycle

1. **Git / presença** — `validateProjectKnowledgeBase` (untracked, ignored, wrong path, not git).
2. **Contexto** — `buildIaGovernanceValidationContext`: um `git ls-files`, preload de conteúdos (até 48 ficheiros + `index.md`).
3. **Pipeline tracked** — `runIaGovernanceValidationPipeline` na ordem fixa abaixo.
4. **Diagnóstico** — `enrichPreRunError` + `iaValidation` + `validationSnapshot` em traces e intake.

## Ordem oficial dos validators

| Ordem | Stage | Módulo | Bloqueante |
|------:|-------|--------|------------|
| — | Git | `validate-project-knowledge-base` | Sim |
| 1 | seed | `validateRequiredKnowledgeSeed` | Sim |
| 2 | version | `validate-ia-spec-version` | Sim |
| 3 | structure | `validate-ia-governance-structure` | Sim |
| 4 | drift | `validate-ia-structural-drift` | Sim (crítico) / warn |
| 5 | policy | `validate-ia-content-policy` | Sim (secrets) / warn (idioma) |

## Runtime snapshot (`validationSnapshot`)

Presente em sucesso e falha do pipeline tracked:

```json
{
  "schemaVersion": "1.0",
  "ok": true,
  "specVersion": "1.0",
  "validationDurationMs": 42,
  "failedStage": null,
  "stages": [{ "id": "seed", "durationMs": 1, "status": "ok" }],
  "metrics": { "fileCount": 12, "markdownCount": 10, "contentScanMs": 8 },
  "summary": "Knowledge base ready"
}
```

Persistido em:

- resultado de `validateProjectKnowledgeBase`
- traces `knowledge_*_failed` / `knowledge_bootstrap_ready` (metadata)
- `compactDiagnosticEvent` / clipboard (`groupedDiagnostics`, `validationSnapshot`)

## Códigos `KNOWLEDGE_*`

| Código | Stage | Fase pública |
|--------|-------|----------------|
| `KNOWLEDGE_BASE_MISSING` | git | `validate_docs_ia` |
| `KNOWLEDGE_BASE_UNTRACKED` | git | `validate_docs_ia` |
| `KNOWLEDGE_BASE_IGNORED` | git | `validate_docs_ia` |
| `KNOWLEDGE_BASE_NOT_GIT` | git | `validate_docs_ia` |
| `KNOWLEDGE_BASE_WRONG_PATH` | git | `validate_docs_ia` |
| `KNOWLEDGE_BASE_INVALID_SEED` | seed | `validate_knowledge_seed` |
| `KNOWLEDGE_BASE_VERSION_*` | version | `validate_knowledge_spec_version` |
| `KNOWLEDGE_BASE_INVALID_STRUCTURE` | structure | `validate_knowledge_structure` |
| `KNOWLEDGE_BASE_BOOTSTRAP_OWNERSHIP_VIOLATION` | structure | `validate_knowledge_structure` |
| `KNOWLEDGE_BASE_STRUCTURAL_DRIFT` | drift | `validate_knowledge_drift` |
| `KNOWLEDGE_BASE_SENSITIVE_DATA` | policy | `validate_knowledge_content_policy` |
| `KNOWLEDGE_BASE_LANGUAGE_WARNING` | policy | warning only (não bloqueia intake) |

## Troubleshooting

| Sintoma | Verificar |
|---------|-----------|
| Falha imediata sem snapshot | Git path (sem ficheiros tracked) |
| `failedStage: seed` | Ficheiros em `REQUIRED_SEED_FILES` tracked + no disco |
| `failedStage: version` | Linha `Version: 1.0` em `docs/.IA/index.md` |
| `failedStage: policy` | Segredos em `.md` tracked; ver `redactedSamples` |
| Aviso idioma mas intake OK | `policyWarnings` / check `policy` = warn |
| Performance lenta | `validationSnapshot.metrics` — `fileCount`, `contentLoadMs`, `contentScanMs` |

## Performance notes

- Um único `git ls-files -- docs/.IA` por validação.
- Conteúdos lidos uma vez no contexto (`fileContents` / `getFileContent`).
- Policy scan reutiliza cache; limite ~48 ficheiros por run.
- Ficheiros > 512 KB ignorados no scan de conteúdo.

## Entry points (usar apenas estes)

- `validateProjectKnowledgeBase(projectRoot, options)` — intake, daemon, orchestration.
- Não invocar validators isolados em produção (tests unitários exceptuados).

## Diagnostics reference

- **`iaValidation`** — checks, secções `git|seed|version|structure|drift|policy`, erros e warnings.
- **`groupedDiagnostics`** — mesmo payload agrupado para UI/observability.
- **`validationSnapshot`** — métricas e timings por stage.

Ver também: `core/ia-validation-diagnostics.js`, `core/pre-run-error.js`.
