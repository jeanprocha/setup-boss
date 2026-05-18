# Mission Control — transição de etapas (workflow guiado)

**Data:** 2026-05-15  
**Âmbito:** UX de progressão no `RunViewShell` após aprovação da clarificação e preparação para as fases seguintes.

## 1. Problema UX original

- Cartões de etapa com peso visual semelhante — sensação de “pilha” sem hierarquia clara.
- Após **Aprovar**, o backend passava a `strategy_pending` / evento `strategy_waiting_user_action`, mas a UI continuava com o mesmo destaque na clarificação e CTA de strategy pouco visível.
- O estado **“Aprovado”** soava como fim de fluxo; não havia protagonismo claro da **etapa 3 (Estratégia)**.

## 2. Conceito: workflow operacional guiado

Inspirado em pipelines (deploy, CI): cada momento tem **uma etapa dominante**, etapas concluídas **perdem protagonismo** (sem esconder conteúdo) e o **próximo passo** tem CTA e superfície evidentes — sem wizard bloqueante nem modal.

## 3. Estratégia aplicada

1. **Modelo central** (`frontend/lib/runtime/mission/mission-workflow-stages.ts`): deriva estados por etapa (`deriveMissionWorkspaceStatuses`), hint operacional (`deriveAttentionHint`) e o sinal **`needsDominantStrategyCta`** (clarificação aprovada + strategy ainda sem artefactos mínimos).
2. **Correção de estados:** clarificação com `runtimePhase === "strategy_pending"` passa a **COMPLETED** no cartão da etapa 2 (antes caía em `PENDING`).
3. **Handoff visual:** quando `needsDominantStrategyCta` é verdadeiro:
   - Etapa 2: `visualWeight="muted"` + painel com **resumo concluído** e detalhe em `<details>` (`workflowPostApproveCompact`).
   - Etapa 3: `visualWeight="hero"` + **`StrategyStageHero`** (superfície elevada, botão **grande** “Gerar estratégia de execução”) acima do `StrategyPanel`.
4. **Scroll:** ao tornar-se `needsDominantStrategyCta` (transição false → true), `requestAnimationFrame` + `scrollToExecutionAnchor("act-panel-strategy")` (uma vez por corrida até o handoff cessar).
5. **CTA único:** a geração de strategy deixa de estar duplicada no `ClarificationPanel`; usa-se o hook partilhado `useStrategyStageGeneration` no hero.

## 4. Alterações visuais

| Área | Alteração |
|------|-----------|
| `MissionWorkspacePhase` | Novos estados de badge: `WAITING_USER_ACTION`, `RUNNING`, `FAILED`, `UPCOMING`; variantes `visualWeight`: `default` \| `hero` \| `muted`. |
| Etapa 3 título | “Estratégia de execução” (alinhado à copy operacional). |
| `ApprovalFlow` | Rótulo de aprovado: “Aprovado — próximo: strategy” (ficheiro anterior). |
| `StrategyStageHero` | Borda reforçada, sombra, botão `size="lg"` largura máxima. |

## 5. Transição entre etapas

- **Sem animação pesada:** mudança de peso (`muted` / `hero`), espaçamento e colapso leve (`<details>`) comunicam progressão.
- **Clarificação** permanece acessível via “Rever detalhes”.

## 6. Estados implementados (cartão de etapa)

| Estado | Uso típico |
|--------|------------|
| `ACTIVE` | Trabalho em curso na etapa |
| `COMPLETED` | Etapa fechada com sucesso |
| `WAITING` | Aguarda sistema / fila |
| `WAITING_USER_ACTION` | Depende do operador (respostas, approve, gerar strategy, review) |
| `RUNNING` | Strategy a gerar / execução a correr |
| `BLOCKED` | Bloqueio operacional |
| `FAILED` | Falha terminal reportada |
| `PENDING` / `UPCOMING` | Ainda não atingida ou fila neutra |

Badges longos são abreviados na UI (`AGUARDA SI`, `PRÓXIMA`).

## 7. Before / after

**Antes:** Aprovar → mesmo cartão de clarificação em destaque → CTA de strategy pequeno no meio do painel de clarificação.  
**Depois:** Aprovar → clarificação **resumo + detalhe colapsado** → scroll para etapa 3 → **hero + botão grande** + painel strategy completo abaixo.

## 8. Screenshots

Não capturados neste ambiente; validar localmente no browser após `npm run dev` (frontend + daemon).

## 9. Validações

Checklist manual:

1. Criar task → clarificar → refinamento → **Aprovar**.
2. Confirmar: resumo “Clarificação concluída”, `<details>` para rever.
3. Confirmar: vista desloca para **Estratégia de execução** com hero e CTA dominante.
4. Clicar **Gerar estratégia de execução** → hero desaparece quando a strategy fica pronta; etapa 2 deixa modo `muted`/`compact` quando `needsDominantStrategyCta` é falso.

**Typecheck:** `cd frontend && npx tsc --noEmit` (executar no PR).

## 10. Próximos refinamentos

- Reutilizar o mesmo padrão **hero + CTA** para handoff **strategy → execution** (quando guards e copy estiverem estáveis).
- Opcional: persistir preferência “detalhes da clarificação expandidos” em `localStorage`.
- Opcional: alinhar `ExecutionStepBlock` da timeline ao mesmo enum visual para coerência total.

## Ficheiros principais

- `frontend/lib/runtime/mission/mission-workflow-stages.ts`
- `frontend/components/features/run-detail/RunViewShell.tsx`
- `frontend/components/features/run-detail/MissionWorkspacePhase.tsx`
- `frontend/components/features/strategy/StrategyStageHero.tsx`
- `frontend/hooks/use-strategy-stage-generation.ts`
- `frontend/components/features/clarification/ClarificationPanel.tsx`
