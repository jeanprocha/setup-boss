# Relatório — Montando o plano: perguntas de entendimento (Fase 3)

**Data:** 2026-05-17  
**Tipo:** append-only  
**Escopo:** UX operacional do loop de perguntas/respostas (clarification), sem plano final, strategy, aprovação ou execução

---

## Resumo

Implementada a fase **Montando o plano** como experiência operacional única: conversa de entendimento, estados narrativos e painel central dedicado. Reutiliza `useClarification`, `useClarificationMutations`, `ClarificationQuestionCard` e APIs existentes (`GET/POST clarification`). Nenhum motor de perguntas novo; nenhum mock.

---

## Arquivos criados

| Arquivo | Função |
|---------|--------|
| `frontend/lib/runtime/operational/planning-understanding-operational-state.ts` | Estados do loop + `shouldShowPlanningUnderstandingPanel` |
| `frontend/lib/runtime/operational/planning-understanding-operational-state.test.ts` | 6 testes unitários |
| `frontend/components/features/planning/PlanningUnderstandingPanel.tsx` | Painel central “Montando o plano” |
| `frontend/components/features/planning/PlanningUnderstandingConversation.tsx` | UI conversacional (perguntas/respostas) |

## Arquivos alterados

| Arquivo | Alteração |
|---------|-----------|
| `frontend/lib/runtime/operational/index.ts` | Re-exports do módulo planning-understanding |
| `frontend/components/features/run-detail/RunViewShell.tsx` | Rota central + oculta slots clarification/approval legados no escopo Fase 3 |
| `package.json` | Teste no script `npm test` |

---

## Integração clarification reutilizada

| Peça | Uso |
|------|-----|
| `useClarification` | Bundle real (`questions`, `session.currentRound`, `runtimePhase`) |
| `useClarificationMutations.submitAnswers` | `POST .../clarification/answers` |
| `useClarificationMutations.refreshClarification` | Re-fetch do bundle |
| `canSubmitAnswersPayload` | Validação de envio |
| `clarification-operational-state` | Mensagens de init vazio (copy operacional) |
| `ClarificationQuestionCard` + `AnswerInput` | Inputs por pergunta |

Polling leve (4s) enquanto o estado operacional indica geração/avaliação de perguntas, para suportar loop sem UI técnica.

---

## Estados operacionais implementados

| Estado | Rótulo UI |
|--------|-----------|
| `analyzing_activity` | A analisar a atividade |
| `generating_questions` | A gerar perguntas de entendimento |
| `awaiting_answers` | Aguardando as suas respostas |
| `processing_answers` | A processar respostas |
| `evaluating_understanding` | A avaliar entendimento |
| `generating_new_questions` | A gerar novas perguntas |
| `understanding_complete` | Entendimento concluído |

Derivação via `derivePlanningUnderstandingStatus(contract, bundle, flags de loading/submit)` — sem expor `runtimePhase` na UI.

---

## Loop operacional implementado

1. Entrada em clarificação → painel central **Montando o plano** (`shouldShowPlanningUnderstandingPanel`).
2. Perguntas exibidas em formato conversa (histórico respondido + inputs pendentes).
3. Utilizador envia → **Enviar respostas** (não “Gerar plano refinado”).
4. Backend processa (`refining`) → estados **processando** / **avaliando**.
5. Novas perguntas (ex.: `currentRound > 1`, bundle vazio a carregar) → **gerando novas perguntas** + poll.
6. Refinement disponível → **entendimento concluído** (sem abrir Aprovação/Strategy nesta fase).

`RunViewShell` deixa de embutir `ClarificationPanel` / `RefinedPlanPanel` na timeline enquanto o painel operacional Fase 3 está activo.

---

## Limitações atuais

- **Novo ciclo de perguntas** — detecção de “novas perguntas” heurística (`currentRound`, bundle vazio + fetch); sem evento UX dedicado.
- **Pós-entendimento** — após `understanding_complete`, corrida aprovada ou em strategy volta ao fluxo legado (timeline).
- **`OperationalUxPanel`** — oculto implicitamente ao usar só o painel central; ribbon legado pode reaparecer após sair do escopo Fase 3.
- **Refinement** — o runtime ainda gera plano refinado em background; a UI não o mostra nesta fase (por desenho).

---

## Gaps backend ainda existentes

1. Sem flag `understandingRound` / `needsMoreQuestions` no summary para a UI.
2. Loop de perguntas — `currentRound` no bundle sem transições explícitas na API.
3. Contrato UX ainda mapeia `refinement_ready` → fase **Aprovação** no normalizador; a rota Fase 3 mantém painel até `approved`/strategy.
4. Sem endpoint de “comentário” no plano (fora do escopo).

---

## Como validar manualmente

### Testes automáticos

```bash
node --experimental-strip-types --test frontend/lib/runtime/operational/planning-understanding-operational-state.test.ts
```

**Esperado:** 6/6 passando (com suite global operational ≥ 18 testes).

### Stack (`npm run dev:stack`)

1. Projeto com `.IA` válida → criar atividade → concluir Inicialização (Fase 2).
2. Quando clarificação activar: coluna central mostra **Montando o plano** (não “Clarificação”).
3. Responder perguntas → **Enviar respostas** → estados de processamento/avaliação.
4. Se o runtime emitir nova ronda: copy “Continuação do entendimento · parte N” e novas perguntas.
5. Verificar ausência de rótulos `clarification`, `refine`, `strategy` no painel central.
6. Após aprovação manual futura ou strategy: fluxo legado na timeline (sem regressão de execução).

---

## Critérios de aceite

| Critério | Estado |
|----------|--------|
| UI com fase “Montando o plano” | ✅ |
| Perguntas reais no fluxo operacional | ✅ |
| Respostas no fluxo | ✅ |
| Suporte a novas perguntas (loop) | ✅ (poll + round) |
| Sem exposição clarification/refine | ✅ no painel central |
| Outras fases não alteradas | ✅ |
| Sem mocks novos | ✅ |

---

## Referências

- Fase 1: `docs/reports/2026-05-17-ux-operational-contract-phase1.md`
- Fase 2: `docs/reports/2026-05-17-inicializacao-operacional-phase2.md`
- Discovery: `docs/reports/2026-05-17-inicializacao-montando-plano-ux-discovery.md`
