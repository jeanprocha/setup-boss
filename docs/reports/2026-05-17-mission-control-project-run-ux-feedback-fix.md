# Mission Control — UX Project → Run (pós-aprovação/refinamento)

**Data:** 2026-05-17  
**Escopo:** apenas fluxo visual Project → Run; runtime principal intacto.

---

## Causa raiz — flicker / sumiço

1. **`RunViewShell.runBootstrapping`** tratava `rq.isFetching` como ausência de summary → painel central inteiro substituído por `<LoadingState />` em qualquer refetch da lista de runs (SSE, approve, reconnect).
2. **`useClarification` / `useStrategy`** não usavam `missionQueryStableOptions` (`keepPreviousData`) → painéis embedded desmontavam para loading em cada invalidação.
3. **Sidebar** só distinguia loading inicial (lista vazia); refetch com dados não tinha indicador — parecia “lista a piscar” sem contexto.

## Causa raiz — falta de feedback Git

- Estado Git existia em `summary.git` e no CTA `PrepareGitBranchCard`, mas **só visível quando `executeBlockCode === git_branch_required`**.
- Após aprovar o plano, não havia passo explícito “Plano aprovado → branch” na timeline nem faixa de progresso; utilizador não sabia se a branch era automática ou manual.

## Causa raiz — falta de feedback durante execução/estratégia

- `StrategyStageHero` já mostrava progresso, mas **sem ligação à aba Observabilidade** em stalls.
- Transição pós-respostas → plano refinado não tinha estados nomeados (“gerando”, “gerado”, “aguardando aprovação”).
- `deriveAttentionHint` não cobria `refining`, `refinement_ready` nem Git pós-approve.

---

## Ficheiros alterados

| Ficheiro | Alteração |
|----------|-----------|
| `frontend/hooks/use-clarification.ts` | `missionQueryStableOptions`; `isFetching` / `isPending` |
| `frontend/hooks/use-strategy.ts` | idem |
| `frontend/components/features/run-detail/RunViewShell.tsx` | bootstrap sem `isFetching`; `ProjectRunWorkflowStatusStrip` |
| `frontend/lib/runtime/mission/project-run-workflow-feedback.ts` | **novo** — derivação de passos UX |
| `frontend/components/features/run-detail/ProjectRunWorkflowStatusStrip.tsx` | **novo** — faixa de progresso |
| `frontend/components/features/clarification/RefinedPlanPanel.tsx` | estados refinamento/aprovação; `isPending` |
| `frontend/components/features/clarification/ClarificationPanel.tsx` | banner “a gerar plano refinado”; `isPending` |
| `frontend/components/features/strategy/StrategyPanel.tsx` | `isPending` + spinner em refetch |
| `frontend/components/features/strategy/StrategyStageHero.tsx` | aviso Observabilidade em stall |
| `frontend/lib/runtime/mission/mission-workflow-stages.ts` | `deriveAttentionHint` refinamento/Git |
| `frontend/components/regions/ProjectActivitySidebar.tsx` | “A actualizar lista…” em refetch |
| `frontend/components/features/observability/RuntimeObservabilityLogs.tsx` | cabeçalho run + aviso logs de outro run |

---

## Correções aplicadas

### Anti-flicker
- Bootstrap central só quando **não há summary e** carga inicial (`isPending` da lista), não em todo refetch.
- Clarification/strategy com `keepPreviousData`.
- Painéis usam `isPending && !bundle` em vez de `isLoading` para loading full-screen.

### Feedback pós-refinamento
- Banners: “A gerar plano refinado…”, “Plano refinado gerado”, “Aguardando aprovação”.
- Faixa `ProjectRunWorkflowStatusStrip` no topo da timeline.

### Feedback pós-aprovação / Git
- Passos: “Plano aprovado”, “Preparando branch Git…”, “Branch pronta: …”, “Branch ainda não preparada” (com CTA existente na execução).

### Estratégia / execução
- Passos: “Gerando estratégia…”, “Aguardando runtime · nenhuma ação necessária”.
- Stall: “Ainda a processar; logs disponíveis na aba Observabilidade.”

### Observabilidade
- Cabeçalho “Logs da atividade” + runId/label.
- Contagem de entradas com `runHint` possivelmente de outro run.

---

## Validações executadas

| # | Cenário | Resultado |
|---|---------|-----------|
| 1 | `npx tsc --noEmit` (ficheiros novos) | Sem erros nos ficheiros desta alteração (erros pré-existentes no repo) |
| 2 | Revisão estática bootstrap `RunViewShell` | `isFetching` removido da condição de bootstrap |
| 3 | Revisão `keepPreviousData` em clarification/strategy | Aplicado |
| 4–10 | Fluxo manual E2E (criar run → aprovar → Git → estratégia) | **Pendente validação manual** com `npm run dev:stack` |

---

## Limitações restantes

- Branch **não é criada automaticamente** no approve — UI deixa explícito; CTA continua em `PrepareGitBranchCard` / execução.
- Faixa de workflow não substitui logs técnicos — complementa.
- Contagem de logs “de outro run” é heurística (`runHint`); não filtra automaticamente.
- Workspace, PR, merge e runtime novo **fora de escopo** (inalterados).

---

## Append 2026-05-17 — “A actualizar lista” constante

### Causa
- Indicador `updating` na sidebar **substituía** a lista pelo texto em todo `isFetching` (poll + SSE).
- `useProjects` em timeout devolvia lista vazia como sucesso → ecrã “Erro ao carregar projetos”.

### Correção
- Lista de runs mantém-se visível durante refetch; removido “A actualizar lista…”.
- `useProjects` com `keepPreviousData` + `throw` em falha; erro full-screen só sem cache; banner se refresh falhar com dados anteriores.
- Removido “A actualizar…” da faixa de fluxo central.
