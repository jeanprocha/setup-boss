# Phase 6 — IA Diagnostics Platform

**Execução:** 2026-05-16T17:05:00 (local)  
**Âmbito:** consolidar diagnostics `.IA` em payload único, traces e UI de observabilidade.

## Objetivo

Melhorar visibilidade e rastreabilidade dos erros `KNOWLEDGE_*` sem alterar regras de bloqueio, auto-fix ou health score.

## Arquivos alterados

| Arquivo | Alteração |
|---------|-----------|
| `core/ia-validation-diagnostics.js` | **Novo** — `buildIaValidation`, `compactDiagnosticEvent`, `formatIaDiagnosticCopy` |
| `core/ia-validation-diagnostics.test.js` | **Novo** — testes Git/seed/structure/drift + copy |
| `core/pre-run-error.js` | Anexa `iaValidation` em erros `KNOWLEDGE_*` via enrich |
| `core/pre-run-error.test.js` | Contrato enrich com iaValidation |
| `scripts/daemon/lib/pre-run-observability.js` | Trace/metadata compactos + filtros `code`/`phase` |
| `scripts/daemon/lib/pre-run-observability.test.js` | iaValidation no trace + filtro por code |
| `scripts/daemon/runtime-api.js` | `GET /diagnostics/events?code=&phase=` |
| `frontend/lib/runtime/intake/ia-validation.ts` | **Novo** — tipos + parse |
| `frontend/lib/runtime/intake/pre-run-error.ts` | `iaValidation`, copy consolidado |
| `frontend/lib/runtime/intake/pre-run-error.test.ts` | Testes iaValidation + copy |
| `frontend/components/features/observability/IaValidationDiagnosticSections.tsx` | **Novo** — checks + secções colapsáveis |
| `frontend/components/features/observability/PreRunDiagnosticEventCard.tsx` | Card com iaValidation + raw payload |
| `frontend/components/features/intake/TaskComposer.tsx` | Usa secções iaValidation no intake |
| `frontend/lib/api/runtime-api.ts` | Filtros `code`/`phase` no fetch |

## Formato final dos diagnostics

**Objeto consolidado (`iaValidation`):**

```json
{
  "valid": false,
  "specVersion": "1.0",
  "checks": [
    { "id": "git", "label": "Git / docs/.IA", "status": "fail" },
    { "id": "seed", "label": "Seed mínimo SPEC v1.0", "status": "skip" }
  ],
  "errors": [{ "check": "git", "code": "KNOWLEDGE_BASE_UNTRACKED", "message": "..." }],
  "warnings": [],
  "git": { "ok": false, "code": "KNOWLEDGE_BASE_UNTRACKED" },
  "seed": { "ok": true },
  "structure": { "ok": true },
  "drift": { "ok": true, "driftValid": true }
}
```

**Evento pre-run (API compacta):**

- `channel`, `event`, `code`, `phase`, `title`, `message`, `description`, `summary`
- `projectId`, `projectRoot`, `traceId`, `timestamp`
- `suggestedActions`, `iaValidation`

**Trace:** `metadata.channel=pre_run`, `metadata.iaValidation`, eventos por fase (`knowledge_seed_validation_failed`, `knowledge_structural_drift_failed`, etc.).

## Testes executados

```bash
node --test core/ia-validation-diagnostics.test.js core/pre-run-error.test.js \
  scripts/daemon/lib/pre-run-observability.test.js

node --experimental-strip-types --test frontend/lib/runtime/intake/pre-run-error.test.ts
```

**Resultado:** 21 + 7 testes, todos passaram.

## Limitações

- `iaValidation` só é gerado para códigos `KNOWLEDGE_BASE_*` e `PROJECT_ROOT_UNRESOLVED`.
- Eventos antigos no trace sem `iaValidation` são reconstituídos parcialmente no map (campos legacy ainda no `error` do trace).
- Warnings de drift não bloqueantes em run OK não geram evento pre_run dedicado nesta fase.
- Sem health score, auto-fix ou validação semântica.

## Resultado final

Diagnostics `.IA` unificados em `iaValidation`, expostos no enrich pre-run, traces, `GET /diagnostics/events` (com filtros) e UI de observabilidade/intake com checks, erros, avisos, secções Git/Seed/Structure/Drift colapsáveis e botão **Copiar diagnóstico completo** (inclui JSON `iaValidation`).
