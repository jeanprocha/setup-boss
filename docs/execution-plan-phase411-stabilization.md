# Execution Plan — Fase 4.1.1 (estabilização)

Documentação técnica da camada de estabilização em **shadow mode** (`SETUP_BOSS_PLAN_MODE=shadow`). Não há enforcement no executor PATCH; `executor-changes.json` continua a ser a fonte de verdade operacional.

## Componentes

| Área | Módulo | Ficheiro gerado (opcional) |
|------|--------|----------------------------|
| Normalização | `normalization/operation-normalizer.js` | — |
| Reconciliação | `reconciliation/reconciliation-engine.js` | `execution-reconciliation.json` |
| Lifecycle | `lifecycle/lifecycle-engine.js` | embutido em `execution-plan.json` |
| Diff | `diff/plan-diff.js` | — (API + CLI `--diff`) |
| Manifesto | `manifest/plan-artifacts-manifest.js` | `plan-artifacts.json` |
| Diagnósticos | `diagnostics/plan-diagnostics.js` | — |

## Integração

- **Pós-Architect:** geração de `execution-plan.json`, manifesto inicial, telemetria `plan_manifest_updated`.
- **Pós-executor:** `runShadowPlanReconciliationAfterExecutor` (em `execution-plan/index.js`) persiste reconciliação e atualiza manifesto; telemetria `reconciliation_generated` e `plan_manifest_updated` (fase `after_reconciliation`).
- **Transições falhadas:** `safeApply` emite `lifecycle_transition_blocked` e `invalid_transition_detected` quando `telemetry.emit` está disponível.

## Telemetria (eventos adicionais)

- `reconciliation_generated`
- `plan_manifest_updated`
- `lifecycle_transition_blocked`
- `invalid_transition_detected`

(Os eventos `plan_diff_generated` em rotinas puramente offline/CLI podem ser adicionados quando existir destino de telemetria no CLI.)

## CLI (sem daemon)

```bash
npm run setup-boss -- inspect-plan latest --json
npm run setup-boss -- inspect-plan latest --include-plan
npm run setup-boss -- inspect-plan latest --diff=caminho/outro-plan.json
npm run setup-boss -- plan-doctor latest
npm run setup-boss -- plan-doctor latest --json
```

## Compatibilidade

- Runs sem `execution-plan.json`: hooks devolvem `skipped`; reconciliação/manifesto não são obrigatórios.
- `plan-artifacts.json` faz merge com versão anterior preservando `extensions`.
- Fingerprint continua a usar operações normalizadas com o mesmo significado que o payload canónico da Fase 4.1 (compatível com testes existentes).

## Próximo passo sugerido (Fase 4.2)

- Validation runtime sobre operações normalizadas.
- Risk engine alimentado por `execution-reconciliation.json` e diff.
- Governance: aprovações com base em diff + manifesto.
