# Fase E — Validação ponta a ponta WorkspaceRun multi-projeto

**Data:** 2026-05-18  
**Cenário alvo:** workspace `wiser` (`wiser-bot-front` + `wiser-bot-api`), task «Criar exportação PDF dashboard».

---

## Bugs corrigidos nesta fase

| Bug | Impacto | Correção |
|-----|---------|----------|
| Subtasks multi-repo sem `ai_mode` | Strategy falhava com `strategy_readiness_invalid` | `decompose-task-multi-project.js` passa `ai_mode` do `ai-strategy` |
| `decomposition.strategy: multi_repo_workspace` rejeitada | Pipeline strategy abortava | `validate-strategy-artifacts.js` aceita `multi_repo_workspace` |
| Passo «integrar» atribuído à API | Ordem cross-repo errada | Integração forçada ao projeto front + dependência da API |
| UI não atualizava após materialização | Mini-atividades só apareciam após refresh manual | SSE `workspace_run.updated` pós-sync + polling 4s em fase planning |
| `run-context.workspace` sem `projectIds` | Checklist E.1 incompleto | `patch-run-context-workspace-link` + metadata `workspaceProjectIds` no intake |

---

## Checklist de validação

Legenda: ✅ validado (automático ou código); ⚠️ requer confirmação manual na UI; ❌ falhou

### 1. Criação

| Item | Status | Evidência |
|------|--------|-----------|
| Atividade nasce como WorkspaceRun | ✅ | Smoke `createWorkspaceRun` + registry |
| Planning run vinculada (`globalSpec.planningRunId`) | ✅ | Smoke após `updateWorkspaceRun` / sync |
| `run-context` contém `workspaceRunId`, `workspaceId`, `projectIds` | ✅ | Smoke lê `run-context.json` após intake |

**Nota:** WorkspaceRuns criados **antes** desta correção (ex. `wsrun_20260518-012445-*`) podem estar sem `planningRunId` e sem minis — criar **nova atividade** no Mission Control.

**Nota:** O workspace `wiser` referencia `proj_3326f20c` que pode não existir em `projects.json` — confirmar registo do projeto API em GET `/projects` ou re-registar repositório.

### 2. Planejamento

| Item | Status | Evidência |
|------|--------|-----------|
| Clarificação funciona | ⚠️ | Fluxo existente; não re-executado no browser nesta sessão |
| Plano considera front + api | ⚠️ | Depende do LLM/plano refinado; decomposição multi-repo lê bullets do plano |
| Comentário no plano | ⚠️ | Sem alteração nesta fase — validar na UI |
| Aprovação dispara strategy | ✅ | `autoStartStrategyAfterApproval` + smoke com plano aprovado seed |

### 3. OES

| Item | Status | Evidência |
|------|--------|-----------|
| `multiRepo=true` | ✅ | Smoke: `operational-executable-strategy.json` |
| MiniTasks com `projectId` / `repositoryName` | ✅ | Smoke assert por miniTask |
| Dependências cross-repo | ✅ | Smoke: integração `dependsOnIds` → task API |

### 4. Materialização

| Item | Status | Evidência |
|------|--------|-----------|
| `miniActivities` automáticas no WorkspaceRun | ✅ | Smoke: 3 minis após `triggerStrategyRun` |
| Sem add manual | ✅ | `syncWorkspaceAfterPlanningStrategy` only |
| Start só após materialização | ✅ | UI `isWorkspaceRunOperationalPhase`; smoke: start bloqueado sem minis |

### 5. Git agregado

| Item | Status | Evidência |
|------|--------|-----------|
| Git agregado só após minis | ✅ | `WorkspaceRunViewShell` — card Git dentro de `operational` |
| Preparar Git multi-projeto | ⚠️ | `workspace-git-phaseE` / phaseG smokes existentes; validar manualmente com repos reais |

### 6. Execução

| Item | Status | Evidência |
|------|--------|-----------|
| Start → sequência correta | ⚠️ | Ordem materializada API < integração no smoke; orquestrador phaseG cobre sequência |
| API antes do front quando há dependência | ✅ | Smoke ordem `order` |
| Timeline etapa atual | ⚠️ | Sem regressão intencional — validar na UI |
| Review/correção granular | ⚠️ | Sem alteração — validar run filho |

### 7. Compatibilidade

| Item | Status | Evidência |
|------|--------|-----------|
| Run normal por projeto | ✅ | `decomposeTask` single inalterado quando sem workspace multi |
| Workspace single-project degrada | ✅ | `multiRepo: false` com 1 projeto no catálogo |
| Workspace sem minis não faz start cedo | ✅ | `workspace_run_no_mini_activities` no smoke |

---

## Testes executados

```bash
npm run smoke:workspace-multi-project-phaseE
node --test core/workspace-oes-phase-cd.test.js
```

**Smoke Phase E:** OK — 3 miniTasks OES, 3 miniActivities, materialização `phase=materialized`, guard de start sem minis.

---

## Procedimento manual recomendado (browser)

1. Confirmar projetos `wiser-bot-front` e `wiser-bot-api` em GET `/projects`.
2. Workspace `wiser` → **Nova atividade** → task «Criar exportação PDF dashboard».
3. Completar clarificação → plano com backend + frontend + integração → **Aprovar**.
4. Aguardar strategy (timeline da planning run) — workspace deve mostrar mini-atividades sem refresh prolongado (≤4s polling ou SSE).
5. Verificar Git agregado + **Start workspace run**.
6. Confirmar execução da mini API antes da integração/front.

---

## Ficheiros alterados (Fase E)

- `core/decompose-task-multi-project.js` — `ai_mode`
- `scripts/runtime/strategy-runtime/validate-strategy-artifacts.js` — estratégia `multi_repo_workspace`
- `core/patch-run-context-workspace-link.js` — `projectIds`
- `scripts/daemon/lib/run-intake-api.js` — metadata → context
- `scripts/daemon/lib/run-strategy-api.js` — SSE pós-materialização
- `scripts/runtime/clarification/clarification-runtime.js` — SSE via approve inline
- `frontend/hooks/use-create-workspace-run.ts` — `workspaceProjectIds`
- `frontend/hooks/use-workspace-run-detail.ts` — polling planning
- `scripts/smoke/workspace-multi-project-phaseE-smoke.js` — novo
- `package.json` — script `smoke:workspace-multi-project-phaseE`

---

## Resultado

O pipeline **intake → strategy multi-repo → materialização → UI operacional** está validado de forma programática. A validação manual na UI com os repositórios reais `wiser-bot-*` fica pendente apenas nos itens marcados ⚠️ (clarificação LLM, comentários no plano, Git real, execução/review ao vivo).
