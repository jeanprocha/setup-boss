# Correção sidebar — Workspaces vs Projetos

**Data:** 2026-05-18

## Problema

A sidebar tratava projetos dentro de um workspace como subpastas com runs próprias, e ocultava esses projetos da lista **Projetos** (“projetos soltos”).

## Correção

| Antes | Depois |
|-------|--------|
| Workspace → projeto → atividades | Workspace → **só** atividades (`WorkspaceRun`) |
| Projetos em workspace sumiam de **Projetos** | **Todos** os projetos em **Projetos** |
| Expandir workspace carregava runs dos membros | Runs só para projetos expandidos em **Projetos** |

## Ficheiros

- `WorkspaceSidebarSection.tsx` — removido `renderProject`; metadado compacto de projetos + lista de workspace runs
- `ProjectActivitySidebar.tsx` — lista `projects` completa; sem `filterLooseProjects`
- `partition-projects-by-workspace.ts` — removidos `filterLooseProjects` e `collectWorkspaceMemberProjectIds`
- `partition-projects-by-workspace.test.ts` — teste de `resolveProjectsForWorkspace`
- i18n `workspace.noWorkspaceActivities`, `participantProjects`, `projectCountBadge`

## Seleção (inalterada na intenção)

- Workspace / workspace run → limpa projeto/run de projeto
- Projeto / run de projeto → limpa workspace

## Criação

- **+** no workspace → `POST /workspace-runs` (todos os `projectIds`)
- **+** no projeto → `POST /runs` (um `projectId`)
