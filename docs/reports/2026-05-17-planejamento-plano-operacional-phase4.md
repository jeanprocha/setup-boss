# Relatório — Montando o plano: plano operacional (Fase 4)

**Data:** 2026-05-17  
**Tipo:** append-only  
**Escopo:** Exibir plano operacional real na fase “Montando o plano”, após entendimento, sem aprovação nem mocks

---

## Resumo

Implementada a **Fase 4** do fluxo operacional: depois do loop de perguntas (Fase 3), a coluna central continua em **Montando o plano** e passa a mostrar o **plano operacional** derivado de `refinement` (clarification) e `strategy` (quando disponível). Estados narrativos: **A gerar plano** → **Plano disponível** → **Plano final gerado**. Sem botão de aprovar, sem expor “strategy”, “refined plan” ou “architect” ao utilizador.

---

## Arquivos criados

| Arquivo | Função |
|---------|--------|
| `frontend/lib/runtime/operational/operational-plan-types.ts` | Modelo de apresentação do plano operacional |
| `frontend/lib/runtime/operational/translate-operational-plan.ts` | Tradução refinement + strategy → plano operacional |
| `frontend/lib/runtime/operational/planning-operational-plan-state.ts` | Estados + `shouldShowPlanningOperationalPlanPanel` |
| `frontend/lib/runtime/operational/translate-operational-plan.test.ts` | 2 testes de tradução |
| `frontend/lib/runtime/operational/planning-operational-plan-state.test.ts` | 4 testes de estado/visibilidade |
| `frontend/components/features/planning/PlanningOperationalPlanPanel.tsx` | UI do plano operacional |
| `frontend/components/features/planning/PlanningPhasePanel.tsx` | Router entendimento ↔ plano operacional |

## Arquivos alterados

| Arquivo | Alteração |
|---------|-----------|
| `frontend/lib/runtime/operational/planning-understanding-operational-state.ts` | Cede ao painel do plano quando entendimento concluído |
| `frontend/lib/runtime/operational/planning-understanding-operational-state.test.ts` | +1 teste de precedência Fase 4 |
| `frontend/lib/runtime/operational/index.ts` | Re-exports Fase 4 |
| `frontend/components/features/planning/PlanningUnderstandingPanel.tsx` | Copy do banner de entendimento concluído |
| `frontend/components/features/run-detail/RunViewShell.tsx` | `PlanningPhasePanel` + `runPlanningPhase` (Fases 3+4) |
| `package.json` | Novos testes no script `npm test` |

---

## Dados reaproveitados

| Fonte | Uso no plano operacional |
|-------|---------------------------|
| `useClarification` / `ClarificationBundleDto.refinement` | Resumo do entendimento, passos, riscos do refinement |
| `parseRefinedPlanPresentation` | Parsing seguro do markdown/DTO refinado (já existente) |
| `useStrategy` / `StrategyBundleDto` | Complexidade, mini-tasks, ordering, riscos, notas |
| `useOrchestration` → `operationalUx` | Rótulo de fase **Montando o plano** (`operationalPhaseLabelForUi`) |
| `isStrategyGenerationComplete` | Gate de **Plano final gerado** |
| `isClarificationCollectionComplete` | Transição entendimento → plano |

Nenhum mock novo; nenhum endpoint novo.

---

## Tradução strategy / refined plan → plano operacional

Função central: `translateOperationalPlan({ clarification, strategy?, planMarkdown? })`.

| Secção UI | Origem |
|-----------|--------|
| **Resumo do entendimento** | `parseRefinedPlanPresentation`: objetivo + escopo/decisões |
| **Plano de execução** | `ordering.sequence` (strategy) + `executionOrder` / critérios (refinement) |
| **Complexidade** | `strategy.complexity` com rótulos PT (ex.: “Carga de trabalho”, não “runtime”) |
| **Riscos** | `refinement.risks` + `strategy.risks` (deduplicados) |
| **Mini-tarefas** | `strategy.subtasks` com estados em PT (Planeada, Pronta, …) |
| **Observações operacionais** | `decompositionSummary`, `recommendation.operationalImpact`, `executionApproach`, `sharedContext.constraints`, exclusões de escopo |

Termos **não** renderizados na UI: strategy, refined plan, architect, runtime, orchestration, modelStrategy.

---

## Estados implementados

| Estado interno | Rótulo UI |
|----------------|-----------|
| `generating_plan` | A gerar plano |
| `presenting_plan` | Plano disponível |
| `plan_final_generated` | Plano final gerado |

Derivação: `derivePlanningOperationalPlanStatus` — considera `refining`, `strategy_generating` / `strategy_pending`, conteúdo traduzido e `isStrategyGenerationComplete`.

Visibilidade:

- **Entendimento** (`PlanningUnderstandingPanel`): perguntas/respostas activas.
- **Plano operacional** (`PlanningOperationalPlanPanel`): `refining` ou colecção de clarificação concluída (`isClarificationCollectionComplete`).
- **Router** (`PlanningPhasePanel`): escolhe um dos dois; `RunViewShell` oculta slots legados `ClarificationPanel` / `RefinedPlanPanel` enquanto `runPlanningPhase` está activo.

Polling 4s durante `generating_plan` (clarification + strategy).

---

## Limitações

- **Strategy antes do approve** — o bundle strategy só é consultado quando `useStrategy` aplica à corrida; mini-tasks/complexidade podem aparecer só após o runtime expor a fase 3.
- **Plano “final” sem strategy** — se strategy não aplicar, `plan_final_generated` com só refinement.
- **Aprovação** — não implementada; mensagem explícita de que aprovação é fase seguinte.
- **Comentários / voltar ao planejamento** — fora do escopo.
- **Após approve** — painel central deixa o escopo Fase 3+4; timeline legado reaparece (sem regressão intencional de execução).

---

## Validação manual

### Testes automáticos

```bash
node --experimental-strip-types --test frontend/lib/runtime/operational/planning-operational-plan-state.test.ts frontend/lib/runtime/operational/translate-operational-plan.test.ts frontend/lib/runtime/operational/planning-understanding-operational-state.test.ts
```

**Esperado:** 13/13 passando (suite operational ≥ 31 testes com Fases 1–3).

### Stack (`npm run dev:stack`)

1. Projeto com `.IA` válida → criar atividade → concluir Inicialização (Fase 2).
2. Responder perguntas de entendimento (Fase 3) → **Enviar respostas**.
3. Coluna central permanece **Montando o plano**; estado **A gerar plano** durante `refining` / geração.
4. Plano operacional aparece com secções (resumo, execução, complexidade/riscos/mini-tasks quando existirem).
5. Confirmar ausência de “strategy”, “refined plan”, “architect” no painel central.
6. Quando strategy estiver pronta: estado **Plano final gerado** e banner de conclusão (sem botão aprovar).
7. Timeline legada (`RefinedPlanPanel` / `ApprovalFlow`) não deve aparecer no centro durante Fase 3+4.

---

## Critérios de aceite

| Critério | Estado |
|----------|--------|
| Após entendimento, UI continua em “Montando o plano” | ✅ |
| Plano operacional real exibido | ✅ |
| Termo “strategy” não aparece para o utilizador | ✅ |
| Complexidade, riscos e mini-tasks quando disponíveis | ✅ |
| Nenhuma aprovação implementada | ✅ |
| Nenhum mock novo | ✅ |

---

## Referências

- Fase 1: `docs/reports/2026-05-17-ux-operational-contract-phase1.md`
- Fase 2: `docs/reports/2026-05-17-inicializacao-operacional-phase2.md`
- Fase 3: `docs/reports/2026-05-17-planejamento-perguntas-phase3.md`
- Discovery: `docs/reports/2026-05-17-inicializacao-montando-plano-ux-discovery.md`
