# Discovery: Git branch antes da execução

**Data:** 2026-05-16  
**Tipo:** discovery only (sem implementação)  
**Objetivo:** investigar como inserir uma etapa Git mínima entre aprovação do plano e execução, com commit local após review aprovado.

---

## Resumo executivo

Hoje o Setup Boss **valida** que o projeto-alvo é um repositório Git e que `docs/.IA` está versionada, mas **não** gere branch de atividade, pull, checkout nem commit de alterações de execução. A execução corre no `projectRoot` resolvido no intake, **sem verificar** a branch actual. O ponto de encaixe natural é **depois de `strategy_ready`** e **antes de `POST /runs/:id/execute`**, com gate HITL no mesmo padrão de clarificação/strategy (`WAITING_USER_ACTION`).

---

## 1. Como o Git funciona hoje no Setup Boss

### 1.1 Registo e raiz do repositório

| Mecanismo | Ficheiro | Comportamento |
|-----------|----------|---------------|
| Registo de projeto Git (clone/pull) | `scripts/daemon/lib/project-git-register.js` | `POST` via runtime-api: clone shallow, `checkout` opcional, `fetch` + `pull --ff-only` no **managed workspace** |
| Registo de projecto operacional | `scripts/daemon/lib/project-registry.js` | `.setup-boss/projects.json`: `projectId` ← hash de `projectRoot` canónico |
| Resolução segura do alvo | `core/resolve-target-project-root.js` | Valida pasta existente; **proíbe** usar a raiz do Setup-Boss como `projectRoot` |
| Índice da corrida | `core/run-resolver.js` → `writeRunIndex` | Persiste `project_root` em `.setup-boss/runs/<runId>.json` |
| Job de execução | `scripts/daemon/lib/run-execute-api.js` | `resolveProjectRootForRun(runId)` → índice ou `job.projectRoot` |

O utilizador regista o repo em **Connections** (`frontend/hooks/use-register-git-project.ts` → `runtime-api` com `repoUrl` + `branch` opcional no **clone inicial**). Isso **não** está ligado ao ciclo approve → strategy → execute de uma atividade.

### 1.2 Validação Git (read-only)

`core/validate-project-knowledge-base.js` expõe utilitários internos:

- `gitExecFileSync(args)` — `execFileSync("git", …)` com `windowsHide: true`
- `isGitRepository(projectRoot)` — `git -C <root> rev-parse --git-dir`
- `gitLsFilesDocsIa`, `gitCheckIgnoredPathsSet` — só para governança de `docs/.IA`

**Não existe** leitura de branch actual (`symbolic-ref`, `branch --show-current`) nem `status --porcelain` fora de testes/smokes.

### 1.3 Execução de comandos Git (mutação)

| Local | Uso |
|-------|-----|
| `project-git-register.js` | `runGitSpawn` (async `spawn`): clone, checkout, fetch, pull |
| `validate-project-knowledge-base.js` | `gitExecFileSync` (sync): validação |
| Testes / smokes | `execFileSync` ad-hoc para fixtures |

Não há módulo partilhado `core/git.js` ou `scripts/daemon/lib/git-workspace.js`.

### 1.4 Branch na UI

- `RunSummaryDto.branchHint` existe em `frontend/lib/api/runtime-types.ts`
- `mapApiJobToRunSummary` define **`branchHint: null`** sempre (`frontend/lib/runtime/adapters/map-job.ts`)
- Mocks e timeline referem branch como **placeholder** (`frontend/lib/mocks/runs.ts`, highlights em `build-execution-timeline-cards.ts`)
- Passo `commit_generated` no catálogo de timeline é **narrativo** — não há runtime que o preencha

### 1.5 Commit após review

- Pipeline clássico (`scripts/runtime/orchestration.js`): após `review.status === "approved"` chama `enrichIAAfterApprovedRun` (actualiza `docs/.IA` no projeto), **sem** `git add` / `git commit` das alterações de código
- Executor (`scripts/executor.js`): aplica patches em `metadata.projectRoot` com `allowedFiles`; commits físicos são conceito de **apply/dry-run**, não Git commit automático
- Nenhum fluxo Mission Control faz commit Git pós-review hoje

---

## 2. Respostas às perguntas do discovery

### 1. Onde o Setup Boss identifica o repositório Git do projeto?

1. **Intake / run index:** `project_root` em `.setup-boss/runs/<runId>.json` (escrito por `writeRunIndex` em `core/run-resolver.js`).
2. **Registry:** `projects.json` via `project-registry.js` (`projectRoot` canónico → `projectId`).
3. **Clone gerido:** `project-git-register.js` materializa repo em `SETUP_BOSS_MANAGED_ROOT` (ver `daemon-paths.js`).
4. **Validação:** `validateProjectKnowledgeBase(projectRoot)` no intake e pre-run.

### 2. Onde detecta branch atual?

**Em lado nenhum** no runtime de atividades. Branch só aparece no registo de projeto (branch opcional no clone) e em mocks/UI (`branchHint`).

### 3. Existe função utilitária para executar comandos Git?

**Parcialmente, duplicada:**

- `gitExecFileSync` em `validate-project-knowledge-base.js` (sync, validação)
- `runGitSpawn` em `project-git-register.js` (async, clone/pull)

Recomendação: extrair `core/git-exec.js` (ou `scripts/daemon/lib/git-exec.js`) com `-C projectRoot`, timeout, erros estruturados, reutilizado por validação, branch prep e commit final.

### 4. Existe contrato de `projectRoot` seguro?

**Sim.** `resolveTargetProjectRoot`:

- Exige directório existente
- Por defeito `forbidSetupBossRoot: true` (impede validar/execução na pasta do Setup-Boss)
- Retorna `targetProjectRoot` absoluto e `expectedKnowledgePath`

Execução usa o mesmo root via índice da corrida + `assertSafeProjectPath` no executor.

### 5. Onde inserir a nova etapa entre approve / strategy / execution?

Fluxo actual (simplificado):

```txt
approve (phase2 → ready_for_execution)
  → autoStartStrategyAfterApproval (run-clarification.js)
  → run-strategy-runtime (phase3 → strategy_ready)
  → utilizador: POST /runs/:id/execute (run-execute-api.js)
  → job run_execute → orchestration pipeline
```

**Encaixe recomendado:**

```txt
strategy_ready (+ handoff execution_ready)
  → [NOVO] git_branch_pending → confirmação UI → git_branch_ready
  → POST /execute (bloqueado até git_branch_ready)
```

Alternativa (fluxo de produto no topo do brief): branch **logo após approve** e **antes** da strategy. Tecnicamente a strategy só escreve em `docs/.IA/outputs/<runId>/` (não no código da app), por isso **não é obrigatório** criar branch antes da strategy; o requisito de segurança (não executar em `main`) aplica-se à **execução** e ao **commit final**.

### 6. A strategy deve rodar antes ou depois da criação da branch?

| Ordem | Prós | Contras |
|-------|------|---------|
| **Strategy → branch → execute** (recomendado MVP) | Menos atrito; alinha com gate actual “Execute Run” só após strategy; artefactos strategy ficam no output dir versionado em `.IA` | Utilizador em `main` durante geração da strategy (só metadados em output) |
| **Branch → strategy → execute** | Narrativa única “tudo na branch da atividade” | Pull/checkout podem falhar antes de investir LLM na strategy |

**Recomendação:** strategy **antes**; preparar branch **depois de `strategy_ready`** e **antes de `triggerRunExecution`**.

### 7. A execução já assume branch atual do repo?

**Sim, implicitamente.** `triggerRunExecution` resolve `projectRoot` e enfileira job; o worker/orchestration usa `metadata.projectRoot` sem `git checkout`. Qualquer branch já checked out no disco é a branch de execução.

### 8. Como impedir execução em `main` / `master` / `develop`?

Hoje: **não impede.**

Implementação mínima:

1. `git -C projectRoot branch --show-current` (ou `rev-parse --abbrev-ref HEAD`)
2. Lista de protegidas: `main`, `master`, `develop`, `production`, `release` (configurável)
3. Em `validateExecuteReadiness` + `deriveExecuteAvailability`: se protegida e `run.git.activityBranch` ausente → `canExecute: false`, reason `git_branch_required`
4. Após `git_branch_ready`, validar que `HEAD` está na `activityBranch`

### 9. Como lidar com working tree suja antes de criar branch?

**Bloquear** preparação da branch (não auto-stash no MVP):

- `git status --porcelain` em `projectRoot`
- Permitir apenas alterações sob `docs/.IA/outputs/<runId>/` **ou** bloquear qualquer dirty (mais simples e seguro)
- UI: mensagem + acções sugeridas (`git stash`, commit manual, descartar)

### 10. Como lidar se `git pull` falhar?

- Capturar stderr de `runGitSpawn` / `gitExecFileSync`
- Estado `git_branch_failed` com `code`: `git_pull_failed`, `git_auth_failed`, `git_merge_conflict`, `git_timeout`
- Evento runtime `git_branch_failed` + `waiting_user` na timeline
- **Sem** merge automático; pedir acção humana (documentado em escopo out-of-scope: resolver conflito)

### 11. Como lidar se branch sugerida já existir?

1. `git show-ref --verify refs/heads/<name>` 
2. Se existir: UI pergunta reutilizar vs sugerir `…-2`, `…-3` (regra do brief)
3. Reutilizar só com confirmação explícita; senão falhar fechado

### 12. Como registrar branch no `run-context` / metadata?

Ficheiro existente: `<outputDir>/run-context.json` (já tem `phase2`, `phase3`, `phase4`, `orchestration`).

Proposta:

```json
{
  "git": {
    "enabled": true,
    "baseBranch": "main",
    "activityBranch": "setup-boss/20260516-chat-integracao",
    "baseCommit": "<sha após pull>",
    "headCommitAfterCreate": "<sha>",
    "createdAt": "<iso>",
    "pullBeforeCreate": true,
    "commitAfterApproval": true,
    "status": "git_branch_ready"
  }
}
```

Espelhar resumo em:

- `.setup-boss/runs/<runId>.json` (opcional, para listagens)
- `orchestration-state.json` ou evento `git_branch_prepared`
- API bundle novo ou extensão de `GET /runs/:id/strategy` → preferível **`GET /runs/:id/git-branch`** ou campo em bootstrap de execução

### 13. Como exibir na UI?

Padrões existentes a reutilizar:

| Padrão | Referência |
|--------|------------|
| `WAITING_USER_ACTION` | `mission-workflow-stages.ts`, `MissionWorkspacePhase.tsx` |
| Cartão HITL | clarificação (`awaiting_approval`), strategy (`strategy_ready` → `waiting_user`) |
| CTA execução | `OrchestrationRunControls` + `ExecuteRunButton` + `deriveExecuteAvailability` |
| Timeline | `derive-run-operational-timeline.ts` — novos tipos `git_branch_*` |

UI proposta:

- Etapa **「Preparar branch」** entre Strategy e Execução no pipeline operacional (`derive-operational-pipeline.ts` / `EXECUTION_STEPS`)
- Campo editável + botão **「Confirmar e preparar branch」**
- Preencher `branchHint` no `RunSummaryDto` a partir de `run-context.git.activityBranch`
- Bloquear `Execute Run` até `git.status === git_branch_ready`

### 14. Onde fazer commit final após review aprovado?

Gatilho natural: quando `run-orchestration-sync.js` emite `review_completed` com `review_status === approved` **e** lifecycle ainda não `execution_completed`, **ou** no fecho do pipeline em `finishKnowledge` (`orchestration.js`) — desde que `run-context.git.commitAfterApproval === true`.

Fluxo:

1. Listar ficheiros alterados pela execução (já existe conceito `allowedFiles` / patches no executor)
2. `git add` só paths permitidos (intersecção com working tree)
3. `git commit` com mensagem `setup-boss: <título>` + body com `runId`, `projectId`
4. Evento `git_commit_completed` (mapear para passo `commit_generated` na timeline)
5. **Sem push**

Se `git diff --cached` vazio → `git_commit_skipped` (não falhar o run).

---

## 3. Onde encaixar a etapa 「Preparar branch」

### Diagrama do fluxo alvo

```txt
┌─────────────────┐
│ Plano aprovado  │  phase2: ready_for_execution
└────────┬────────┘
         ▼
┌─────────────────┐
│ Gerar estratégia│  autoStartStrategyAfterApproval → phase3: strategy_ready
└────────┬────────┘
         ▼
┌─────────────────┐
│ Preparar branch │  [NOVO] WAITING_USER_ACTION + API git/prepare
└────────┬────────┘
         ▼
┌─────────────────┐
│ Executar        │  POST /runs/:id/execute (gate git_branch_ready)
└────────┬────────┘
         ▼
┌─────────────────┐
│ Review          │
└────────┬────────┘
         ▼
┌─────────────────┐
│ Commit final    │  [NOVO] após review approved
└─────────────────┘
```

### Pontos de código (backend)

| Acção | Ficheiro sugerido |
|-------|-------------------|
| Sugerir nome de branch | `core/suggest-activity-branch.js` (slug + data + colisão) |
| Preparar branch (pull, checkout -b) | `scripts/daemon/lib/run-git-branch-api.js` |
| Gate execução | `run-execute-api.js` → `validateExecuteReadiness` |
| Gate UI | `orchestration-state.ts` → `deriveExecuteAvailability` |
| Persistência | merge em `run-context.json` via helper partilhado com `mergeOrchestrationIntoRunContext` |
| Eventos | `runtime-events` / `emitRuntimeEvent`: `git_branch_suggested`, `git_branch_prepared`, `git_branch_failed` |
| Endpoints | `runtime-api.js`: `GET/POST /runs/:id/git-branch` |

### Pontos de código (frontend)

| Acção | Ficheiro sugerido |
|-------|-------------------|
| Painel HITL | `frontend/components/features/git-branch/GitBranchPrepareCard.tsx` |
| Hook | `use-git-branch.ts` |
| Mutations | `orchestration-actions.ts` ou `runtime-actions.ts` |
| Pipeline | `mission-workflow-stages.ts` — estado `git` ou sub-estado entre strategy/exec |
| `branchHint` | `map-job.ts` + adapter de bootstrap |

---

## 4. Estados novos necessários

### Runtime / disco

| Estado | Significado |
|--------|-------------|
| `git_branch_pending` | Strategy pronta; aguarda confirmação do nome / acção do utilizador |
| `git_branch_preparing` | Comandos git em curso (opcional, para spinner) |
| `git_branch_ready` | Branch criada; OK para executar |
| `git_branch_failed` | Falha recuperável; HITL |

Podem viver em `run-context.git.status` sem alterar `phase2`/`phase3` existentes (menor risco).

### UI (`MissionWorkspacePhaseStatus`)

- Inserir fase **`git`** no record `deriveMissionWorkspaceStatuses` ou mapear exec `PENDING` + banner `WAITING_USER_ACTION` até branch pronta
- Reutilizar `WAITING_USER_ACTION` com hint: «Confirme a branch da atividade antes de executar»

### Eventos timeline

- `git_branch_suggested`
- `git_branch_confirmed`
- `git_branch_prepared`
- `git_branch_failed`
- `git_commit_completed` / `git_commit_skipped`

---

## 5. Mudanças no backend / runtime

1. **Módulo Git partilhado** — unificar spawn/exec, detecção `baseBranch` (`origin/HEAD` ou `main`/`master` fallback), branch actual, porcelain status
2. **API preparar branch** — input: `{ branchName?, confirmReuse? }`; output: estado + SHAs
3. **Estender guards** — `validateExecuteReadiness`, strategy runtime (opcional: não necessário)
4. **Commit pós-review** — hook em `run-orchestration-sync` ou worker pós-`review_completed`; respeitar `allowedFiles` do executor
5. **Config** — prefixo `setup-boss/` e lista de branches protegidas em env ou `.setup-boss/config.json` (fase posterior)

### Detecção de `baseBranch`

Ordem sugerida:

1. `git symbolic-ref refs/remotes/origin/HEAD` → `origin/main`
2. Se remoto ausente (repo local): tentar `main`, depois `master`
3. Falha → `git_branch_failed` / pedir configuração manual (fase 2)

### Geração do nome

```txt
setup-boss/<yyyyMMdd>-<slug-titulo-max-50>
```

- Normalizar: NFD, remover acentos, `[^a-z0-9-]`, colapsar `-`, max ~70 chars com prefixo
- Colisão: sufixo `-2`, `-3`

---

## 6. Mudanças na UI

1. Cartão entre Strategy concluída e botão **Execute Run**
2. Input pré-preenchido com sugestão; validação inline (caracteres Git)
3. Desabilitar **Execute Run** com reason `git_branch_required` (novo em `ExecuteGuardReason`)
4. Mostrar branch activa em `RuntimeCard` / observabilidade técnica (`branchHint`)
5. Locales `pt-BR` / `en` para strings da etapa
6. Timeline: marco «Branch preparada» após sucesso

---

## 7. Persistência necessária no run

| Artefacto | Conteúdo |
|-----------|----------|
| `run-context.json` → `git` | Objeto completo (ver § pergunta 12) |
| `run-index` | Opcional: `activity_branch` para queries |
| Eventos daemon | `events.jsonl` com tipos git_* |
| Pós-commit | `git.commitSha`, `git.commitMessage` em `run-context` ou `execution-summary` |

Não alterar schema de `approval-state.json` nem `strategy/*` na fase 1.

---

## 8. Riscos

| Risco | Severidade | Mitigação |
|-------|------------|-----------|
| Execução em branch protegida | Alta | Gate obrigatório + verificação de HEAD antes do job |
| Working tree suja bloqueia muitos utilizadores | Média | Mensagem clara; futuro: stash opcional (fora de escopo) |
| `git pull` com conflito | Média | Falhar fechado; não auto-merge |
| Repo sem remote / offline | Média | Modo «local only»: pular pull, só `checkout -b` |
| Commit inclui ficheiros não permitidos | Alta | Whitelist = `allowedFiles` da execução ∩ paths existentes |
| Windows paths / spawn | Baixa | Reutilizar padrão `windowsHide`, `-C` absoluto |
| Race: execute antes de branch pronta | Média | Guard server-side (não só UI) |
| Strategy em `main` gera confusão mental | Baixa | Copy na UI: «A execução usará a branch X» |
| Multi-projeto / managed root vs projectRoot local | Média | Git sempre em `projectRoot` da corrida, não no Setup-Boss repo |

---

## 9. Plano de implementação em pequenas fases

### Fase A — Fundação (sem UI)

- `core/git-exec.js`: `getCurrentBranch`, `isProtectedBranch`, `isRepo`, `statusPorcelain`, `branchExists`
- `core/suggest-activity-branch.js` + testes
- Persistência `run-context.git` + helper read/write

### Fase B — Preparar branch (API + gate)

- `POST /runs/:id/git-branch/prepare` + `GET` estado
- Integrar em `validateExecuteReadiness` / `deriveExecuteAvailability`
- Eventos runtime + testes de integração com repo temp

### Fase C — UI HITL

- `GitBranchPrepareCard`, hook, bloqueio `ExecuteRunButton`
- `branchHint` no summary
- Timeline + mission stages

### Fase D — Commit pós-review

- Serviço `git-commit-activity.js` após review approved
- Mapear `commit_generated` na timeline quando houver SHA
- Testes: dirty, empty commit, só allowed files

### Fase E — Polimento

- Config prefixo / branches protegidas
- Reutilização de branch existente
- Observabilidade técnica (SHA base/head)

**Fora de escopo (confirmado):** push, PR, merge, rollback automático, worktree, multi-remote, rebase.

---

## 10. Testes mínimos

| Teste | Tipo |
|-------|------|
| `suggestActivityBranch` — acentos, espaços, max length, colisão `-2` | unit (`core/`) |
| `isProtectedBranch` — main/master/develop/production/release | unit |
| Preparar branch: happy path (checkout base, pull, checkout -b) | integration (temp repo) |
| Bloqueio execute sem `git_branch_ready` | API `run-execute-api.test.js` |
| Bloqueio execute em `main` sem branch de atividade | integration |
| Working tree suja → `git_branch_failed` | integration |
| Branch já existe → requer confirmação | unit + API |
| Pull falha → estado failed + evento | integration |
| Commit pós-review — só allowed files; skip se vazio | integration |
| Frontend `deriveExecuteAvailability` com `git_branch_required` | unit TS |

Fixtures: reutilizar padrão de `validate-project-knowledge-base.test.js` / `strategy-ready-p0-e2e-validation.js` (`git init`, user.name/email).

---

## Referências de código (âncoras)

| Tema | Ficheiro |
|------|----------|
| Auto-start strategy pós-approve | `scripts/daemon/lib/run-clarification.js` (`autoStartStrategyAfterApproval`) |
| Guards de execução (server) | `scripts/daemon/lib/run-execute-api.js` (`validateExecuteReadiness`) |
| Guards de execução (UI) | `frontend/lib/runtime/orchestration/orchestration-state.ts` |
| Resolução `projectRoot` | `core/resolve-target-project-root.js`, `core/run-resolver.js` |
| Git util (validação) | `core/validate-project-knowledge-base.js` |
| Git clone/pull | `scripts/daemon/lib/project-git-register.js` |
| Review approved | `scripts/daemon/lib/run-orchestration-sync.js`, `scripts/runtime/orchestration.js` |
| Discovery workspaces (futuro cloud) | `docs/discovery-managed-workspaces-architecture.md` |
| Discovery Git web | `docs/discovery-web-git-integrations-multitenant.md` |

---

## Conclusão

O Setup Boss já tem **projeto-alvo versionado**, **execução atrelada a `projectRoot`** e **gates HITL** maduros entre clarificação, strategy e execução. Falta uma camada fina de **workspace Git por atividade**: sugerir branch, confirmar, pull + criar branch, bloquear execução em refs protegidas e **commit local** após review. O encaixe de menor risco é **após `strategy_ready`**, reutilizando `run-context.json`, `WAITING_USER_ACTION` e os guards existentes de `run-execute-api` / `deriveExecuteAvailability`, sem antecipar push/PR do discovery multi-tenant.
