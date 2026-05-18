# Fase F — UX operacional unificada do WorkspaceRun

**Data:** 2026-05-18

## Objetivo

Uma única experiência operacional: workspace como contexto multi-projeto sobre o mesmo shell e timeline das corridas individuais.

## Mudanças principais

### 1. Shell unificado

- **Planeamento e execução** passam pelo `RunViewShell` (mesma timeline, `OperationalPhaseStack`, painel direito).
- `WorkspaceRunViewShell` fica só para: nova atividade, idle do workspace, fallback sem planning run.
- `activateWorkspaceRunSelection` **mantém** `selectedRunId` da planning run após materialização (não troca mais de app).

### 2. Timeline única

- Clarificação → plano → aprovação → estratégia na corrida de planeamento.
- Execução multi-projeto aparece no mesmo stack (`OperationalPhaseStack`), fase «Execução».

### 3. Componentes reutilizados

| Novo | Base |
|------|------|
| `WorkspaceMiniActivityOperationalTimeline` | CSS `execution-mini-timeline` |
| `WorkspaceGitOperationalStrip` | Git minimalista, não painel DevOps |
| `WorkspaceOperationalPhasePanel` | Orquestração + timeline + git |
| `WorkspaceContextCard` | Topo do `RunViewShell` quando workspace activo |

### 4. Linguagem humana

- «Iniciar execução» / «Retomar execução» (não «Start workspace run»).
- «Branch da atividade» (não «Git agregado (workspace)»).
- «Esteira de execução» / «Por projeto».
- Removidos painéis «Planeamento em curso» / «orchestrator» do shell separado.

### 5. Git e minis no momento certo

- Git e minis só no painel operacional (`workspaceOperational`).
- Antes da materialização: só fluxo normal de planning (sem git agregado).

## Ficheiros tocados

- `frontend/stores/mission-shell-store.ts`
- `frontend/hooks/use-workspace-planning-phase-sync.ts`
- `frontend/components/features/run-detail/RunViewShell.tsx`
- `frontend/components/features/run-detail/OperationalPhaseStack.tsx`
- `frontend/components/features/workspace/WorkspaceRunViewShell.tsx`
- `frontend/components/features/workspace/WorkspaceOperationalPhasePanel.tsx`
- `frontend/components/features/workspace/WorkspaceMiniActivityOperationalTimeline.tsx`
- `frontend/components/features/workspace/WorkspaceGitOperationalStrip.tsx`
- `frontend/lib/workspace/workspace-mini-activity-operational.ts`
- `frontend/locales/pt-BR.ts`, `en.ts`

## Validação manual sugerida

Workspace `wiser` + task «Adicionar upload de anexos no chat»:

1. Criar atividade → mesma coluna central que run normal.
2. Clarificar / plano / aprovar → timeline contínua.
3. Após estratégia → cartão workspace + esteira por projeto + git discreto.
4. Painel direito visível durante todo o fluxo.
5. Sem salto para layout «segundo sistema».

## Regressão automática

```bash
npm run smoke:workspace-multi-project-phaseE
node --test frontend/lib/workspace/workspace-run-lifecycle.test.ts
```
