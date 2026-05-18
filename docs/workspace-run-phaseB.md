# WorkspaceRun — Fase B (modelo estático)

**Data:** 2026-05-16  
**Pré-requisito:** Fase A (`SetupWorkspace`, `docs/workspace-model-phaseA.md`)  
**Escopo:** entidade `WorkspaceRun` + persistência + API CRUD. **Sem** orquestração, mini-activities executáveis, Git multi-projeto ou UI.

## Arquitetura

```
.setup-boss/workspace-runs/index.json
        ↑
workspace-run-registry.js
        ↑
validate-workspace-run.js  (+ getWorkspace da Fase A)
        ↑
runtime-api.js  →  /workspace-runs
```

Runs normais (`.setup-boss/runs/`) e pipeline intake→execute **não** são alterados.

## Modelo

| Campo | Tipo | Notas |
|-------|------|-------|
| `workspaceRunId` | string | `wsrun_YYYYMMDD-HHmmss-<slug-título>` (sufixo se colisão) |
| `workspaceId` | string | FK para `workspaces.json` |
| `title` | string | obrigatório |
| `description` | string \| null | opcional |
| `status` | enum | ver tabela abaixo |
| `globalSpec` | string \| object \| null | reservado (markdown/objeto) |
| `globalPlan` | string \| object \| null | reservado |
| `miniActivities` | array | vazio na Fase B; estrutura na Fase C |
| `childRunIds` | string[] | vazio; ligação futura a `runId` filhos |
| `createdAt` / `updatedAt` | ISO | |

### Status

| Valor | Uso Fase B |
|-------|------------|
| `draft` | default no create |
| `planned` | planeamento manual |
| `running` | reservado (orquestrador futuro) |
| `waiting_user_action` | HITL agregado futuro |
| `failed` / `completed` / `cancelled` | terminais lógicos |

## API

| Método | Rota | Notas |
|--------|------|-------|
| GET | `/workspace-runs` | Lista; `?workspaceId=` filtra |
| POST | `/workspace-runs` | 201; body: `workspaceId`, `title`, … |
| GET | `/workspace-runs/:workspaceRunId` | Detalhe |
| PATCH | `/workspace-runs/:workspaceRunId` | `workspaceId` imutável |
| DELETE | `/workspace-runs/:workspaceRunId` | Remove do índice |

Erros: `workspace_run_validation_failed` + `validation[]`.

## Ligação futura (Fase C+)

- `childRunIds[]` → `runId` em `.setup-boss/runs/<id>.json` (campo opcional `workspaceRunId` no índice — **não** implementado na Fase B)
- `miniActivities[]` → metadados por projeto (`targetProjectId`, `order`, `runId` filho)

## Limitações

- Sem decomposição IA, executor sequencial, scheduler, Git global
- Apagar workspace não apaga workspace runs (órfãos até reconcile)
- `childRunIds` não valida existência do run
- Sem ficheiro por run (só índice central) — extensível depois para `workspace-runs/<id>.json`

## Validação local

```bash
npm run smoke:workspace-run-phaseB
node --test core/validate-workspace-run.test.js scripts/daemon/lib/workspace-run-registry.test.js
node --test --test-name-pattern "CRUD /workspace-runs" scripts/daemon/runtime-api.test.js
```

## Próximos passos

1. **Fase C:** schema de `miniActivities` + ligação opcional no run index
2. Orquestrador sequencial (job daemon)
3. UI Mission Control: Workspace → WorkspaceRun → runs filhos
4. Reconcile delete workspace → workspace runs
