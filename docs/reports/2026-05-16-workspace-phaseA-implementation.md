# Relatório: Workspace Fase A — implementação

**Data:** 2026-05-16  
**Tipo:** implementação incremental (fundação estrutural)  
**Discovery de referência:** `docs/reports/2026-05-16-workspace-multiproject-discovery.md`

---

## Resumo

Implementada a Fase A do modelo **SetupWorkspace**: persistência em `.setup-boss/workspaces.json`, validação de integridade contra `projects.json`, repositório CRUD, APIs HTTP mínimas e testes/smoke. Nenhuma alteração ao pipeline de runs, fila, executor, review ou Git por corrida.

---

## Arquivos criados

| Ficheiro | Função |
|----------|--------|
| `core/validate-workspace.js` | Regras de validação |
| `core/validate-workspace.test.js` | Testes unitários validação |
| `scripts/daemon/lib/workspace-registry.js` | Storage + CRUD |
| `scripts/daemon/lib/workspace-registry.test.js` | Testes registry |
| `scripts/smoke/workspace-phaseA-smoke.js` | Smoke local |
| `frontend/lib/api/workspace-types.ts` | Contrato MC (sem UI) |
| `docs/workspace-model-phaseA.md` | Documentação do modelo |

---

## Arquivos alterados

| Ficheiro | Alteração |
|----------|-----------|
| `scripts/daemon/lib/daemon-paths.js` | `workspacesPath` |
| `scripts/daemon/runtime-api.js` | Rotas `/workspaces`, OPTIONS |
| `scripts/daemon/runtime-api.test.js` | Teste HTTP CRUD |
| `package.json` | `smoke:workspace-phaseA` + testes no `npm test` |

---

## Decisões tomadas

1. **Persistência única** em `workspaces.json` (paridade com `projects.json`), não subpastas — suficiente para Fase A e baixo custo operacional.
2. **`workspaceId`** gerado como `ws_<8 hex aleatório>` no create (não hash de conteúdo) para evitar colisões e simplificar API.
3. **Validação** em `core/validate-workspace.js` reutilizável por CLI futura; registry chama `findProjectRecord` do project-registry.
4. **PATCH** (não POST parcial) para update — primeira rota mutável com PATCH no runtime-api.
5. **Sem política** “um projeto só num workspace” — adiado para fase de produto (discovery menciona como opcional).
6. **Distinção explícita** SetupWorkspace vs Managed Workspace vs MainWorkspaceView — documentada e refletida no nome dos tipos frontend.

---

## Arquitetura implementada

```
POST /workspaces → validate-workspace → workspace-registry → workspaces.json
GET  /workspaces → listWorkspaces
GET  /workspaces/:id → getWorkspace
PATCH /workspaces/:id → updateWorkspace
DELETE /workspaces/:id → deleteWorkspace
```

Invariantes: todo `projectId` referenciado deve existir no registry; workspace não vazio; sem duplicados no array; `primaryProjectId` ⊆ `projectIds`.

---

## Validações executadas

| Comando | Resultado |
|---------|-----------|
| `node --test core/validate-workspace.test.js` | 4/4 pass |
| `node --test scripts/daemon/lib/workspace-registry.test.js` | 1/1 pass |
| `node --test --test-name-pattern "CRUD /workspaces" scripts/daemon/runtime-api.test.js` | 1/1 pass |
| `npm run smoke:workspace-phaseA` | OK |

---

## Riscos encontrados

| Risco | Mitigação |
|-------|-----------|
| Projeto removido do registry mas ainda listado num workspace | Fase futura: job de reconcile ou validação lazy no GET |
| Mesmo projeto em N workspaces | Documentado como limitação; política não aplicada |
| PATCH parcial sem campos obrigatórios no body | Merge com estado actual antes de validar |

---

## Pendências

- Expor funções workspace na CLI `setup-boss` (opcional)
- Reconcile ao apagar projeto (`DELETE /projects/:id`) — não remove referências em workspaces
- Proxy frontend `/api/runtime/workspaces` quando UI existir

---

## Limitações (Fase A)

- Sem WorkspaceRun, orquestração, DAG, scheduler
- Sem impacto em jobs, runs, run-context, Git
- Sem UI Mission Control
- Sem testes E2E browser

---

## Próximos passos naturais

1. **Fase B:** entidade `WorkspaceRun` + persistência `.setup-boss/workspace-runs/`
2. Campos de ligação em run index (`workspaceRunId`, `miniActivityIndex`)
3. UI: camada Workspace na sidebar
4. Reconcile registry ↔ workspaces ao delete project
5. Orquestrador sequencial (fase posterior ao modelo de runs filhos)
