# Fase 2 — Prepare Branch API

**Data:** 2026-05-16  
**Tipo:** implementação (API/runtime only)  
**Relacionado:** `docs/reports/2026-05-16-git-foundation-phase1.md`, `docs/reports/2026-05-16-git-branch-before-execution-discovery.md`

---

## Alterações realizadas

1. **`scripts/daemon/lib/run-git-branch-api.js`** (novo)
   - `prepareRunGitBranch({ runId, activityBranch?, jobId?, projectId? })`
   - `persistRunGitState(outputDir, patch)` / `readRunGitState`
   - Validação `strategy_ready` antes de preparar branch
   - Fluxo: dirty check → sugerir/validar nome → `checkout` base → `pull --ff-only` (se `origin`) → `checkout -b` → persistir `git_branch_ready`
   - Erros persistidos como `git_branch_failed` + `errorCode` / `errorMessage`
   - Idempotência quando `git.status === git_branch_ready` e mesmo `activityBranch`

2. **`scripts/daemon/runtime-api.js`**
   - `POST /runs/:id/git-branch` com body `{ "activityBranch": "..." }` (aceita também `activity_branch`)
   - Respostas HTTP: `201` sucesso, `200` idempotente, `409` conflitos Git/strategy, `400`/`503` outros

3. **`core/git-exec.js`** (extensão Fase 1)
   - `getWorkingTreePorcelain`, `isWorkingTreeDirty`, `branchExistsLocal`, `hasGitRemote`, `resolveBaseBranchName`
   - Correção: `resolveBaseBranchName` só usa `origin/HEAD` se a branch existir **localmente**

4. **Testes:** `scripts/daemon/lib/run-git-branch-api.test.js` + ajustes em `core/git-exec.test.js`

**Fora de escopo (confirmado):** UI, `branchHint`, execute gate, branches protegidas, commit, push, PR, merge, worktree.

---

## Arquivos alterados

| Arquivo | Acção |
|---------|--------|
| `scripts/daemon/lib/run-git-branch-api.js` | **novo** |
| `scripts/daemon/lib/run-git-branch-api.test.js` | **novo** |
| `scripts/daemon/runtime-api.js` | rota `POST /runs/:id/git-branch` |
| `core/git-exec.js` | helpers de working tree / branch / base |
| `core/git-exec.test.js` | teste `resolveBaseBranchName` |
| `docs/reports/2026-05-16-git-prepare-branch-phase2.md` | **novo** |

---

## Decisões técnicas

| Decisão | Motivo |
|---------|--------|
| Dirty check permite `docs/.IA/**` | Strategy/run escreve artefactos em `docs/.IA/outputs/<runId>`; Git reporta muitas vezes só `?? docs/` |
| Normalizar paths com trim de `/` final | `git status` emite `docs/` como entrada única no Windows |
| Pull só se existir remote `origin` | Repos locais de teste/dev sem remoto; `pullBeforeCreate: false` |
| `git_branch_exists` sem reutilização silenciosa | Escopo explícito; confirmação humana fica para fase UI |
| Não alterar `validateExecuteReadiness` | Fase 3 (execute gate) |
| Evento `git_branch_prepared` no módulo API | Observabilidade sem duplicar emissão no handler HTTP |
| Códigos de erro API alinhados ao prompt | `git_dirty_worktree`, `git_pull_failed`, `git_branch_exists`, `git_not_repository`, `git_timeout`, `git_unknown_error` |

### Persistência `run-context.git` (sucesso)

```json
{
  "enabled": true,
  "status": "git_branch_ready",
  "baseBranch": "main",
  "activityBranch": "setup-boss/20260516-exemplo",
  "baseCommit": "<sha>",
  "headCommitAfterCreate": "<sha>",
  "createdAt": "<iso>",
  "pullBeforeCreate": true,
  "updatedAt": "<iso>"
}
```

### Persistência em falha

```json
{
  "enabled": true,
  "status": "git_branch_failed",
  "errorCode": "git_pull_failed",
  "errorMessage": "..."
}
```

---

## API

**`POST /runs/:runId/git-branch`**

Request:

```json
{ "activityBranch": "setup-boss/20260516-exemplo" }
```

Se `activityBranch` omitido → `suggestActivityBranchName` a partir de `run-context.task.title`.

Response sucesso (`201` / `200`):

```json
{
  "ok": true,
  "data": {
    "runId": "...",
    "projectRoot": "...",
    "git": { "...": "..." },
    "currentBranch": "setup-boss/..."
  },
  "message": "Branch de atividade preparada."
}
```

---

## Testes executados

```bash
node --test scripts/daemon/lib/run-git-branch-api.test.js \
  core/git-exec.test.js \
  core/validate-project-knowledge-base.git-exec.test.js
```

**Resultado:** 17 testes, 0 falhas (~5.2s).

Cobertura Fase 2:

- happy path (sem remote)
- geração automática de nome
- branch já existente → `git_branch_exists`
- dirty fora de `docs/.IA` → `git_dirty_worktree`
- remote inválido → `git_pull_failed`
- idempotência `git_branch_ready`
- projeto sem Git → `git_not_repository`
- persistência em `run-context.git`

---

## Riscos

| Risco | Mitigação |
|-------|-----------|
| Alterações em `docs/.IA` fora de `outputs/` bloqueiam prepare | Documentado; utilizador deve commitar ou mover KB |
| Pull com conflito / auth | `git_pull_failed` + estado failed; sem auto-merge |
| `origin/HEAD` aponta para branch inexistente localmente | Corrigido em `resolveBaseBranchName` (fallback main/master) |
| Execução ainda possível sem branch preparada | Fase 3 — execute gate |
| Branch com `/` no nome | Suportado via `checkout -b`; validação básica de caracteres perigosos |

---

## Próximos passos

1. **Fase 3 — Execute gate server-side** — bloquear `POST /execute` sem `git_branch_ready` e branches protegidas
2. **Fase 4 — `branchHint` + adapters** — expor `activityBranch` no Mission Control
3. **Fase 5 — Testes integração API** HTTP end-to-end
4. **Fase 6 — UI HITL** — cartão «Confirmar e preparar branch»
5. **Fase 7+** — commit pós-review, multi-run, E2E browser

---

## Conclusão

A Fase 2 entrega `POST /runs/:id/git-branch` com preparação real de branch (checkout base, pull ff-only quando há `origin`, create branch) e persistência estruturada em `run-context.git`, sem alterar execute, strategy automática nem UI.
