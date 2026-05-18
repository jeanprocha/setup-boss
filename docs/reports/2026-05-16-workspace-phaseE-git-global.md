# Relatório: Workspace Fase E — Git global multi-projeto

**Data:** 2026-05-16  
**Tipo:** implementação incremental (append-only)

---

## Resumo

Camada agregadora Git no `WorkspaceRun`: branch global padronizada (`feature/workspace-run-<slug>`), prepare por projeto participante, estado persistido no índice de workspace runs, gate no orquestrador sequencial e APIs HTTP mínimas.

---

## Arquivos criados

| Ficheiro |
|----------|
| `core/suggest-workspace-activity-branch.js` |
| `core/validate-workspace-git.js` |
| `scripts/daemon/lib/workspace-run-git-api.js` |
| `scripts/daemon/lib/workspace-run-git-api.test.js` |
| `scripts/smoke/workspace-git-phaseE-smoke.js` |
| `docs/workspace-git-phaseE.md` |
| `docs/reports/2026-05-16-workspace-phaseE-git-global.md` |

---

## Arquivos alterados

| Ficheiro | Alteração |
|----------|-----------|
| `scripts/daemon/lib/workspace-run-registry.js` | Campo `git` na persistência e DTO público |
| `scripts/daemon/lib/workspace-run-orchestrator.js` | Gate `git ready` no start; propagação de branch nos filhos |
| `scripts/daemon/lib/workspace-run-orchestrator.test.js` | Seed git + teste de bloqueio |
| `scripts/daemon/lib/run-git-branch-api.js` | Checkout idempotente quando branch global já existe |
| `scripts/daemon/runtime-api.js` | Rotas prepare-git / git-status / retry-prepare-git |
| `package.json` | Script smoke Fase E |

---

## Arquitetura Git global

```
POST /workspace-runs/:id/prepare-git
        │
        ▼
workspace-run-git-api.prepareWorkspaceRunGit
        │
        ├─ suggestWorkspaceActivityBranchName (determinístico)
        ├─ deriveParticipatingProjectIds (miniActivities ∩ workspace)
        │
        └─ para cada projeto:
              prepareProjectGitAtRoot (git-exec, sem run filho)
              persistência em workspace-runs/index.json → git.projects[]

POST /workspace-runs/:id/start
        │
        ▼
assertWorkspaceGitReadyForExecution ──bloqueia se não ready──► advance (Fase D)
        │
        └─ createRunFromTask + run-context.workspace_activity_branch
```

O fluxo Git isolado (`prepareRunGitBranch`) permanece inalterado na essência; apenas ganhou reutilização de branch existente quando o nome é passado explicitamente.

---

## Modelo de estados

**Workspace:** `pending` → `preparing` → `ready` | `partial_failure` | `failed`

**Projeto:** `pending` → `preparing` → `ready` | `failed` ; ou `skipped` via `skipProjectIds`

Agregação: `aggregateWorkspaceGitStatus()` em `core/validate-workspace-git.js`.

---

## Integração com runs filhos

| Canal | Campo |
|-------|--------|
| `run-context.json` | `workspace_activity_branch`, `git.activityBranch` |
| `job.metadata` | `workspaceActivityBranch` |
| Índice run | `workspace_run_id`, `mini_activity_id` (já existente Fase D) |

---

## Validações

- Branch global determinística (`title` + `workspaceRunId`)
- `baseBranch` obrigatória após prepare bem-sucedido (detetada via `resolveBaseBranchName`)
- Prepare duplicado evitado (idempotência workspace + projeto `ready`)
- Projeto fora do workspace → erro `project_not_in_workspace_run`
- `start` bloqueado sem `git.status === ready`
- Falha parcial → `partial_failure`; execução não inicia

---

## Limitações

- Prepare workspace não exige strategy ready (diferente do prepare por run filho)
- Sem poll de estado Git em background
- Sem PR agregado nem merge
- Títulos iguais em workspace runs distintos podem colidir no slug — usar `activityBranch` explícito no body
- Retry por projeto não refaz projetos já `ready` (apenas o alvo)

---

## Riscos

- Colisão de nome de branch entre workspace runs com mesmo título
- `partial_failure` deixa workspace bloqueado até retry ou `force`
- Prepare em projeto sem repo Git marca `failed` / `partial_failure`

---

## Próximos passos recomendados

1. **Fase F — UI:** card Git agregado no Mission Control com estado por projeto
2. Propagar `prepareRunGitBranch` automático no orquestrador após strategy ready do filho (com branch global)
3. Eventos `workspace_run.git_*` no runtime trace
4. PR agregado (fase posterior, fora do escopo E)

---

## Smoke / testes

```bash
node --test scripts/daemon/lib/workspace-run-git-api.test.js
node --test scripts/daemon/lib/workspace-run-orchestrator.test.js
npm run smoke:workspace-git-phaseE
```

Cenários cobertos: naming determinístico, multi-projeto, skipped, falha parcial, retry, bloqueio de start, idempotência.
