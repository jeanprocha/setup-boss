# Relatório — Execução operacional (Fase 7)

**Data:** 2026-05-17  
**Tipo:** append-only  
**Escopo:** Fase visual **Execução** pós-versionamento, CTA explícito, progresso real do runtime, sem review final/PR/push

---

## Resumo

Implementada a fase operacional **Execução** na coluna central: após **Workspace operacional pronto**, a UI transita para o painel de execução com CTA **Iniciar execução** (`POST /runs/:id/execute` via `useOrchestrationMutations`). Progresso, mini-tarefas e etapas derivam do bundle de execução real (`useExecution` / `GET` execution). Revisão e correcção automática aparecem como **Validando resultado** e **Ajustando automaticamente**, sem termos técnicos expostos.

---

## Arquivos criados

| Arquivo | Função |
|---------|--------|
| `frontend/lib/runtime/operational/execution-operational-state.ts` | Visibilidade, estados UX, tradução de lifecycle/subtasks |
| `frontend/lib/runtime/operational/execution-operational-state.test.ts` | 11 testes unitários |
| `frontend/components/features/planning/ExecutionPhasePanel.tsx` | UI da fase Execução |

## Arquivos alterados

| Arquivo | Alteração |
|---------|-----------|
| `frontend/lib/runtime/operational/versioning-operational-state.ts` | `isVersioningOperationallyComplete`; oculta versionamento quando branch pronta |
| `frontend/lib/runtime/operational/versioning-operational-state.test.ts` | Teste transição pós-`git_branch_ready` |
| `frontend/lib/runtime/operational/derive-operational-ux-contract.ts` | `uxPhase: execution` com git pronto; conclusão mantém fase Execução |
| `frontend/lib/runtime/operational/index.ts` | Re-exports execução operacional |
| `frontend/components/features/run-detail/RunViewShell.tsx` | `runExecutionPhase` + painel central; precedência sobre timeline legada |
| `package.json` | Teste execution no script `npm test` |

---

## Dados reais reutilizados

| Peça existente | Uso na Fase 7 |
|----------------|---------------|
| `useOrchestration` + `deriveExecuteAvailability` | Gate e CTA **Iniciar execução** (plano aprovado + branch pronta) |
| `useOrchestrationMutations.executeRun` | `POST /runs/:id/execute` — único arranque |
| `useExecution` + `fetchExecutionBundle` | Progresso, lifecycle, subtasks, blockers |
| `ExecutionProgressStrip` | Barra de progresso (`summary.progress`) |
| `useRunSummary` / poll 4s | Atualização durante orchestration activa |
| `useRunEvents` + `useRuntimeStallVisual` | Mensagem de stall quando aplicável |
| `deriveRunOperationalCoherence` | Sinal de processamento activo para poll/stall |
| `isOrchestrationActive` | Poll enquanto execução em curso |

**Sem mocks novos.** Timeline legada (`CentralExecutionTimeline`, `ExecutionPanel` técnico) fica oculta enquanto a fase operacional central está activa.

---

## Estados de execução implementados

| Estado interno | Rótulo UI |
|----------------|-----------|
| `awaiting_start` | Pronto para iniciar |
| `starting` | Preparando execução |
| `running` | Aplicando alterações |
| `validating` | Validando resultado |
| `adjusting` | Ajustando automaticamente |
| `checkpoint` | Salvando checkpoint |
| `blocked` | Execução bloqueada |
| `failed` | Falha na execução |
| `completed` | Execução concluída |

Rail de etapas (derivado do estado actual, não inventado): Preparando execução → Aplicando alterações → Validando resultado → Ajustando automaticamente → Salvando checkpoint → Concluído.

---

## Mini-tarefas

- Listadas quando `execution.bundle.subtasks` tem entradas (`selectOperationalMiniTasks`).
- Título e ordem reais do runtime; estado traduzido (`labelSubtaskStateForUser`: ex. `reviewing` → «Validando», `correcting` → «Ajustando»).
- Subtask activa destacada via `lifecycle.currentSubtaskId`.
- Sem rótulos `retry`, `correction`, `review` em inglês na UI.

---

## Revisão / correcção automática (tradução UX)

| Fase interna (`ExecutionLifecyclePhase`) | Cópia utilizador |
|----------------------------------------|------------------|
| `review_running` | Validando resultado |
| `correction_running`, `retry_running` | Ajustando automaticamente |
| `recovery_running`, `rollback_running` | Salvando checkpoint |

Não são mostrados: executor, orchestration, DAG, semantic propagation, correction loop, etc.

---

## Gaps / limitações

1. **Workspace multi-projeto** — gate `git_branch_ready` no summary de run single-project; workspace global mantém fluxo em `WorkspaceRunViewShell` (igual Fase 6).
2. **Bundle execution 404** — painel mostra «A carregar progresso» ou ausência de mini-tasks; não há dados fabricados.
3. **Review final / Finalização / PR / push** — fora de âmbito (fases futuras); `uxPhase` finalization não activa painel central nesta fase.
4. **Logs detalhados** — não expostos no painel central (continuam na timeline colapsada / observability).
5. **`ExecutionProgressStrip`** — legendas internas («Activas», etc.) mantidas na barra reutilizada; apenas o contexto operacional usa cópia PT simplificada.

---

## Validação manual

### Testes automáticos

```bash
node --experimental-strip-types --test frontend/lib/runtime/operational/execution-operational-state.test.ts
node --experimental-strip-types --test frontend/lib/runtime/operational/versioning-operational-state.test.ts
```

**Esperado:** 11 + 8 testes passando.

### Stack (`npm run dev:stack`)

1. Concluir até **Workspace operacional pronto** (Fase 6).
2. Coluna central passa a **Execução** (não permanece em Versionamento).
3. Confirmar que a execução **não** arranca sozinha.
4. Clicar **Iniciar execução**.
5. Ver progresso e etapa actual no centro.
6. Se existirem subtasks no runtime, ver **Mini-tarefas**.
7. Durante review/correction no backend, ver **Validando resultado** / **Ajustando automaticamente** (sem jargão técnico).
8. Ao terminar, ver banner **Execução concluída**.
9. Confirmar ausência de PR/push/review final nesta fase.

---

## Critérios de aceite

| Critério | Estado |
|----------|--------|
| Após versionamento pronto, UI entra em «Execução» | ✅ |
| Execução não inicia automaticamente | ✅ |
| Utilizador precisa clicar para iniciar | ✅ |
| Progresso real no centro | ✅ |
| Mini-tasks quando existirem | ✅ |
| Termos técnicos internos não expostos | ✅ |
| Execução concluída exibida claramente | ✅ |
| Nenhum mock novo | ✅ |

---

## Referências

- Fase 6: `docs/reports/2026-05-17-versionamento-operacional-phase6.md`
- Execute API: `scripts/daemon/lib/run-execute-api.js`
- Execution bundle: `frontend/lib/runtime/execution/execution-actions.ts`
