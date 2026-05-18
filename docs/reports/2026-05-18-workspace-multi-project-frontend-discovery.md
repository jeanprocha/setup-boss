# Relatório — Discovery Workspace multi-projeto (frontend)

**Data:** 2026-05-18  
**Tipo:** discovery only  
**Documento completo:** [`docs/discovery/workspace-multi-project-frontend-discovery.md`](../discovery/workspace-multi-project-frontend-discovery.md)

---

## Resumo

O Mission Control **já tem** secção Workspaces (lista via `GET /workspaces`) e fluxo paralelo **WorkspaceRun** (painel central, Git agregado, mini-atividades, orquestração no daemon). O conceito pedido — workspace como **pasta lógica de projetos** com **uma conversa** multi-repo — **não está ligado** ao fluxo principal (`TaskComposer` → `POST /runs`).

A lista de **Projetos** continua plana e independente; criar workspace na UI está **desactivado**; não há CRUD workspace no client HTTP.

---

## Estado actual (frontend)

| Item | Situação |
|------|----------|
| Secção Workspaces na sidebar | Sim — só nomes + **WorkspaceRuns** |
| Projetos dentro do workspace | **Não** renderizados |
| Botão “Novo” → Criar workspace | Placeholder disabled |
| API workspaces | Só **leitura** (`fetchWorkspaces`) |
| Nova tarefa | Sempre **um** `projectId` (`useCreateRun`) |
| Painel central workspace | `WorkspaceRunViewShell` (separado de `RunViewShell`) |

---

## Conceito correcto vs implementação

| Alvo | Hoje |
|------|------|
| Workspace = 1+ projetos, sem tipo/principal | `SetupWorkspace` tem `primaryProjectId` + `description` opcional |
| Uma tarefa considera todos os projetos | Dois caminhos: run por projeto **ou** WorkspaceRun orquestrado (sem composer UI) |

---

## API backend (já existe)

`GET/POST/PATCH/DELETE /workspaces`, `GET/POST /workspace-runs` (+ git/start/resume). Persistência: `.setup-boss/workspaces.json`, `.setup-boss/workspace-runs/index.json`.

Falta no frontend: funções de escrita para workspaces e criação guiada de workspace-runs.

---

## Próximo passo recomendado

**Fase 1:** expor no frontend `POST/PATCH/DELETE /workspaces` (hooks + invalidação React Query), sem mudar sidebar ainda.

**Decisão antes da Fase 3:** tarefa do workspace via **WorkspaceRun** (menor refactor) vs. run multi-projeto em `/runs`.

---

## Riscos principais

- Confusão Workspace / WorkspaceRun / vista “connections”  
- Duplicidade de actividades  
- Runtime de plano/execução multi-repo ainda não unificado no fluxo principal  

---

## Plano em 6 fases

1. API client workspaces (write)  
2. Sidebar + criar/editar workspace  
3. Nova tarefa no contexto do workspace  
4. Plano multi-projeto  
5. Branch multi-repo  
6. Execução sequencial (orquestrador já parcial no backend)
