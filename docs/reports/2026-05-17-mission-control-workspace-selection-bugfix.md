# Relatório: Bugfix seleção Workspace vs Project→Run

**Data:** 2026-05-17  
**Tipo:** correção cirúrgica (append-only)

---

## Causa raiz

1. **`setSelectedWorkspace` / `setSelectedWorkspaceRun` zeravam `selectedProjectId` e `selectedRunId`** ao interagir com a secção Workspaces. A sidebar deixava de ter projeto activo e o painel central caía em estado vazio ou inconsistente.

2. **Estado persistido conflituoso** (`localStorage`): `selectedWorkspaceRunId` stale coexistia com `selectedProjectId` / `selectedRunId`. O `AppShell` prioriza `selectedWorkspaceRunId` → mostrava `WorkspaceRunViewShell` com ID inválido em vez do fluxo Project→Run.

3. **Sem sanitização pós-hidratação** para resolver conflitos entre seleções projeto e workspace.

---

## Arquivos alterados

| Ficheiro | Alteração |
|----------|-----------|
| `frontend/stores/mission-shell-store.ts` | Workspace não limpa projeto/run; `setSelectedRun` limpa contexto workspace; migrate v4 + sanitize |
| `frontend/lib/runtime/shell/mission-shell-selection-sanitize.ts` | **Novo** — regras de prioridade Project→Run |
| `frontend/lib/runtime/shell/mission-shell-selection-sanitize.test.ts` | **Novo** — testes unitários |
| `frontend/components/features/PersistHydrationGate.tsx` | Sanitize após rehydrate |
| `frontend/hooks/use-workspace-run-selection-reconciliation.ts` | **Novo** — limpa `selectedWorkspaceRunId` stale |
| `frontend/components/features/MissionShellReconciliation.tsx` | Monta reconciliação workspace |
| `package.json` | Inclui teste sanitize no `npm test` |

---

## Correção aplicada

- **Seleccionar workspace** (expandir/focar): mantém projeto e run; só actualiza `selectedWorkspaceId` e limpa `selectedWorkspaceRunId`.
- **Seleccionar workspace run**: mantém projeto/run em background; painel central via `AppShell` continua a usar `WorkspaceRunViewShell` quando há `selectedWorkspaceRunId`.
- **Seleccionar projeto ou run**: limpa selecção workspace (`setSelectedProject` / `setSelectedRun`).
- **Hidratação + migrate v4**: `sanitizeMissionShellCrossSelection` remove conflitos (project+run ganham sobre workspace run activo no painel).
- **Workspace run inexistente**: hook de reconciliação faz `setSelectedWorkspaceRun(null)` → volta ao `RunViewShell` com projeto/run preservados.

---

## Validações executadas

```bash
node --test frontend/lib/runtime/shell/mission-shell-selection-sanitize.test.ts
# 3/3 pass
```

Cenários cobertos por teste:

- project + run + workspace run → limpa workspace
- project sem run + workspace run stale → limpa workspace
- só workspace → mantém

**Manual recomendado** (com `npm run dev:stack`):

- Abrir projeto com atividades → lista visível
- Seleccionar run → `RunViewShell` normal
- Trocar de projeto → runs do novo projeto
- Abrir workspace e voltar ao projeto → runs e selecção de projeto preservados
- Refresh com IDs stale → sanitize na hidratação; workspace run inválido limpo sem quebrar tela

`npx tsc --noEmit` no frontend reporta erros pré-existentes no repo; nenhum novo erro nos ficheiros deste fix.

---

## Riscos restantes

- Dois contextos activos em memória (projeto + workspace run): intencional para preservar retorno rápido; SSE de workspace pode manter-se ligado se `selectedWorkspaceId` persistir sem run.
- Reconciliação de workspace depende de fetch do detalhe (404/erro); breve flash de empty state possível antes do clear.
- Sem teste E2E browser automatizado neste patch.

---

## Resultado

Fluxo **Project → Run** volta a ser prioritário e estável; Workspaces deixam de “apagar” atividades ao focar a secção; estado persistido stale deixa de bloquear o painel central.
