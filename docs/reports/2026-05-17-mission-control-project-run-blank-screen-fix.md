# Relatório: Bugfix painel central em branco (Project → Run)

**Data:** 2026-05-17  
**Tipo:** correção cirúrgica (append-only)

---

## Causa raiz real

Três problemas combinados (além do sanitize de workspace já feito):

### 1. Prioridade errada no painel central (`AppShell`)

```tsx
selectedWorkspaceRunId ? <WorkspaceRunViewShell /> : <RunViewShell />
```

Com `selectedWorkspaceRunId` **e** `selectedRunId` no store (estado após integração workspace), o Mission Control **sempre** montava `WorkspaceRunViewShell`, mesmo com atividade de projeto seleccionada na sidebar. O utilizador via painel vazio/loading de workspace em vez do `RunViewShell`.

### 2. `setSelectedWorkspaceRun` mantinha `selectedRunId`

Ao abrir um WorkspaceRun, o run de projeto ficava no store mas o painel ignorava-o (regra acima) → sensação de “tela branca” e run “desaparecido”.

### 3. Query de runs apagava lista em erro/reconnect

Em `use-runs.ts`:

- `queryKey` incluía `{ reachable }` → mudança de conexão invalidava cache e refetch “frio”.
- `catch` devolvia `{ summaries: [], source: "error" }` → React Query tratava como sucesso com lista vazia → sidebar mostrava **0 atividades** em falha transitória.

---

## Evidências

| Sintoma | Mecanismo |
|---------|-----------|
| Painel central branco com run seleccionado | `WorkspaceRunViewShell` activo por `selectedWorkspaceRunId` residual |
| Atividades somem ao trocar projeto | Lista substituída por `[]` em erro ou nova query key |
| Fluxo antigo quebrado após Fase F–J | Conflito de seleção + prioridade de render, não API |

Backend `/projects` e jobs por projeto **não** foram alterados neste fix.

---

## Arquivos alterados

| Ficheiro | Alteração |
|----------|-----------|
| `frontend/lib/runtime/shell/central-shell-view.ts` | **Novo** — `resolveCentralShellView` (run > workspace) |
| `frontend/lib/runtime/shell/central-shell-view.test.ts` | **Novo** — testes |
| `frontend/lib/runtime/shell/pick-run-summaries.ts` | **Novo** — extrair summaries só de `source: runtime` |
| `frontend/components/regions/AppShell.tsx` | Prioridade Project→Run no painel central |
| `frontend/stores/mission-shell-store.ts` | `setSelectedWorkspaceRun` limpa `selectedRunId` ao entrar em workspace |
| `frontend/hooks/use-runs.ts` | Query key estável; erro propaga (throw); `enabled` com `reachable` |
| `frontend/components/regions/ProjectActivitySidebar.tsx` | `pickRunSummaries`; loading/erro explícitos |
| `frontend/hooks/use-workspace-run-selection-reconciliation.ts` | Só limpa workspace após fetch definitivo |
| `frontend/locales/pt-BR.ts`, `en.ts` | `sidebar.activitiesLoadError` |
| `package.json` | Teste `central-shell-view` no `npm test` |

---

## Correção aplicada

1. **`resolveCentralShellView`**: se `selectedRunId` → `RunViewShell`; senão, se `selectedWorkspaceRunId` → `WorkspaceRunViewShell`.
2. **Ao seleccionar WorkspaceRun**: `selectedRunId = null` (mantém `selectedProjectId` para voltar ao projeto).
3. **Runs**: sem `reachable` na query key; falha de rede não devolve lista vazia fictícia; sidebar distingue loading / erro / vazio real.
4. **Reconciliação workspace**: não limpa `selectedWorkspaceRunId` durante loading inicial.

---

## Validações executadas

```bash
node --test frontend/lib/runtime/shell/central-shell-view.test.ts
node --test frontend/lib/runtime/shell/mission-shell-selection-sanitize.test.ts
# 6/6 pass
```

**Manual** (com `npm run dev:stack`):

1. Seleccionar atividade existente → `RunViewShell` com timeline.
2. Trocar WISER-BOT-API → lista carrega; seleccionar run.
3. Trocar WISER-BOT-FRONT → idem.
4. WorkspaceRun → painel workspace; clicar run na sidebar → volta a Project→Run.
5. Refresh com run persistido → sanitize + painel de run.
6. Lista não zera em falha curta (mensagem de erro ou dados anteriores via `keepPreviousData` no refetch).

---

## Riscos restantes

- Erro persistente de API ainda mostra lista vazia com mensagem de erro (correcto).
- `invalidateQueries({ queryKey: runtimeQueryKeys.root })` ainda força refetch global — pode haver flash curto ao criar run.
- Sem E2E browser automatizado neste patch.

---

## Resultado

**Project → Run** volta a ser o fluxo dominante no painel central; Workspaces deixam de “sequestrar” a vista quando há `selectedRunId`; a sidebar deixa de reportar zero atividades por erro silencioso na query.
