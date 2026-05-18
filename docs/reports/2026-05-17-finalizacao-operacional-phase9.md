# Relatório — Finalização operacional (Fase 9)

**Data:** 2026-05-17  
**Tipo:** append-only  
**Escopo:** Fase visual **Finalização** pós-review confirmado, resumo consolidado, HITL finalizar/solicitar ajuste final

---

## Resumo

Após **Review concluído**, a coluna central entra em **Finalização** com checklist derivado de plano, branch, execução, review e pendências. CTAs **Finalizar atividade** e **Solicitar ajuste final** usam API real (`operational-finalization-state.json` + rotas `operational-finalization/*`). Sem mocks, sem push/PR/merge/deploy automáticos.

---

## Arquivos criados

| Arquivo | Função |
|---------|--------|
| `scripts/runtime/operational-finalization/operational-finalization-state.js` | Persistência HITL `operational-finalization-state.json` |
| `scripts/runtime/operational-finalization/operational-finalization-state.test.js` | Teste persistência |
| `scripts/daemon/lib/run-operational-finalization-api.js` | GET session, finalize, request-adjustment |
| `frontend/lib/runtime/operational/operational-finalization-types.ts` | DTOs e resumo |
| `frontend/lib/runtime/operational/build-operational-finalization-summary.ts` | Montagem do resumo final |
| `frontend/lib/runtime/operational/finalization-operational-state.ts` | Visibilidade fase Finalização |
| `frontend/lib/runtime/operational/finalization-operational-state.test.ts` | 4 testes |
| `frontend/lib/runtime/operational/operational-finalization-actions.ts` | Cliente HTTP |
| `frontend/hooks/use-operational-finalization.ts` | Query sessão HITL |
| `frontend/hooks/use-operational-finalization-mutations.ts` | Mutations finalize/adjust |
| `frontend/components/features/planning/OperationalFinalizationSummary.tsx` | Render checklist + ficheiros |
| `frontend/components/features/planning/FinalizationPhasePanel.tsx` | UI fase Finalização |

## Arquivos alterados

| Arquivo | Alteração |
|---------|-----------|
| `scripts/daemon/runtime-api.js` | Rotas `operational-finalization` |
| `scripts/daemon/lib/run-operational-review-api.js` | Repõe finalização `pending` ao reconfirmar review |
| `frontend/lib/runtime/operational/derive-operational-ux-contract.ts` | `uxPhase: finalization` quando review confirmado |
| `frontend/lib/runtime/operational/operational-ux-types.ts` | Input opcional HITL review/finalização |
| `frontend/hooks/use-orchestration.ts` | Passa estados HITL ao contrato UX |
| `frontend/components/features/run-detail/RunViewShell.tsx` | `runFinalizationPhase` + precedência |
| `frontend/lib/api/query-keys.ts` | `operationalFinalization` |
| `frontend/lib/runtime/operational/index.ts` | Re-exports |
| `package.json` | Testes finalização no `npm test` |

---

## Dados reais reutilizados

| Fonte | Uso no resumo |
|-------|----------------|
| `ClarificationBundle.approval` | Linha «Plano aprovado» |
| `RunSummaryDto.git` / `branchHint` | Linha «Branch preparada» |
| `ExecutionBundle` + lifecycle | Linha «Execução concluída» |
| `operational-review-state` (HITL) | Linha «Review confirmado» |
| `buildOperationalReviewDocument()` | Pendências, ficheiros alterados, riscos/blockers |
| `GET /runs/:id/operational-finalization` | Estado HITL (`pending` / `finalized` / `adjustment_requested`) |

---

## Como o resumo final é montado

`buildOperationalFinalizationSummary()` agrega checklist de 5 linhas:

1. **Plano aprovado** — `clarification.approval.status === "approved"`.
2. **Branch preparada** — `summary.git.status === "git_branch_ready"` + `activityBranch`, ou `branchHint`, ou heurística de versionamento concluído.
3. **Execução concluída** — `isExecutionOperationallyComplete(lifecycle, summary)` + progresso de subtasks.
4. **Review confirmado** — HITL review `confirmed` + timestamp quando disponível.
5. **Pendências conhecidas** — riscos do plano + blockers da execução (via documento de review); «Nenhuma» quando lista vazia.

Reutiliza `buildOperationalReviewDocument()` para `changedFiles` e `risksAndPending` sem duplicar heurísticas de evidência.

**Nota fixa UX:** push, PR, merge e deploy não são automatizados (`humanNextStepsNote`).

---

## Como finalizar atividade funciona

| Acção | API | Comportamento |
|-------|-----|---------------|
| **Finalizar atividade** | `POST /runs/:id/operational-finalization/finalize` | Grava `operational-finalization-state.json` (`finalized`), evento `operational_finalization_completed` |

Pré-condições (servidor): execução `execution_completed` + review HITL `confirmed`.

UI mostra banner **Atividade finalizada** com reforço de que push/PR/merge/deploy são decisão humana.

---

## Como ajuste final funciona

| Acção | API | Comportamento |
|-------|-----|---------------|
| **Solicitar ajuste final** | `POST /runs/:id/operational-finalization/request-adjustment` | Grava `adjustment_requested` na finalização, **redefine review para `pending`**, evento `operational_finalization_adjustment_requested` |

Comentário obrigatório. UI volta à fase **Review** (`shouldShowFinalizationPhasePanel` → false). Ao confirmar review novamente, `resetFinalizationOnReviewConfirm` repõe finalização em `pending` (exceto se já `finalized`).

**Sem reexecução automática** na Fase 9 — ajuste final é revisão humana; reexecução continua disponível na fase Review (Fase 8).

---

## Gaps / limitações

1. **Estado da run na fila** — `summary.state` pode permanecer `success`/`execution`; encerramento operacional é HITL em artefacto, não altera job queue global.
2. **Branch sem nome na API** — quando versionamento concluiu mas `git.activityBranch` falta, cópia genérica «Versionamento concluído».
3. **Arquivar run / Mission Control** — não integrado; apenas persistência local do HITL.
4. **Push / PR / merge / deploy** — explicitamente fora de âmbito (por desenho).
5. **Dupla query** — `useOperationalReview` e `useOperationalFinalization` também alimentam `useOrchestration` (cache React Query partilhado).

---

## Validação manual

```bash
node --experimental-strip-types --test frontend/lib/runtime/operational/finalization-operational-state.test.ts
node --test scripts/runtime/operational-finalization/operational-finalization-state.test.js
```

### Stack (`npm run dev:stack`)

1. Concluir até **Execução concluída** (Fase 7) e **Confirmar review** (Fase 8).
2. Coluna central passa a **Finalização** com checklist real.
3. Ver branch, execução, review e pendências (se existirem).
4. Ler aviso sobre push/PR/merge/deploy.
5. **Finalizar atividade** → banner **Atividade finalizada**; estado persiste em `.setup-boss/runs/.../operational-finalization-state.json`.
6. (Opcional) Nova corrida: **Solicitar ajuste final** → volta à fase **Review**.

---

## Critérios de aceite

| Critério | Estado |
|----------|--------|
| Após review concluído, UI entra em «Finalização» | ✅ |
| Resumo final real | ✅ |
| Finalizar atividade | ✅ |
| Solicitar ajuste final | ✅ |
| UI informa push/PR/merge não automáticos | ✅ |
| Atividade finalizada persistida | ✅ |
| Sem mocks novos | ✅ |

---

## Referências

- Fase 8: `docs/reports/2026-05-17-review-operacional-phase8.md`
- Review document: `build-operational-review-document.ts`
- Evidência: `useRunEvidence` / `review-output.json`
