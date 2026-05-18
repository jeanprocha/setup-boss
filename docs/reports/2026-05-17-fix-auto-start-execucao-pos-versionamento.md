# Relatório — Auto-start da execução após versionamento

**Data:** 2026-05-17  
**Tipo:** append-only  
**Escopo:** Transição operacional Versionamento → Execução sem terceiro clique em «Iniciar execução»

---

## Resumo

Após confirmar o versionamento (`git_branch_ready`), a UI passava à fase **Execução** mas mantinha o CTA **Iniciar execução**, exigindo confirmação redundante. A confirmação humana relevante já ocorre na aprovação do plano e na confirmação das branches.

---

## Causa raiz

1. **Transição de fase já existia** — `shouldShowVersioningPhasePanel` fica `false` com `git_branch_ready`; `shouldShowExecutionPhasePanel` fica `true` com plano aprovado + branch pronta.
2. **`ExecutionPhasePanel` era manual** — `deriveExecutionOperationalStatus` devolvia `awaiting_start` com `execution_pending` e o painel chamava `POST /runs/:id/execute` só no clique do botão.
3. **Cópia legada** — texto «não inicia automaticamente» e caixa «Confirme quando quiser iniciar» reflectiam o fluxo antigo (pré-fases operacionais).
4. **Sem política de auto-start** — ao contrário da strategy (auto-arranque pós-approve no servidor/UI), execução não tinha equivalente no fluxo operacional central.

**Não alterado:** runtime executor, DAG, orchestration interna, approval, versionamento, review, finalização.

---

## Como o auto-start foi implementado

| Peça | Função |
|------|--------|
| `execution-auto-start-policy.ts` | `shouldAutoStartExecutionAfterVersioning` — `git_branch_ready` + `execution_pending` + orchestration/job não activos |
| | `executionAutoStartInProgress` — UI sem CTA manual enquanto dispara |
| `use-execution-auto-start.ts` | `useEffect` dispara `executeRun.mutate()` uma vez por `runKey`; `retryAutoStart` só em falha |
| `ExecutionPhasePanel.tsx` | Remove botão «Iniciar execução» no fluxo pós-versionamento; banner «A iniciar execução automaticamente…»; «Tentar novamente» só se o auto-start falhar |

**API reutilizada:** `postExecuteRun` via `useOrchestrationMutations` (mesmo `POST /runs/:id/execute`).

---

## Proteções existentes

- **Uma tentativa por corrida** — `attemptedRef` por `runKey` evita loop de `mutate`.
- **Guards de orchestration** — só dispara se `availability.canExecute` (aprovação, strategy, git, runtime online).
- **Não re-dispara** se `execution_running`, job `running`/`pending`, ou orchestration activa.
- **Falha** — `autoStartFailed` bloqueia novo auto-disparo; utilizador vê erro + «Tentar novamente».
- **Fluxo legado** — se branch **não** está `git_branch_ready`, `showManualStart` mantém CTA manual (corrida antiga ou bypass).

---

## Arquivos alterados

| Arquivo | Alteração |
|---------|-----------|
| `frontend/lib/runtime/execution/execution-auto-start-policy.ts` | **Novo** — regras de elegibilidade |
| `frontend/lib/runtime/execution/execution-auto-start-policy.test.ts` | **Novo** — 6 testes |
| `frontend/hooks/use-execution-auto-start.ts` | **Novo** — hook de disparo |
| `frontend/components/features/planning/ExecutionPhasePanel.tsx` | Auto-start UI; CTA manual condicional |
| `package.json` | Inclusão do teste no `npm test` |

---

## Como validar manualmente

1. Corrida com plano **aprovado** → fase **Versionamento** → confirmar branch até `git_branch_ready`.
2. UI deve mudar para **Execução** sem pedir «Iniciar execução».
3. Deve aparecer «A iniciar execução automaticamente…» e, em seguida, progresso / mini-tarefas (ou estado `starting`/`running`).
4. Na rede: um `POST /runs/:id/execute` automático após entrar na fase.
5. Se o runtime estiver offline ou execute bloqueado: mensagem de erro + «Tentar novamente» (sem segundo fluxo de confirmação normal).
6. `node --test frontend/lib/runtime/execution/execution-auto-start-policy.test.ts` — 6 testes verdes.

---

## Critérios de aceite

| Critério | Estado |
|----------|--------|
| Após versionamento concluído, execução inicia automaticamente | OK |
| Botão «Iniciar execução» desnecessário nesse fluxo | OK |
| Fase Execução aparece correctamente | OK |
| Sem confirmação extra | OK |
| Sem mocks novos | OK |
