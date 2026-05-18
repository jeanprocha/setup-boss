# Discovery: Workspace multi-projeto + execução sequencial orquestrada

**Data:** 2026-05-16  
**Tipo:** discovery only — sem implementação, sem migrations, sem UI, sem refactor de runtime  
**Objetivo:** mapear o estado actual e propor arquitectura incremental para o Setup Boss operar um **workspace** com 1+ projetos e uma **atividade global** decomposta e executada em sequência.

**Documentos relacionados (já existentes, vocabulário distinto):**

| Documento | Foco |
|-----------|------|
| `docs/discovery-project-workspaces-multirepo.md` | **Project Workspace** lógico (N repos Git sob um produto); `WorkspaceRepository`, `ActivityRepositoryScope` |
| `docs/discovery-managed-workspaces-architecture.md` | **Managed Workspace** em disco (lifecycle Git, tenant, locks) |
| `docs/setup-boss-information-architecture.md` | Hierarquia MVP: Project → Activity → Run |
| `docs/git-workflow-operational-runbook.md` | Fluxo Git por corrida (fases 1–10 implementadas) |

**Nota de vocabulário neste relatório:** usa-se **Workspace** = agrupamento Setup-Boss de vários `projectId` registados (cada um com `projectRoot` próprio). Isto **não** substitui o “Managed Workspace” do doc de lifecycle em disco; a Fase A deve deixar essa distinção explícita no código (`SetupWorkspace` vs `ManagedWorkspace`).

---

## Resumo executivo

Hoje o Setup Boss trata **cada `projectRoot` como universo isolado**: um `runId` aponta para um único `project_root`, artefactos vivem em `docs/.IA/outputs/<runId>/`, Git (`run-context.git`) e locks são **por projeto**, e a fila do daemon faz *fairness* entre projectos mas **não orquestra** uma atividade ponta-a-ponta em vários repos.

O caminho de menor risco é:

1. Introduzir entidades **`Workspace`** e **`WorkspaceRun`** em índice append-only (`.setup-boss/workspaces.json`, `.setup-boss/workspace-runs/<id>.json`).
2. Modelar **mini-atividades** como **runs filhos** (`parentWorkspaceRunId`, `miniActivityIndex`, `targetProjectId`) reutilizando intake → clarify → strategy → execute → review → commit/push/PR **inalterados por projeto**.
3. Adicionar um **orquestrador sequencial** fino (daemon ou job `workspace_run_orchestrate`) que só avança quando o run filho atinge estado terminal ou `WAITING_USER_ACTION` agregável.
4. Padronizar **`activityBranch`** no `WorkspaceRun` e propagar para cada `prepareRunGitBranch` filho.
5. UI Mission Control: camada acima da sidebar actual (lista de workspaces → workspace run → filhos por projeto).

**Primeira fase recomendada:** **Fase A — modelo `Workspace` + registo manual/API** (sem orquestração, sem runs filhos), para validar persistência e UI mínima de listagem.

---

## 1. Estado actual do modelo de dados

### 1.1 Project

| Aspecto | Implementação actual |
|---------|---------------------|
| Persistência | `.setup-boss/projects.json` (`schemaVersion: 1`) |
| Módulo | `scripts/daemon/lib/project-registry.js` |
| Identidade | `projectId = proj_<sha256(projectRoot)[0:8]>` |
| Campos | `projectRoot`, `displayName`, `firstSeenAt`, `lastSeenAt`, `lastJobId`, `jobCounts`, `metadata` |
| Registo Git | `scripts/daemon/lib/project-git-register.js` — clone em managed root, opcional `branch` no clone inicial |
| Resolução | `resolveProjectSelector`, `resolveTargetProjectRoot` (`core/resolve-target-project-root.js`) |

**Semântica actual:** 1 registo = 1 pasta no disco = 1 repositório (ou árvore) operacional. Não há agrupamento “wiser-bot = api + front”.

### 1.2 Run

| Aspecto | Implementação actual |
|---------|---------------------|
| ID | `YYYYMMDD-HHmmss-<task-slug>` (`core/run-resolver.js` → `getRunId`) |
| Índice global | `.setup-boss/runs/<runId>.json` |
| Campos índice | `run_id`, `project_root`, `output_dir`, `output_dir_relative`, `created_at`, `run_type?` |
| Output | `<projectRoot>/docs/.IA/outputs/<runId>/` (validado por `isInsideProjectIaOutputs`) |
| Artefactos chave | `run-context.json`, `metadata.json`, `orchestration-state.json`, `strategy/*`, clarificação, review, etc. |

**Invariante forte:** `writeRunIndex` exige que `outputDir` termine em `<runId>` e esteja **dentro de um único** `projectRoot`.

### 1.3 Job (fila daemon)

| Aspecto | Implementação actual |
|---------|---------------------|
| Persistência | `.setup-boss/daemon/queue.json` |
| Módulo | `scripts/daemon/lib/queue-store.js` |
| Campos | `id`, `status`, `projectRoot`, `projectId?`, `taskArg`, `runId`, `metadata`, `flowOptions`, eventos embutidos, retry, schedule |
| Tipos relevantes | intake, `run_execute`, recurring, etc. |
| Concorrência | `scripts/daemon/lib/worker-pool.js` — `SETUP_BOSS_MAX_WORKERS` (default 1), `MAX_WORKERS_PER_PROJECT` (default 1) |
| Fairness | `buildFairnessPendingOrder` — round-robin **entre projectos**, não entre mini-atividades da mesma atividade global |

Cada job referencia **um** `projectRoot` / `projectId`.

### 1.4 run-context

Ficheiro por corrida: `<outputDir>/run-context.json`.

| Secção | Uso |
|--------|-----|
| `git` | Branch, gate execute, commit, push, PR (`core/git-approved-run-*.js`, `run-git-branch-api.js`) |
| `orchestration` | Estado sincronizado com `orchestration-state.json` (`run-execute-api.js`, `run-orchestration-sync.js`) |
| `phase4` | Legado fase execução |
| `updated_at` | Carimbo |

**Fonte de verdade Git na UI:** `map-run-git-for-ui.js` + envelope em `run-git-ui-envelope`.

Não existe `workspaceRunId` nem ligação entre run-contexts de projectos diferentes.

### 1.5 Mission Control state (frontend)

| Camada | Ficheiro / padrão |
|--------|-------------------|
| Shell | `frontend/stores/mission-shell-store.ts` — `selectedProjectId`, `selectedRunId`, `expandedProjectIds` |
| Layout | `mission-layout-store.ts` |
| Lista | `ProjectActivitySidebar.tsx` — projectos → runs por projecto |
| Run detail | `RunViewShell.tsx`, `OrchestrationRunControls.tsx`, `PrepareGitBranchCard.tsx` |
| Workflow | `mission-workflow-stages.ts` — `WAITING_USER_ACTION` por fase (clarify, strategy, exec) |
| API | `frontend/lib/api/runtime-api.ts`, `runtime-types.ts` — DTOs com `projectId` obrigatório no filtro |

Navegação canónica: **Project → Run**. Sem nível Workspace.

### 1.6 Git state

| Etapa | Onde |
|-------|------|
| Sugestão branch | `core/suggest-activity-branch.js` — prefixo `setup-boss/<date>-<slug>` |
| Prepare | `POST /runs/:id/git-branch` → `run-git-branch-api.js` |
| Gate execute | `core/validate-git-execute-gate.js` |
| Pós-review | `run-git-commit-after-review.js` → commit/push/PR |

Tudo **scoped ao `outputDir` de um run** → um repo. `activityBranch` pode divergir entre runs se o operador preparar manualmente em cada um.

Metadados Git por projeto no registry: **limitados** ao registo clone (`project-git-register`); não há `baseBranch` persistido por projecto na fila.

### 1.7 Execution artifacts

| Tipo | Local |
|------|--------|
| Strategy | `<outputDir>/strategy/` — `decomposition.json`, `execution-order.json`, `subtasks/*.json` (`run-strategy.js`) |
| Clarificação / plano | artefactos em outputDir (agents `task-clarify`, `task-plan-refine`) |
| Pipeline clássico | `scripts/runtime/orchestration.js` — architect, executor, review, correction |
| Eventos | `.setup-boss/daemon/events.jsonl`, `runtime-events.js` |
| Trace | `.setup-boss/traces/runtime-trace.jsonl` |

Subtasks actuais são **decomposição lógica dentro do mesmo run/projeto**, não mapeamento cross-repo.

### 1.8 “Multi-project” já existente

`buildMultiProjectStatus` em `runtime-api.js` — **apenas estatística** da fila (quantos projectos activos, stuck, pending). **Não** é orquestração de atividade multi-repo.

---

## 2. Acoplamentos fortes a um único `projectId`

### 2.1 Backend / core

| Módulo | Acoplamento |
|--------|-------------|
| `core/run-resolver.js` | `writeRunIndex({ projectRoot, outputDir })` — um root |
| `scripts/daemon/lib/run-intake-api.js` | `createRunFromTask({ projectId, task })` |
| `scripts/daemon/lib/run-execute-api.js` | `resolveProjectRootForRun(runId)` → índice único |
| `scripts/daemon/lib/run-git-branch-api.js` | `resolveProjectRootForRun` + `persistRunGitState(outputDir)` |
| `scripts/daemon/lib/project-lock.js` | lock por hash de **um** `projectRoot` |
| `scripts/daemon/lib/project-run-index.js` | synthetic jobs filtrados por `projectId` |
| `scripts/daemon/runtime-api.js` | `/projects`, `/runs`, eventos SSE filtrados por `projectId` |
| `core/validate-project-knowledge-base.js` | validação KB num root |
| `core/git-approved-run-commit.js` | `allowed_files` do run-context de **um** output |

### 2.2 Frontend

| Módulo | Acoplamento |
|--------|-------------|
| `mission-shell-store` | seleção `(projectId, runId)` |
| `ProjectActivitySidebar` | `useProjects` + `projectRunsQueryOptions(projectId)` |
| `query-keys.ts` | chaves `['runtime','projects', projectId, ...]` |
| `RunViewShell` | assume um `projectId` para refetch e CTAs Git |
| Hooks clarificação/strategy | endpoints `/runs/:id/...` sem contexto workspace |

### 2.3 Fluxo SPEC → PLAN → execute

Intake e clarificação correm no **outputDir do run** do projecto escolhido na UI. Não há passo que leia SPEC de outro repo ou produza PLAN global antes de criar runs filhos.

### 2.4 Implicação

Qualquer “atividade ponta-a-ponta” hoje = **N runs independentes** + operador manual a alternar projectos na sidebar. Sem branch name partilhado, sem estado agregado, sem ordem garantida.

---

## 3. Proposta de entidades

### 3.1 Workspace

Persistência sugerida: `.setup-boss/workspaces.json` (schema 1).

```json
{
  "workspaceId": "ws_a1b2c3d4",
  "displayName": "wiser-bot",
  "slug": "wiser-bot",
  "projectIds": ["proj_abc...", "proj_def..."],
  "primaryProjectId": "proj_abc...",
  "createdAt": "ISO",
  "updatedAt": "ISO",
  "gitPolicy": {
    "branchPrefix": "setup-boss",
    "syncBranchNameAcrossProjects": true
  },
  "projectsMeta": {
    "proj_abc...": {
      "role": "backend",
      "order": 0,
      "defaultBaseBranch": "main",
      "required": true
    },
    "proj_def...": {
      "role": "frontend",
      "order": 1,
      "defaultBaseBranch": "main",
      "required": true
    }
  }
}
```

| Campo | Notas |
|-------|--------|
| `workspaceId` | `ws_<hash estável>` ou UUID curto |
| `projectIds` | referências a `projects.json` — cada um já tem `projectRoot` |
| `primaryProjectId` | opcional — projeto onde corre intake “global” se não houver run por mini-actividade ainda |
| `projectsMeta` | papel, ordem default, `baseBranch` por repo |
| `gitPolicy` | prefixo e flag de nome de branch igual em todos |

**Validação:** todos os `projectId` devem existir no registry; opcionalmente proibir duplicar o mesmo `projectRoot` em dois workspaces (política produto).

### 3.2 WorkspaceRun

Persistência sugerida: `.setup-boss/workspace-runs/<workspaceRunId>.json` + índice leve `workspace-runs-index.json` (lista para UI).

```json
{
  "workspaceRunId": "wsrun_20260516-120000-implementar-feature-x",
  "workspaceId": "ws_a1b2c3d4",
  "activityTitle": "Implementar nova feature X ponta a ponta",
  "status": "planning|ready|running|waiting_user|completed|failed|cancelled",
  "globalSpec": { "markdown": "...", "version": 1 },
  "globalPlan": { "markdown": "...", "version": 1 },
  "activityBranch": "setup-boss/20260516-implementar-feature-x",
  "miniActivities": [
    {
      "id": "ma-001",
      "title": "API: endpoints e DTOs",
      "targetProjectId": "proj_api",
      "order": 0,
      "dependsOn": [],
      "runId": "20260516-120100-api-endpoints",
      "status": "pending|running|waiting_user|completed|failed|skipped",
      "required": true
    }
  ],
  "orchestration": {
    "mode": "sequential",
    "currentMiniActivityId": "ma-001",
    "stopOnError": true
  },
  "aggregateGit": {
    "byProjectId": {
      "proj_api": { "branchStatus": "git_branch_ready", "commitStatus": "committed" }
    }
  },
  "createdAt": "ISO",
  "updatedAt": "ISO"
}
```

### 3.3 Mini-activity → run padrão (recomendação)

| Opção | Prós | Contras |
|-------|------|---------|
| **A. Cada mini-activity = run padrão completo** | Reutiliza 100% pipeline, Git, MC, smokes; rastreio familiar | N artefactos; SPEC local derivado do global |
| B. Sub-run só no filesystem | Menos jobs na fila | Quebra contratos API/UI actuais |
| C. Task só dentro de WorkspaceRun | Menos ficheiros | Duplica lógica clarify/strategy/execute |

**Recomendação: opção A** com metadados no run índice:

```json
{
  "run_id": "...",
  "project_root": "...",
  "parent_workspace_run_id": "wsrun_...",
  "mini_activity_id": "ma-001",
  "workspace_id": "ws_..."
}
```

Extensão backward-compatible em `.setup-boss/runs/<runId>.json`.

### 3.4 Contratos reaproveitados

| Contrato actual | Reuso no workspace |
|-----------------|-------------------|
| Job + queue | um job por run filho; orquestrador só enfileira o próximo quando o anterior termina |
| `run-context.json` | inalterado por projeto |
| Strategy `subtasks/` | **dentro** de cada run filho; PLAN global é artefacto do WorkspaceRun |
| Git prepare/execute/commit | por run filho; `activityBranch` copiado do WorkspaceRun |
| `WAITING_USER_ACTION` | agregado: workspace `status=waiting_user` se qualquer filho bloqueado |
| Events SSE | novos tipos `workspace_run.*`; UI filtra por `workspaceRunId` |

---

## 4. Fluxo SPEC → PLAN → mini-activities → runs

```mermaid
flowchart TB
  subgraph ws["WorkspaceRun"]
    GS[Global SPEC]
    GP[Global PLAN]
    MA[mini-activities[]]
  end
  GS --> GP
  GP --> MA
  MA --> R1[Run projeto API]
  MA --> R2[Run projeto Front]
  R1 --> P1[Pipeline completo por projeto]
  R2 --> P2[Pipeline completo por projeto]
```

### 4.1 Fases propostas

| Fase | Actor | Saída |
|------|-------|--------|
| Intake workspace | Novo endpoint ou extensão intake | `WorkspaceRun` criado, título, lista projectos do workspace |
| SPEC global | LLM + contexto multi-projeto (paths, roles) | `globalSpec` — o que muda em cada repo, dependências |
| PLAN global | LLM | `globalPlan` + lista `miniActivities` com `targetProjectId`, ordem, dependências |
| Derivação | Código determinístico | Por mini-activity: `task.md` / prompt = fatia do PLAN + excerpt SPEC |
| Runs filhos | `createRunFromTask` existente | N × run index com `parent_workspace_run_id` |
| Execução | Orquestrador sequencial | Um filho de cada vez (v1) |

### 4.2 Relação com strategy actual

O runtime já tem `strategy/decomposition.json` e `execution-order.json` **por run**. Para workspace:

- **PLAN global** vive no `WorkspaceRun` (novo).
- Cada run filho pode gerar strategy **local** normalmente, ou receber `strategy/` pré-preenchido a partir da mini-activity (modo “skip LLM” parcial, alinhado a smokes existentes).

Evitar duplicar dois sistemas de subtasks: mini-activity = unidade cross-repo; subtask strategy = unidade intra-repo.

---

## 5. Execução sequencial

### 5.1 Ordem e dependências

- `miniActivities` ordenadas por `order` + validação de `dependsOn` (DAG simples).
- v1: **apenas execução linear** (ignorar paralelismo mesmo se PLAN sugerir).

### 5.2 Máquina de estados do orquestrador

| Estado WorkspaceRun | Condição |
|---------------------|----------|
| `planning` | SPEC/PLAN em geração ou revisão humana |
| `ready` | PLAN aprovado; nenhum filho iniciado |
| `running` | filho actual em execução |
| `waiting_user` | filho em clarify/strategy/git HITL |
| `completed` | todos required concluídos |
| `failed` | filho required falhou e `stopOnError=true` |
| `cancelled` | operador cancelou workspace run |

### 5.3 Comportamentos operacionais

| Cenário | Proposta v1 |
|---------|-------------|
| Parada em erro | Pausar orquestrador; filhos seguintes `pending`; expor qual falhou |
| Retomada | `POST /workspace-runs/:id/resume` — retoma filho falho ou avança após HITL |
| Skip | `POST .../mini-activities/:id/skip` — marca `skipped`, avança se não `required` |
| Retry | Reutilizar retry de job/run existente no filho; orquestrador re-enfileira |
| Rollback manual | **Fora de escopo v1** — documentar: operador faz revert/reset por repo; workspace só regista `rolled_back` em metadados |
| Lock | Manter `project-lock` por filho; orquestrador nunca dispara dois filhos no **mesmo** `projectId` em paralelo |

### 5.4 Onde viver o orquestrador

Opções:

1. **Job dedicado** `workspace_run_orchestrate` na fila — polling dos filhos via `collectExecutionForRun` / job status.
2. **Módulo** `scripts/daemon/lib/workspace-run-orchestrator.js` chamado no tick do worker após cada transição de job filho.

Preferência: **(1)** para observabilidade na mesma fila e smokes.

---

## 6. Git multi-projeto

### 6.1 Branch name global

- Calcular **uma vez** no `WorkspaceRun`: `suggestActivityBranchName({ title, date, prefix: workspace.gitPolicy.branchPrefix })`.
- Ao `prepareRunGitBranch` de cada filho: passar `activityBranch` explícito (extensão API) em vez de sugerir de novo por run.

### 6.2 Prepare por projeto

Sequência por filho (já implementada):

1. `git pull --ff-only` na `baseBranch` do `projectsMeta`
2. `git checkout -b <activityBranch>` (ou checkout se existe)
3. `run-context.git.status = git_branch_ready`

Orquestrador: opcionalmente **preparar branch de todos os projectos** antes do primeiro execute (modo “batch prepare”) — UX melhor, risco de branch órfã se actividade cancelada cedo.

**v1 recomendado:** prepare **just-in-time** antes do execute de cada filho (menos branches abandonadas).

### 6.3 baseBranch por projeto

Ler de `workspace.projectsMeta[projectId].defaultBaseBranch` com fallback `main`/`master` (`run-git-branch-api.js` já tem candidatos).

### 6.4 Commit / push / PR por projeto

Sem alteração nos módulos `git-approved-run-*` — cada filho com review approved dispara commit no seu repo.

`aggregateGit` no WorkspaceRun: rollup de `run-context.git` de cada filho (job de sync periódico ou hook pós-evento).

### 6.5 Projeto sem alteração

Mini-activity com `mutationExpected: false` ou PLAN “no-op”:

- Estados: `skipped` ou `completed` sem job execute.
- Git: `not_required` em `aggregateGit` — não bloquear workspace run.

### 6.6 Casos de falha parcial

| Situação | Risco | Mitigação |
|----------|-------|-----------|
| Branch preparada em API, execute falhou no front | API branch órfã | Status por projeto; CTA “limpar branch” manual |
| Commit em API, front ainda não | integração quebrada | PLAN com ordem explícita; PRs etiquetados com `workspaceRunId` |
| PR só num repo | release incompleto | UI “PR group” com checklist |

---

## 7. SPEC e PLAN

| Artefacto | Âmbito | Local sugerido |
|-----------|--------|----------------|
| Global SPEC | workspace run | `WorkspaceRun.globalSpec` + opcional ficheiro em `.setup-boss/workspace-runs/<id>/global-spec.md` |
| Global PLAN | workspace run | idem `global-plan.md` + `miniActivities[]` estruturado |
| SPEC local | run filho | `<outputDir>/task.md` ou secção em metadata |
| PLAN local | run filho | strategy/decomposition existente |
| Clarificação | híbrido | Perguntas **globais** no WorkspaceRun; perguntas **só API** no filho API |

Gate de approve: hoje `loadApprovalState` por run — workspace precisa `workspacePlanApproved` antes de iniciar orquestração (novo gate HITL).

---

## 8. UI Mission Control (proposta)

### 8.1 Navegação

```text
Workspaces (lista)
 └── Workspace "wiser-bot"
      ├── Nova atividade global
      └── Workspace runs
           └── WS-Run "Feature X"
                ├── SPEC / PLAN global (tabs)
                ├── Timeline agregada
                ├── Branch global (read-only + link prepare all)
                └── Mini-activities
                     ├── [API] Run … — status, Git, logs
                     └── [Front] Run … — status, Git, logs
```

### 8.2 Reuso de componentes

| Componente actual | Uso |
|-------------------|-----|
| `RunViewShell` | drill-down num filho (mantém projectId) |
| `PrepareGitBranchCard` | por filho; badge se branch ≠ global esperado |
| `OrchestrationRunControls` | por filho |
| `ProjectActivitySidebar` | mantém projectos soltos; secção “Workspaces” acima |

### 8.3 Estado agregado

Chip no header do WorkspaceRun:

- `3/4 mini-activities concluídas`
- `waiting_user` se algum filho em clarify/strategy/git
- Git rollup: `2/2 branches ready`, `1/2 committed`

### 8.4 SSE / polling

- Novo canal ou query `workspaceRunId`
- Invalidar queries filhas quando orquestrador avança

---

## 9. Riscos

| Risco | Severidade | Notas |
|-------|------------|-------|
| Conflito semântico “workspace” vs Managed Workspace | Média | Renomear tipos no código cedo |
| Branch parcialmente preparada | Alta | JIT prepare; estado `aggregateGit` |
| Commit parcial | Alta | Ordem no PLAN; checklist PR |
| PR parcial | Alta | Não auto-merge workspace-wide |
| Falha a meio da sequência | Alta | `stopOnError`, resume explícito |
| Inconsistência índice run vs workspace | Média | transacções append-only + validador |
| Reexecução / runId duplicado | Média | `workspaceRunId` novo; não reutilizar filhos |
| Duplicidade de branch | Baixa | prepare idempotente já trata `git_branch_exists` |
| Alteração fora do escopo (allowed_files) | Média | por filho; SPEC global delimita paths |
| Lock entre filhos do mesmo projeto | Baixa | sequencial + lock existente |
| Drift SPEC global vs código aplicado | Alta | revisão humana no PLAN global antes de orchestrate |

---

## 10. Perguntas em aberto

1. **Onde vive o intake global?** No Setup-Boss repo, no `primaryProjectId`, ou pasta neutra `.setup-boss/workspace-runs/<id>/`?
2. **Um workspace pode incluir o mesmo repo duas vezes?** (monorepo packages) — assumir não na v1.
3. **Clarificação única ou por filho?** Híbrido parece certo; custo UX a validar.
4. **Strategy LLM por filho obrigatória?** Ou inject PLAN slice como `strategy-ready` skip?
5. **Managed root vs path local:** workspace mistura projectos clonados e pastas locais?
6. **Cancelamento:** cancelar workspace cancela job do filho activo apenas ou todos pending?
7. **Arquivo:** workspace runs antigos — política igual a `run` archive?
8. **Tenant/cloud:** este discovery assume daemon local; multi-tenant adia `tenant_id`?

---

## 11. Plano incremental (fases pequenas)

| Fase | Entregável | Dependências |
|------|------------|--------------|
| **A — Modelo workspace** | `workspaces.json`, CRUD API, validação `projectIds` | — |
| **B — WorkspaceRun + SPEC/PLAN storage** | índice workspace-runs, criação manual, artefactos globais | A |
| **C — Decomposição mini-activities** | LLM ou formulário → `miniActivities[]`, sem executar | B |
| **D — Runs filhos + orquestrador sequencial** | extensão run index, job orchestrate, resume/skip | C |
| **E — Git branch global multi-projeto** | `activityBranch` propagado; `aggregateGit` | D |
| **F — UI Mission Control workspace** | lista, detalhe, drill-down filho | A–E |
| **G — Smoke local multi-projeto** | 2 repos temp, workspace run linear, prepare+execute+commit | D–E |

### Critérios de aceite por fase (resumo)

- **A:** criar workspace com 2 projectIds registados; persistir após restart daemon.
- **B:** criar WorkspaceRun com título + SPEC/PLAN markdown; ler na API.
- **C:** PLAN gera ≥2 mini-activities com `targetProjectId` válido.
- **D:** executar sequência: filho1 `completed` antes de filho2 `pending→running`.
- **E:** mesma `activityBranch` em dois `run-context.git` após prepare.
- **F:** operador vê progresso agregado sem abrir sidebar de outro projecto à mão.
- **G:** `npm run smoke:workspace-multiproject` verde offline.

---

## 12. Recomendação — primeira fase de implementação

**Implementar Fase A apenas:**

1. Ficheiro `.setup-boss/workspaces.json` + módulo `core/workspace-registry.js` (espelho leve de `project-registry.js`).
2. Endpoints `GET/POST/PATCH/DELETE /workspaces` em `runtime-api.js`.
3. Testes unitários de validação (projectIds existem, sem duplicados, slug único).
4. **Sem** WorkspaceRun, **sem** orquestrador, **sem** UI além de opcional lista read-only (pode ser Fase A.1 mínima).

**Porquê:** desacopla o vocabulário e persistência do resto do pipeline; permite registar “wiser-bot = api + front” e validar o modelo com utilizadores antes de tocar em `writeRunIndex` e na fila.

**Segunda entrega sugerida:** Fase B (WorkspaceRun estático) + extensão do run index com campos opcionais `workspace_id` / `parent_workspace_run_id` **sem** orquestração — prepara Fase D com risco baixo.

---

## 13. Arquivos e módulos relevantes (mapa rápido)

| Área | Ficheiros |
|------|-----------|
| Project registry | `scripts/daemon/lib/project-registry.js` |
| Run index | `core/run-resolver.js` |
| Fila / jobs | `scripts/daemon/lib/queue-store.js`, `worker-pool.js` |
| Intake | `scripts/daemon/lib/run-intake-api.js` |
| Execute | `scripts/daemon/lib/run-execute-api.js` |
| Git branch/commit/push/PR | `run-git-branch-api.js`, `core/git-approved-run-*.js`, `core/suggest-activity-branch.js` |
| Strategy | `scripts/daemon/lib/run-strategy.js` |
| Orquestração sync | `scripts/daemon/lib/run-orchestration-sync.js` |
| API | `scripts/daemon/runtime-api.js` |
| Locks | `scripts/daemon/lib/project-lock.js` |
| UI shell | `frontend/stores/mission-shell-store.ts`, `ProjectActivitySidebar.tsx` |
| Git UX | `PrepareGitBranchCard.tsx`, `OrchestrationRunControls.tsx` |
| Discovery prévio | `docs/discovery-project-workspaces-multirepo.md` |
| Runbook Git | `docs/git-workflow-operational-runbook.md` |
| Smokes Git | `scripts/smoke/git-flow-e2e-smoke.js` |

---

## 14. Execução deste discovery

| Item | Valor |
|------|--------|
| Data | 2026-05-16 |
| Alterações de código | nenhuma |
| Ficheiros criados | `docs/reports/2026-05-16-workspace-multiproject-discovery.md` (este) |
| Método | leitura de registry, run-resolver, queue, runtime-api, git flow, strategy, UI shell, docs discovery prévios |
| Conclusão | Viável reutilizar **run padrão por mini-activity** + orquestrador sequencial; maior trabalho em índices, gates de PLAN global e UI agregada |

---

*Fim do relatório — append-only; acrescentar secções `## Execução` abaixo em implementações futuras.*
