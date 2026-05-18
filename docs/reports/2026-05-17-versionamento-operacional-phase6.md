# Relatório — Versionamento operacional (Fase 6)

**Data:** 2026-05-17  
**Tipo:** append-only  
**Escopo:** Fase visual **Versionamento** pós-aprovação, preparação real de branches, sem PR/push/execução

---

## Resumo

Implementada a fase operacional **Versionamento** na coluna central do Mission Control: sugestão de nome de branch, lista de projetos envolvidos, ajuste pelo utilizador, confirmação e preparação via APIs reais (`POST /runs/:id/git-branch` e, quando aplicável, `POST /workspace-runs/:id/prepare-git`). Sem mocks, sem PR, sem push automático nesta fase.

---

## Arquivos criados

| Arquivo | Função |
|---------|--------|
| `frontend/lib/runtime/git/suggest-activity-branch.ts` | Sugestão de branch (paridade com `core/suggest-activity-branch.js`) |
| `frontend/lib/runtime/operational/versioning-operational-state.ts` | Visibilidade, estados, contexto multi-projeto |
| `frontend/lib/runtime/operational/versioning-operational-state.test.ts` | 7 testes unitários |
| `frontend/components/features/planning/VersioningPhasePanel.tsx` | UI da fase Versionamento |

## Arquivos alterados

| Arquivo | Alteração |
|---------|-----------|
| `frontend/lib/runtime/git/git-branch-actions.ts` | `postPrepareGitBranch(runKey, activityBranch?)` |
| `frontend/lib/runtime/git/git-branch-actions.test.ts` | Teste body com `activityBranch` |
| `frontend/hooks/use-git-branch-mutation.ts` | Mutation aceita nome de branch |
| `frontend/components/features/run-detail/RunViewShell.tsx` | `runVersioningPhase` + painel central; bloqueia scroll/slots legados |
| `frontend/lib/runtime/operational/index.ts` | Re-exports versioning |
| `package.json` | Teste versioning no script `npm test` |

---

## Integração git/workspace reutilizada

| Peça existente | Uso na Fase 6 |
|----------------|---------------|
| `POST /runs/:id/git-branch` | Modo **run** (corrida single-project) com `{ activityBranch }` |
| `POST /workspace-runs/:id/prepare-git` | Modo **workspace** quando `selectedWorkspaceRunId` + git agregado |
| `GET /workspace-runs/:id/git-status` | Poll de estado por projeto (workspace) |
| `useGitBranchMutation` | Confirmar versionamento (run) |
| `useWorkspaceRunMutations.prepareGit` | Confirmar versionamento (workspace) |
| `useRunSummary` / `useProjects` | Atualização de `git.status` e nomes de projetos |
| `derive-operational-ux-contract` → `uxPhase: versioning` | Título **Versionamento** via `operationalPhaseLabelForUi` |
| `core/suggest-activity-branch` (paridade TS) | Sugestão quando não há `branchHint` no summary |

**Produto respeitado:** apenas checkout/criação local de branch; sem PR; sem push na UI desta fase.

---

## Estados implementados

| Estado interno | Rótulo UI |
|----------------|-----------|
| `awaiting_confirmation` | Confirme o versionamento |
| `preparing_branches` | A preparar branches |
| `workspace_ready` | Workspace operacional pronto |
| `prepare_failed` | Falha na preparação |

Precedência no `RunViewShell`: **Versionamento** → Aprovação → Montando o plano → timeline legada.

---

## Como a fase Versionamento foi criada

1. `shouldShowVersioningPhasePanel` — activa após aprovação (`approval.status === approved` ou fases `approved` / `strategy_pending` / `ready_for_execution`), enquanto execução não aplicar.
2. `VersioningPhasePanel` — input de branch, lista de projetos, CTA **Confirmar versionamento**, rail de estados, banner **Workspace operacional pronto**.
3. Slots legados (`RefinedPlanPanel`, `PrepareGitBranchCard` na timeline) ocultos durante fase operacional central.

---

## Gaps backend/API

1. **Corrida run sem `projectId`** — lista de projetos vazia; UI bloqueia confirmação (sem simular projeto).
2. **Multi-projeto no Mission Control (run view)** — modo workspace só activa com `selectedWorkspaceRunId` na shell; corrida de projeto isolada usa 1 projeto. Workspace global continua em `WorkspaceRunViewShell`.
3. **Branch base por projeto** — API run não expõe `baseBranch` no summary; só no git-status de workspace.
4. **Sem endpoint read-only de sugestão** — sugestão calculada no frontend (paridade com core) ou lida de `branchHint` / `git.activityBranch` após primeira preparação.
5. **Retry por projeto (run)** — só workspace tem `retry-prepare-git/:projectId`; run reprepara via novo POST global.

---

## Limitações

- Poll 4s durante `git_branch_pending` / `preparing_branches`.
- Após `workspace_ready`, utilizador permanece no painel até execução assumir a timeline (sem auto-start de execução).
- `WorkspaceGitAggregatedCard` na vista workspace mantém-se (não substituída nesta fase).
- Erros reais do Git (dirty worktree, branch exists, etc.) propagados sem dados falsos de sucesso.

---

## Validação manual

### Testes automáticos

```bash
node --experimental-strip-types --test frontend/lib/runtime/operational/versioning-operational-state.test.ts
```

**Esperado:** 7/7 passando.

### Stack (`npm run dev:stack`)

1. Concluir fluxo até **Aprovar plano** (Fase 5).
2. Coluna central passa a **Versionamento** (não timeline com «Preparar branch»).
3. Ver nome de branch sugerido (editável).
4. Ver projeto(s) envolvido(s).
5. Ajustar nome → **Confirmar versionamento**.
6. Estado **A preparar branches** → conclusão **Workspace operacional pronto** (com repo Git válido).
7. Confirmar ausência de PR/push e que execução não arranca sozinha no centro.
8. Verificar que termos como `git_branch_required` não aparecem ao utilizador.

---

## Critérios de aceite

| Critério | Estado |
|----------|--------|
| Após aprovação, UI entra em «Versionamento» | ✅ |
| Nome de branch sugerido | ✅ |
| Projetos envolvidos visíveis | ✅ (1+ conforme contexto) |
| Utilizador pode ajustar nome | ✅ |
| Utilizador confirma preparação | ✅ |
| Branches preparadas com integração real | ✅ (quando runtime/Git OK) |
| Sem push automático | ✅ |
| Sem PR | ✅ |
| Sem mocks novos | ✅ |

---

## Referências

- Fase 5: `docs/reports/2026-05-17-aprovacao-plano-phase5.md`
- Fase 4: `docs/reports/2026-05-17-planejamento-plano-operacional-phase4.md`
- Workspace Git (Fase E): `scripts/daemon/lib/workspace-run-git-api.js`
- Run Git branch: `scripts/daemon/lib/run-git-branch-api.js`
