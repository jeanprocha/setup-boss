# Relatório — Aprovação separada do plano (Fase 5)

**Data:** 2026-05-17  
**Tipo:** append-only  
**Escopo:** Fase visual **Aprovação** com plano completo, CTAs aprovar/voltar ao planejamento, sem versionamento/execução automática

---

## Resumo

Criada a fase operacional **Aprovação** como painel central dedicado, activado quando `operationalUx.uxPhase === "approval"` (ou plano final + gate HITL). Reutiliza `translateOperationalPlan`, `useClarificationMutations` (`approve`, `requestRefinement`) e APIs reais existentes. A coluna central deixa de mostrar timeline legada (`RefinedPlanPanel` / `ApprovalFlow`) enquanto a fase operacional está activa.

---

## Arquivos criados

| Arquivo | Função |
|---------|--------|
| `frontend/lib/runtime/operational/approval-operational-state.ts` | Visibilidade da fase + acções operacionais (`canApprove`, `canReturnToPlanning`) |
| `frontend/lib/runtime/operational/approval-operational-state.test.ts` | 5 testes unitários |
| `frontend/components/features/planning/OperationalPlanDocument.tsx` | Documento do plano (partilhado Fase 4 e 5) |
| `frontend/components/features/planning/ApprovalPhasePanel.tsx` | UI da fase Aprovação |

## Arquivos alterados

| Arquivo | Alteração |
|---------|-----------|
| `frontend/components/features/planning/PlanningOperationalPlanPanel.tsx` | Usa `OperationalPlanDocument`; banner “Plano final gerado → Aprovação” |
| `frontend/components/features/run-detail/RunViewShell.tsx` | `runApprovalPhase` + `ApprovalPhasePanel`; bloqueia scroll auto e slots legados |
| `frontend/lib/runtime/operational/index.ts` | Re-exports approval-operational |
| `frontend/lib/runtime/operational/operational-ux-selectors.ts` | Subheadline em fase approval |
| `frontend/hooks/use-clarification-mutations.ts` | Audit copy sem “estratégia” |
| `package.json` | Teste approval no script `npm test` |

---

## Como a fase Aprovação foi criada

1. **`shouldShowApprovalPhasePanel`** — activa quando:
   - não é inicialização nem execução;
   - bundle clarification válido;
   - aprovação ainda não feita;
   - `operationalUx.uxPhase === "approval"` **ou** `finalPlanReady` + `shouldShowClarificationApprovalGate`.

2. **`RunViewShell`** — precedência central:
   - Inicialização → **Aprovação** → Montando o plano → timeline legada.
   - `runOperationalCentralPhase` oculta `ClarificationPanel`, `RefinedPlanPanel` e `ExecutionPanel` no centro.

3. **`ApprovalPhasePanel`** — cabeçalho com `operationalPhaseLabelForUi` → **“Aprovação”** (via contrato Fase 1, sem termos técnicos).

---

## Como o plano final é exibido

- **`translateOperationalPlan`** (Fase 4) com bundles reais clarification + strategy.
- **`OperationalPlanDocument`** com `detailed={true}` na Aprovação: resumo, plano de execução, complexidade, riscos, mini-tasks, observações.
- Texto introdutório: execução só avança após aprovação explícita.

---

## Como aprovar plano funciona

| Passo | Implementação |
|-------|----------------|
| CTA | **Aprovar plano** → confirmação → `mutations.approve.mutate()` |
| API | `POST .../clarification/approve` (existente) |
| Gate | `deriveOperationalApprovalActions` — permite em `refinement_ready` ou `awaiting_approval` com refinement disponível e 0 perguntas pendentes |
| Pós-sucesso | Invalidação queries; painel central sai da Aprovação; timeline legada disponível (sem forçar scroll para execução durante approval) |

---

## Como voltar para planejamento funciona

| Passo | Implementação |
|-------|----------------|
| CTA | **Revisar planejamento** |
| API | `POST .../clarification/refine` via `mutations.requestRefinement` |
| Efeito UX | Runtime regressa ao fluxo de refinamento; `shouldShowApprovalPhasePanel` deixa de ser verdadeiro; **`PlanningPhasePanel`** volta (perguntas e/ou plano operacional) |

---

## Impedir avanço automático para execução

| Mecanismo | Detalhe |
|-----------|---------|
| Coluna central | `ExecutionPanel` só em `embeddedSlots` quando `!runOperationalCentralPhase` |
| `executionAppliesToRun` | Falso em fase `clarification` — execução não entra no centro antes da mudança de fase macro |
| Scroll automático | `consumeStrategyBootstrap` / `consumeExecutionBootstrap` ignorados enquanto `runApprovalPhase` |
| Aprovação explícita | Sem CTA de execução na fase Aprovação |

---

## Limitações

- **Reject** — não exposto na UI operacional (fora do escopo; API existe).
- **Strategy pré-approve** — se o runtime gerar decomposition antes do approve, o plano na Aprovação já pode incluir mini-tasks (dados reais, não mock).
- **Pós-approve** — strategy arranca no backend (comportamento existente); versionamento/branch/execução UI continuam nas fases seguintes da timeline.
- **Comentários** — sem thread; “Revisar planejamento” usa refinamento completo.

---

## Validação manual

### Testes automáticos

```bash
node --experimental-strip-types --test frontend/lib/runtime/operational/approval-operational-state.test.ts
```

**Esperado:** 5/5 passando (suite operational Fases 1–5 ≥ 36 testes).

### Stack (`npm run dev:stack`)

1. Concluir Inicialização → Montando o plano (perguntas + plano) até **Plano final gerado**.
2. Coluna central muda para **Aprovação** (título e copy operacionais).
3. Ver plano completo com todas as secções disponíveis.
4. **Revisar planejamento** → regressa a Montando o plano (sem aprovar).
5. Voltar à Aprovação → **Aprovar plano** → confirmar → aprovação registada; centro deixa a fase Aprovação.
6. Confirmar que execução **não** abre automaticamente no centro antes do passo 5.
7. Ausência de “strategy”, “runtime”, “architect” no painel central.

---

## Critérios de aceite

| Critério | Estado |
|----------|--------|
| Plano final gerado leva para fase “Aprovação” | ✅ |
| Utilizador vê plano completo | ✅ |
| Utilizador pode aprovar | ✅ |
| Utilizador pode voltar ao planejamento | ✅ |
| Execução não inicia automaticamente no centro | ✅ |
| Sem mocks novos | ✅ |

---

## Referências

- Fase 4: `docs/reports/2026-05-17-planejamento-plano-operacional-phase4.md`
- Fase 3: `docs/reports/2026-05-17-planejamento-perguntas-phase3.md`
- Contrato UX: `docs/reports/2026-05-17-ux-operational-contract-phase1.md`
