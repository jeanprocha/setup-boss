# P1a — Stale Shell Reconciliation

**Execução:** 2026-05-16T22:45:00 (local)

## Causa exacta do stale shell

`mission-shell-store` persiste `selectedProjectId`, `selectedRunId` e `expandedProjectIds` em `localStorage` (`setup-boss-mission-shell`). Após reload, o hydrate restaura IDs que já não existem em `GET /projects` (registry reconciliado, temp E2E, projeto removido). A UI continuava a:

- chamar `GET /projects/:id/governance` → **400** (`projectRootCanonical` null)
- manter run/project na shell → `project_not_found` no intake
- abrir SSE/recovery com `projectId` inválido

## Estratégia de reconciliação

1. Função pura `reconcileMissionShellSelection` compara shell vs lista runtime.
2. `useMissionShellReconciliation` (`useLayoutEffect`) corre após `GET /projects` (`source === "runtime"`) e, se projeto válido, após runs do projeto.
3. Assinatura (`shellReconcileSignature`) evita loops de apply repetido.
4. `applyShellReconciliation` no store actualiza estado + `localStorage` via persist; define `staleSelectionNotice` para UX.
5. `canFetchProjectGovernance` bloqueia query até projeto estar no registry.
6. `MissionRuntimeRoot` só liga SSE/recovery a `registeredProjectId`.

## Arquivos alterados

| Ficheiro | Alteração |
|----------|-----------|
| `frontend/lib/runtime/shell/mission-shell-reconciliation.ts` | **Novo** — lógica pura |
| `frontend/lib/runtime/shell/mission-shell-reconciliation.test.ts` | **Novo** — testes |
| `frontend/hooks/use-mission-shell-reconciliation.ts` | **Novo** — efeito pós-hydrate |
| `frontend/components/features/MissionShellReconciliation.tsx` | **Novo** — mount |
| `frontend/components/features/shell/StaleShellSelectionBanner.tsx` | **Novo** — banner UX |
| `frontend/stores/mission-shell-store.ts` | `staleSelectionNotice`, `applyShellReconciliation` |
| `frontend/hooks/use-project-governance.ts` | `enabled` via `canFetchProjectGovernance` |
| `frontend/lib/runtime/intake/project-registry-validation.ts` | `canFetchProjectGovernance` |
| `frontend/lib/runtime/intake/project-registry-validation.test.ts` | node:test + caso governance |
| `frontend/components/features/MissionRuntimeRoot.tsx` | reconciliação + SSE guard |
| `frontend/components/regions/AppShell.tsx` | banner |
| `frontend/locales/pt-BR.ts`, `en.ts` | strings `shell.*` |

## Impacto em governance 400

- **Antes:** fetch com `proj_*` órfão → 400 em loop visual.
- **Depois:** query **disabled** até `projectsReady` + `isProjectInRegistry`; após reconcile, `projectId` é `null` → sem request.

## Testes executados

```bash
cd frontend && npx tsx --test \
  lib/runtime/shell/mission-shell-reconciliation.test.ts \
  lib/runtime/intake/project-registry-validation.test.ts
```

**Resultado:** 8/8 passaram.

## Validação manual (checklist)

1. DevTools → Application → `localStorage` → `setup-boss-mission-shell` → `selectedProjectId: "proj_75abd467"` (ou outro órfão).
2. Recarregar Mission Control com daemon online.
3. Confirmar limpeza automática de `selectedProjectId` / `selectedRunId`.
4. Network: **sem** `GET .../governance` 400 para o ID órfão.
5. Banner: «O projeto anterior não está mais disponível.»
6. UI estável, sem loop de reload/HMR.

## Resultado

Quick win P1a entregue: shell reconciliado com registry runtime, governance guard, UX de expiração, persistência sincronizada.
