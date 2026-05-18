# Workspace Git — Fase E (branch global multi-projeto)

Coordenação Git agregada no `WorkspaceRun`, reutilizando o fluxo de prepare branch por projeto sem refatorar o Git isolado existente.

## Modelo no WorkspaceRun

```json
{
  "git": {
    "activityBranch": "feature/workspace-run-auth-refactor",
    "status": "ready",
    "preparedAt": "2026-05-16T12:00:00.000Z",
    "projects": [
      {
        "projectId": "proj_abc123",
        "baseBranch": "main",
        "activityBranch": "feature/workspace-run-auth-refactor",
        "gitStatus": "ready",
        "prepareBranchStatus": "ready",
        "lastGitEventAt": "2026-05-16T12:00:00.000Z",
        "commitSha": "a1b2c3…",
        "prUrl": null
      }
    ]
  }
}
```

### Status workspace (`git.status`)

| Status | Significado |
|--------|-------------|
| `pending` | Ainda não preparado |
| `preparing` | Prepare em curso |
| `ready` | Todos os projetos relevantes prontos |
| `partial_failure` | Alguns projetos falharam, outros OK |
| `failed` | Todos falharam ou bloqueio total |

### Status por projeto (`gitStatus` / `prepareBranchStatus`)

| Status | Significado |
|--------|-------------|
| `pending` | Aguarda prepare |
| `preparing` | Prepare em curso |
| `ready` | Branch criada/checkout no repo |
| `skipped` | Projeto sem alteração nesta corrida |
| `failed` | Erro no prepare |

## Naming da branch global

Determinístico a partir do título + `workspaceRunId`:

- Padrão: `feature/workspace-run-<slug-título>`
- Exemplo: `feature/workspace-run-auth-refactor`
- Módulo: `core/suggest-workspace-activity-branch.js`

## Fluxo

1. Criar `WorkspaceRun` + `miniActivities` (Fases B–C).
2. `POST /workspace-runs/:id/prepare-git` — gera `activityBranch` global e prepara cada projeto participante.
3. `GET /workspace-runs/:id/git-status` — consulta estado agregado.
4. `POST /workspace-runs/:id/start` — **bloqueado** se `git.status !== ready`.
5. Orquestrador (Fase D) propaga `workspace_activity_branch` para runs filhos.

Projetos participantes = `targetProjectId` únicos das `miniActivities` que pertencem ao workspace.

## API

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/workspace-runs/:id/prepare-git` | Prepara Git global |
| GET | `/workspace-runs/:id/git-status` | Estado agregado |
| POST | `/workspace-runs/:id/retry-prepare-git/:projectId` | Retry de um projeto |

### Body `prepare-git`

```json
{
  "activityBranch": "feature/workspace-run-custom",
  "skipProjectIds": ["proj_xyz"],
  "force": false
}
```

## Integração com runs filhos

Ao criar run filho, o orquestrador grava:

- `run-context.workspace_run_id`
- `run-context.mini_activity_id`
- `run-context.workspace_activity_branch`
- `run-context.git.activityBranch` (branch global)
- `metadata.workspaceActivityBranch` no job

`prepareRunGitBranch` aceita `activityBranch` explícita; se a branch já existir (prepare workspace prévio), faz checkout idempotente.

## Fora de escopo (Fase E)

- PR agregado
- Merge automático
- Rollback Git automático
- Execução paralela
- UI
- Sync remoto avançado

## Testes

```bash
node --test scripts/daemon/lib/workspace-run-git-api.test.js
npm run smoke:workspace-git-phaseE
```
