# Phase 9 — Governance Stabilization & Runtime Integration

**Execução:** 2026-05-16T19:15:00 (local)  
**Âmbito:** consolidação operacional das Phases 2–8 (sem novas regras de governance).

## Objetivo

Estabilizar o runtime de validação `.IA` com contexto partilhado, pipeline único, snapshot de métricas e integração consistente em intake, traces e UI.

## Problemas encontrados

| Problema | Impacto |
|----------|---------|
| Validators invocados em sequência sem contexto | Releitura de `index.md` e ficheiros tracked em policy |
| `git ls-files` + leituras dispersas | Custo extra em KB com muitos `.md` |
| Múltiplos entry points conceptuais | Risco de drift entre intake / orchestration (mesma função, mas sem snapshot) |
| Payload de diagnóstico plano | UI e traces sem timings nem agrupamento por check |
| Ausência de testes E2E do fluxo completo | Regressões só detectadas em testes unitários isolados |

## Otimizações aplicadas

1. **`buildIaGovernanceValidationContext`** — um preload (até 48 ficheiros + `index.md`), `getFileContent` com cache, métricas `fileCount` / `contentLoadMs`.
2. **`runIaGovernanceValidationPipeline`** — ordem fixa seed → version → structure → drift → policy; timings por stage; falha early com `failedStage`.
3. **`validationSnapshot`** — `validationDurationMs`, `stages[]`, `metrics`, `summary` em sucesso e falha.
4. **Validators com contexto** — `validateIaSpecVersion` e `validateIaContentPolicy` reutilizam cache (comportamento inalterado).
5. **`groupedDiagnostics`** — payload agrupado em `compactDiagnosticEvent` para observability.
6. **Traces/intake** — `validationSnapshot` em `knowledge_bootstrap_ready` e falhas pre-run.
7. **UX** — resumo + duração no TaskComposer; copy inclui `validationSnapshot`.

## Arquivos alterados

| Arquivo | Alteração |
|---------|-----------|
| `core/ia-governance-validation-context.js` | **Novo** — contexto partilhado |
| `core/ia-governance-validation-context.test.js` | **Novo** |
| `core/ia-governance-validation-pipeline.js` | **Novo** — pipeline + snapshot |
| `core/ia-governance-validation-pipeline.e2e.test.js` | **Novo** — 5 fluxos E2E |
| `core/validate-project-knowledge-base.js` | Usa contexto + pipeline; export helpers |
| `core/validate-ia-spec-version.js` | Aceita `options.context` |
| `core/validate-ia-content-policy.js` | Aceita `options.context` |
| `core/ia-validation-diagnostics.js` | `groupedDiagnostics`, snapshot no compact |
| `core/pre-run-error.js` | (sem alteração de catálogo) |
| `scripts/daemon/lib/pre-run-observability.js` | Snapshot + grouped em traces |
| `scripts/daemon/lib/run-intake-api.js` | Snapshot no trace ready |
| `frontend/lib/runtime/intake/pre-run-error.ts` | Parse/copy snapshot |
| `frontend/components/features/intake/TaskComposer.tsx` | Resumo snapshot na UI |
| `docs/governance/ia-validation-pipeline.md` | **Novo** — doc operacional |

## Testes executados

```bash
node --test core/ia-governance-validation-context.test.js \
  core/ia-governance-validation-pipeline.e2e.test.js \
  core/validate-project-knowledge-base.test.js \
  core/validate-ia-spec-version.test.js \
  core/validate-ia-content-policy.test.js \
  core/ia-validation-diagnostics.test.js
```

**Resultado:** 64 testes, todos passaram (inclui 5 E2E do pipeline real).

## Limitações

- Git validation (untracked, ignored, wrong path) permanece fora do pipeline tracked — por design.
- Preload limitado a ~48 ficheiros; ficheiros extra só lidos on-demand no policy scan.
- `groupedDiagnostics` não substitui `iaValidation` (compatibilidade).
- Sem health score, auto-fix ou novas regras (fora de escopo).
- Orchestration/intake já usavam `validateProjectKnowledgeBase` — beneficiam automaticamente, sem API nova.

## Resultado final

Validação `.IA` consolidada: **um** `git ls-files`, **uma** leitura por ficheiro no cache, **um** pipeline rastreável com snapshot e métricas. Comportamento das regras Phases 2–8 preservado; runtime pronto para uso diário com troubleshooting documentado em `docs/governance/ia-validation-pipeline.md`.
