# Mission Control — Discovery: fluxo operacional frontend ↔ Runtime API

**Data:** 2026-05-15  
**Modo:** apenas discovery (sem alterações funcionais de produto).  
**Objectivo:** mapear o que o Mission Control faz de ponta a ponta, onde depende do runtime real, onde é só leitura/visual, e onde o operador pode ficar sem acção ainda que o cartão peça intervenção.

---

## 1. Resumo executivo

### O que está relativamente completo

- **Proxy Next.js → daemon:** `GET`/`POST` genéricos com timeouts alargados para `POST …/runs/:runId/strategy` (120s) e `POST …/projects/git/register` (180s); SSE em `/api/runtime/events/stream` com streaming transparente (`frontend/app/api/runtime/[[...segments]]/route.ts`).
- **Cliente HTTP:** `runtimeGetJson` / `runtimePostJson` com parsing de erro `{ error.message }`, timeout, tratamento de rede/abort (`frontend/lib/api/client.ts`).
- **Clarificação (read + mutations):** `GET /runs/:id/clarification`, `POST …/clarification/{answers|approve|reject|refine}` com React Query + invalidações (`frontend/lib/runtime/clarification/clarification-actions.ts`, `frontend/hooks/use-clarification-mutations.ts`, `frontend/components/features/clarification/ClarificationPanel.tsx` ~L143–L251).
- **Strategy (read + mutation explícita):** `GET`/`POST /runs/:id/strategy` implementados; mutation com timeout 120s, payload `{ force?: boolean }` (`frontend/lib/runtime/strategy/strategy-actions.ts`). Após sucesso: invalidação de queries root, strategy, clarification, execution (`frontend/hooks/use-strategy-stage-generation.ts` ~L34–L42).
- **Execute (orquestração):** `POST /runs/:id/execute` com guards no cliente + `useMutation` + invalidações (`frontend/lib/runtime/orchestration/orchestration-actions.ts`, `frontend/hooks/use-orchestration-mutations.ts`, `frontend/components/features/orchestration/OrchestrationRunControls.tsx`, `ExecuteRunButton.tsx`).
- **SSE + debounce de invalidação:** eventos deduplicados, aplicação parcial a stores de execução/recovery, `invalidateQueries` throttled (~750ms, terminal ~120ms) incluindo strategy/clarification/execution por `runId` (`frontend/lib/runtime/sse/runtime-event-bus.ts`).
- **Polling de fallback:** lista de jobs `refetchInterval` 18s quando runtime reachable (`frontend/hooks/use-runs.ts`); health 8s/15s em erro (`frontend/hooks/use-runtime-health.ts`); execution bundle com intervalo 10s/20s quando orquestração “activa” e SSE não substitui totalmente (`frontend/hooks/use-execution.ts` ~L23–L58).
- **Persistência UI:** `selectedProjectId`, `selectedRunId`, largura painel, sidebar compact (`frontend/stores/mission-shell-store.ts`, chave localStorage `setup-boss-mission-shell`).

### O que é principalmente visual / read-only

- **Review / correcção na execução:** `ReviewExecutionCard.tsx` e `CorrectionLoopCard.tsx` apenas mostram DTOs; **sem** botões nem `POST` dedicados no frontend auditado.
- **Strategy “painel rico”:** `StrategyPanel.tsx` é sobretudo visualização de bundle (complexidade, ordering, riscos); o **único** disparo explícito de geração está no `StrategyStageHero` (quando montado).
- **Audit stores** (ex.: `strategy-audit-store`, `clarification-audit-store`): entradas locais para narrativa/UI — não substituem o estado do runtime.

### O que está frágil ou potencialmente “quebrado” para o operador

1. **CTA de POST strategy condicionado a `needsDominantStrategyCta`:** o cartão da etapa pode mostrar **AGUARDA SI** (`WAITING_USER_ACTION`) sempre que `runtimePhase === strategy_pending` **ou** `needsDominantStrategyCta`, mas o botão **“Iniciar estratégia”** só aparece se `StrategyStageHero` receber `active={dominantStrategyHandoff}` — e `dominantStrategyHandoff === needsDominantStrategyCta(...)` exige, entre outras coisas, bundle de clarificação com `approval.status === "approved"` e `session.runtimePhase` em `strategy_pending` | `ready_for_execution` (`frontend/lib/runtime/clarification/clarification-operational-state.ts` ~L13–L19, `frontend/lib/runtime/mission/mission-workflow-stages.ts` ~L92–L106, `frontend/components/features/strategy/StrategyStageHero.tsx` ~L21–L31, `RunViewShell.tsx` ~L650–L655). **Se o read-model de clarificação divergir do estado real do job, o operador vê “accção necessária” sem botão.**
2. **Execute bloqueado enquanto `summary.phase` for intake/clarify/clarification:** `deriveExecuteAvailability` retorna `execution_not_applicable` para essas fases **antes** de outros checks (`frontend/lib/runtime/orchestration/orchestration-state.ts` ~L197–L205). O `RunSummaryDto.phase` vem sobretudo de `metadata.uiPhase` no job (`frontend/lib/runtime/adapters/map-job.ts` ~L59–L65). Se o daemon **não** promover `uiPhase` para `strategy`/fase executável enquanto o operador já vê strategy no bundle dedicado, o botão **Execute Run** permanece desactivado mesmo com clarificação/strategy prontas no detalhe.
3. **Não há endpoints frontend mapeados** para `POST /runs/:id/review` nem `POST /runs/:id/correction` — e no `runtime-api.js` analisado **não surgem** rotas dedicadas com esses paths (apenas clarification/strategy/execution read + execute post + archive + evidence + artifacts + orchestration GET, etc.).

### O que falta para operar “até ao fim” no produto actual

- Acções HITL pós-execução (aprovar/rejeitar review, iterar correcção) no UI alinhadas a rotas reais do daemon (se existirem só no worker/CLI, o Mission Control não as expõe).
- Garantir **coerência** entre: badge de etapa (`deriveMissionWorkspaceStatuses`), CTA de strategy (`needsDominantStrategyCta`), e `ExecuteRunButton` (fase do job vinda de `uiPhase`).
- Testes automatizados **no pacote `frontend/`** para mutations + guards (hoje a suíte relevante está sobretudo em `scripts/` / `core/`, não em `frontend/**/*.test.*`).

---

## 2. Mapa de ficheiros analisados (principais)

| Área | Ficheiros |
|------|------------|
| Shell / layout missão | `frontend/components/features/MissionRuntimeRoot.tsx`, `frontend/components/features/run-detail/RunViewShell.tsx` |
| Sidebars | `frontend/components/regions/ProjectSidebar.tsx`, `frontend/components/regions/ProjectActivitySidebar.tsx` |
| Runtime global | `frontend/hooks/use-runtime-health.ts`, `frontend/hooks/use-runtime-sse.ts`, `frontend/hooks/use-runtime-recovery.ts`, `frontend/lib/runtime/sse/runtime-sse-client.ts`, `frontend/lib/runtime/sse/runtime-event-bus.ts`, `frontend/lib/runtime/orchestration/runtime-resync.ts` |
| Estado selecção | `frontend/stores/mission-shell-store.ts` |
| Jobs / summary | `frontend/hooks/use-runs.ts`, `frontend/hooks/use-run-summary.ts`, `frontend/lib/runtime/adapters/map-job.ts`, `frontend/lib/api/runtime-api.ts` |
| Clarificação | `frontend/hooks/use-clarification.ts`, `frontend/hooks/use-clarification-mutations.ts`, `frontend/lib/runtime/clarification/clarification-actions.ts`, `frontend/components/features/clarification/ClarificationPanel.tsx`, `frontend/stores/clarification-store.ts` |
| Strategy | `frontend/hooks/use-strategy.ts`, `frontend/hooks/use-strategy-stage-generation.ts`, `frontend/lib/runtime/strategy/strategy-actions.ts`, `frontend/lib/runtime/strategy/strategy-state.ts`, `frontend/lib/runtime/strategy/strategy-readiness.ts`, `frontend/components/features/strategy/StrategyPanel.tsx`, `frontend/components/features/strategy/StrategyStageHero.tsx` |
| Orquestração / execute | `frontend/hooks/use-orchestration.ts`, `frontend/hooks/use-orchestration-mutations.ts`, `frontend/lib/runtime/orchestration/orchestration-state.ts`, `frontend/lib/runtime/orchestration/orchestration-actions.ts`, `frontend/components/features/orchestration/OrchestrationRunControls.tsx`, `frontend/components/features/orchestration/ExecuteRunButton.tsx` |
| Execução (read UI) | `frontend/hooks/use-execution.ts`, `frontend/lib/runtime/execution/execution-actions.ts`, `frontend/components/features/execution/ExecutionPanel.tsx`, `frontend/components/features/execution/ReviewExecutionCard.tsx`, `frontend/components/features/execution/CorrectionLoopCard.tsx` |
| Fases / labels | `frontend/lib/runtime/mission/mission-workflow-stages.ts`, `frontend/lib/runtime/mission/runtime-workflow-phases.ts`, `frontend/lib/runtime/adapters/runtime-labels.ts` |
| API / proxy | `frontend/lib/api/client.ts`, `frontend/app/api/runtime/[[...segments]]/route.ts` |
| Backend contrato (mínimo) | `scripts/daemon/runtime-api.js` (rotas `exec` acima + blocos citados) |

---

## 3. Mapa de endpoints Runtime API (daemon) relevantes

Extraído de `scripts/daemon/runtime-api.js` (grep `.exec(p)` + blocos de handler):

| Método | Rota | Uso no frontend |
|--------|------|-----------------|
| GET | `/health` | `useRuntimeHealth` |
| GET | `/status` (queue health) | `useRuntimeHealth` |
| GET | `/projects` | `useProjects` |
| GET | `/projects/:id` | bundle projecto |
| POST | `/projects/register`, `/projects/git/register` | registo projecto |
| GET | `/events/stream?projectId=` | SSE (`useRuntimeSse` → URL via proxy) |
| GET | `/runs/:id/clarification` | `fetchClarificationBundle` |
| POST | `/runs/:id/clarification/{answers\|approve\|reject\|refine}` | mutations clarificação |
| GET | `/runs/:id/strategy` | `fetchStrategyBundle` |
| POST | `/runs/:id/strategy` | `postStrategyRun` — corpo JSON opcional `{ force: boolean }`; respostas **202** (aceite) ou **200** idempotente; erros **400/409/503** conforme `triggerStrategyRun` |
| GET | `/runs/:id/execution` | `fetchExecutionBundle` |
| POST | `/runs/:id/execute` | `postExecuteRun` — corpo `{ force?: boolean }`; emite `execution_triggered` (SSE) |
| GET | `/runs/:id/evidence`, `/runs/:id/artifacts/:artifactId` | evidence UI |
| POST | `/runs/:id/archive` | sidebar atividade |
| GET | `/runs/:id/orchestration` | recovery snapshot |
| GET/POST | `/jobs/:id`, `/jobs/:id/cancel`, `/jobs/:id/retry` | acções barra runtime secundárias |

**Não encontrado** no excerto do `runtime-api.js`: `POST /runs/:id/review` ou `POST /runs/:id/correction`.

---

## 4. Mapa de estados (backend vs frontend vs UI)

### 4.1 Fase / estado da corrida no cartão (lista jobs)

- **Fonte:** `RunSummaryDto.phase` e `.state` derivados de `job.metadata.uiPhase` / `uiState` com fallback ao `job.status` (`map-job.ts` ~L59–L83).
- **Impacto:** toda a lógica `*AppliesToRun`, guards de `Execute`, e badges de lifecycle dependem deste espelho. Se o daemon atrasar `uiPhase`, o frontend atrasará gates.

### 4.2 Estados de clarificação (bundle)

- Constantes e labels: `runtime-workflow-phases.ts` (`CLARIFICATION_RUNTIME_PHASES`, labels PT).
- Transições via POST segmentos; read via GET.
- **Gate de aprovação na UI:** `shouldShowClarificationApprovalGate` (`clarification-operational-state.ts` ~L25–L57) — pode esconder aprovação se não houver sinal de SPEC/refinement.

### 4.3 Estados de strategy (bundle)

- `STRATEGY_RUNTIME_PHASES` + `labelStrategyRuntimePhase` (`runtime-workflow-phases.ts`).
- `isStrategyGenerationComplete` considera “pronto para pensar execução” quando `operationalReadiness` ∈ {ready, partial} **e** `runtimePhase` ∈ {strategy_ready, ready_for_execution, strategy_blocked} (`strategy-readiness.ts` ~L4–L18).

### 4.4 Estados do cartão “Etapa N” (Mission workspace)

- **Tipo:** `MissionWorkspacePhaseStatus` (`mission-workflow-stages.ts` ~L11–L21).
- **Strategy:** `WAITING_USER_ACTION` se `needsDominantStrategyCta` **ou** `srp === "strategy_pending"` (~L92–L106).
- **Exec:** inclui `review_running` + `state === waiting_approval` → `WAITING_USER_ACTION` (~L124–L129).

### 4.5 Acção esperada vs implementada (trechos críticos)

| Momento operacional | Componente / hook | Acção esperada | Implementado? |
|---------------------|-------------------|----------------|---------------|
| Responder clarificação | `ClarificationPanel` + `useClarificationMutations` | POST answers | Sim |
| Refinar | idem | POST refine | Sim |
| Aprovar / rejeitar | idem | POST approve / reject | Sim |
| Gerar strategy após approve | Operador | POST strategy | **Sim**, via `StrategyStageHero` → `useStrategyStageGeneration` → `postStrategyRun` (`StrategyStageHero.tsx` ~L86–L97) **mas só se `active`** |
| Ver strategy | `StrategyPanel` + `useStrategy` | GET strategy | Sim |
| Disparar execução | `ExecuteRunButton` | POST execute | Sim, se `deriveExecuteAvailability.canExecute` |
| Review/correction HITL | `ReviewExecutionCard` / `CorrectionLoopCard` | POST review/correction | **Não** (só leitura) |

---

## 5. Fluxo ponta a ponta **esperado** (operador)

1. Criar atividade (intake) → job na fila com `runId` resolvível.
2. Clarificação: gerar/responder perguntas → refinamento → **awaiting_approval**.
3. Aprovar plano → `ready_for_execution` / `strategy_pending` no bundle de clarificação.
4. **Gerar strategy** → POST `/runs/:runId/strategy` → worker atualiza artefactos → GET strategy mostra readiness/subtasks.
5. **(Opcional)** revisão strategy HITL se existir no produto final.
6. **Execute Run** → POST `/runs/:runId/execute` → bootstrap + eventos SSE.
7. Acompanhar execução (GET execution + SSE + polling condicional).
8. Review / correcção conforme contrato do runtime.
9. Terminal: completed / failed / blocked espelhados em summary + execution bundle.

---

## 6. Fluxo **real hoje** (frontend)

- **Até clarificação + approve:** completo com mutations reais e invalidação de queries.
- **Strategy:** POST **existe** e é chamado pelo botão “Iniciar estratégia”; contudo o hero **não** é um reflexo directo do badge “AGUARDA SI” da etapa — depende de `needsDominantStrategyCta` (`RunViewShell.tsx` passa `active={dominantStrategyHandoff}` ~L650–L655). Isto explica o sintoma “cartão pede acção mas não há mutation”: **pode ser ausência de hero, não ausência de `postStrategyRun` no codebase.**
- **Execute:** implementado, mas **bloqueado** enquanto `phase` ∈ {intake, clarify, clarification} (`orchestration-state.ts` ~L197–L205), independentemente dos bundles — risco se `uiPhase` não acompanhar o pipeline real.
- **Pós-execução review/correction:** visualização parcial; **sem** segunda linha de comandos HTTP no cliente auditado.

---

## 7. Respostas às perguntas do briefing

### 1. Botão/card “Estratégia — acção necessária” tem handler real?

- **Handler real:** existe no `StrategyStageHero`: `onClick={() => gen.generateStrategy.mutate()}` (`StrategyStageHero.tsx` ~L86–L97).
- **Endpoint:** `POST /runs/:runId/strategy` via `runtimePostJson` (`strategy-actions.ts` ~L40–L54).
- **Payload:** `{ force: true }` opcional (`opts?.force`); caso contrário `{}` serializado.
- **Sucesso/erro:** React Query `isError` + mensagem `Error` (`StrategyStageHero.tsx` ~L100–L105); probe GET pode falhar independentemente (`~L67–L72`).
- **Duplo clique:** `disabled={blocking}` com `busyAction = mutation pending || (mutation success && probe fetching)` (`~L33–L37`).
- **SSE/polling:** `onSuccess` invalida queries + `refetch` do probe (`use-strategy-stage-generation.ts` ~L34–L42); SSE invalida `runtimeQueryKeys.strategy(runId)` no bus (~L101–L108 `runtime-event-bus.ts`); lista jobs continua com polling 18s.

### 2. Client/hook por endpoint

| Endpoint | Cliente |
|----------|---------|
| POST strategy | `postStrategyRun` |
| POST execute | `postExecuteRun` + `useOrchestrationMutations` |
| POST review / correction | **Não encontrado** no `frontend/lib` auditado |
| Clarificação | `postClarification*` |

### 3. State machine centralizada?

- **Não** há uma única máquina formal: há **módulos** (`mission-workflow-stages`, `orchestration-state`, `clarification-state`, `strategy-state`, `execution-state`) + strings enumeradas em `runtime-workflow-phases.ts`.
- Lista de fases úteis está documentada nas constantes `*_RUNTIME_PHASES` e tipos TS (ver secção 4).

### 4. Diferenciar pendente / running / completo / bloqueado / erro

- **Cartão de etapa:** `deriveMissionWorkspaceStatuses`.
- **Strategy read:** `runtimePhase` + `operationalReadiness`.
- **Execução:** `lifecyclePhase` + `health` + blockers.
- **Erro operacional:** mutations + `RuntimeApiError` no fetch; queries `isError` por painel.

### 5. SSE correcto?

- **URL:** `projectId` em query (`use-runtime-sse.ts` ~L16–L19).
- **Reconexão:** `RuntimeSseClient` por ref; cleanup desliga (`~L41–L97`).
- **selectedRun:** não está no URL SSE; **actualizações** vêm de invalidação global + `runId` no evento (`runtime-event-bus.ts`).
- **Multiplicar:** um client por mount de `MissionRuntimeRoot`; depende de não duplicar root na árvore React.
- **Refresh pós-mutation:** sim nas mutations de clarificação/strategy/execute (invalidações explícitas).

### 6. Polling fallback

- **Jobs:** 18s com runtime reachable (`use-runs.ts` ~L44–L49).
- **Execution bundle:** intervalo quando orquestração activa; mais lento se SSE `connected` (`use-execution.ts`).
- **Parar com SSE:** não pára totalmente — reduz frequência; SSE **complementa** (comentário em `use-runtime-sse.ts` ~L22–L23).
- **Race:** throttle de invalidação SSE (~750ms) mitiga tempestade; `resyncRuntimeAfterReconnect` serializa com janela mínima (`runtime-resync.ts` ~L6–L20).

### 7. Fluxo de aprovação completo?

- **Sim** no que toca a POST answers/refine/approve/reject + invalidações + hints de UI.
- **Risco:** gate `shouldShowClarificationApprovalGate` pode atrasar/ocultar aprovação sem sinal de refinement (`clarification-operational-state.ts` ~L25–L57).

### 8. Fluxo após strategy

- **POST strategy + GET strategy:** sim.
- **POST execute:** sim com guards.
- **Review/correction loop com POST dedicados:** **não** no frontend auditado; cards são read-only.

### 9. Mocks / hardcode / visual-only

| Item | Local | Nota |
|------|-------|------|
| `mockExecuteBootstrap` | `orchestration-actions.ts` ~L52 | Export presente; **grep não encontrou uso** noutros `.ts/.tsx` — código morto potencial |
| `lib/mocks/bottom-panels.ts` | ficheiro de mock textual | não integrado no fluxo mission nesta auditoria |
| Review/Correction cards | `ReviewExecutionCard.tsx`, `CorrectionLoopCard.tsx` | só renderizam DTOs |

### 10. Erros reais mostrados?

- **Mutations:** mensagens de `Error` em surfaces (ex.: `StrategyStageHero`, banner em `OrchestrationRunControls`).
- **Proxy 502:** JSON `{ ok:false, error:{ code, message } }` do route handler.
- **Runtime offline:** guards `reachable` em mutations; `ExecuteAvailability` com `runtime_offline`.
- **Run inexistente:** 404/409 propagados como `RuntimeApiError` ou bundles `unsupported`.

---

## 8. Gaps priorizados

### P0 (bloqueia MVP percebido)

1. **Desalinhamento badge Strategy vs CTA POST:** etapa pode estar `WAITING_USER_ACTION` sem `StrategyStageHero` (`needsDominantStrategyCta` falso com bundle clarificação desactualizado ou condições não cumpridas).
2. **Execute bloqueado por `phase` da lista de jobs** ainda em `clarification` enquanto o operador já concluiu strategy no detalhe (`deriveExecuteAvailability` ~L197–L205 + origem `uiPhase`).

### P1

- Ausência total de **acções** review/correction no Mission Control alinhadas ao runtime.
- Falta de **testes frontend** dedicados a mutations/guards (regressão fácil).

### P2

- Remover ou isolar `mockExecuteBootstrap` se confirmado morto.
- Documentar contrato `uiPhase`/`uiState` esperado pelo `map-job.ts` para equipa do daemon.

---

## 9. Plano de implementação sugerido (fases pequenas)

1. **Alinhar CTA strategy ao estado real:** mostrar `StrategyStageHero` (ou botão equivalente no `StrategyPanel`) quando `strategy.bundle?.summary.runtimePhase === "strategy_pending"` **e** runtime reachable, não só `needsDominantStrategyCta`; manter `needsDominantStrategyCta` como optimização visual opcional. **Teste:** cenário bundle clarificação atrasado + strategy pending.
2. **Execute gate:** alinhar `deriveExecuteAvailability` a sinais dos bundles (clarification approved + strategy readiness) **ou** garantir no daemon que `uiPhase` avança — escolha de contrato. **Teste:** job com `uiPhase` strategy + `state` success.
3. **Review/correction:** discovery separado das rotas reais no worker; depois UI + mutations. **Teste:** contrato HTTP mínimo.
4. **Testes `frontend/`:** React Testing Library ou integração contra mock server para `postStrategyRun` / `postExecuteRun` / guards.

---

## 10. Critérios de aceite (Mission Control “operacional”)

1. Para cada `runtimePhase` que implica intervenção humana documentada pelo daemon, existe **controlador visível** que dispara o **mesmo** endpoint oficial (sem `setState` de fase).
2. **Nenhum** estado `WAITING_USER_ACTION` sem CTA ou explicação explícita (ex.: “runtime offline” / “aguardar worker”).
3. `POST strategy` e `POST execute` observáveis na rede (via proxy) com feedback de erro do corpo `{ error }`.
4. Após mutations, o operador vê convergência do estado em ≤ 2 ciclos de invalidação (SSE + refetch manual opcional).
5. Review/correction: ou implementados end-to-end, ou explicitamente desactivados com copy honesta (sem simular acção).

---

## 11. Validação executada

```bash
cd frontend && npx tsc --noEmit
```

**Resultado:** exit code 0.

**Testes `frontend/*.test.*`:** não existem ficheiros nesse padrão no pacote `frontend/` (discovery por glob); testes de runtime encontram-se sobretudo em `scripts/` e `core/`.

---

## 12. Referências de código (âncoras)

```21:31:frontend/components/features/strategy/StrategyStageHero.tsx
export function StrategyStageHero({ runKey, phase, state, active }: Props) {
  const { bundle, refetch } = useClarification(runKey, phase, state);
  const gen = useStrategyStageGeneration({
    runKey,
    enabled: active,
    onAfterSuccess: async () => {
      await refetch();
    },
  });

  if (!active || !runKey) return null;
```

```92:106:frontend/lib/runtime/mission/mission-workflow-stages.ts
  const dominantStrategy = needsDominantStrategyCta(
    orch.clarification.bundle,
    orch.strategy.bundle,
  );

  let strategy: MissionWorkspacePhaseStatus = "PENDING";
  // ...
    else if (dominantStrategy || srp === "strategy_pending")
      strategy = "WAITING_USER_ACTION";
```

```197:205:frontend/lib/runtime/orchestration/orchestration-state.ts
  const phase = String(input.phaseRaw || "").toLowerCase();
  if (phase === "intake" || phase === "clarify" || phase === "clarification") {
    return {
      canExecute: false,
      reason: "execution_not_applicable",
      message: GUARD_MESSAGES.execution_not_applicable,
      degraded: false,
    };
  }
```

```2259:2321:scripts/daemon/runtime-api.js
      const runStrategyPost = /^\/runs\/([^/]+)\/strategy$/.exec(p);

      if (req.method === "POST" && runStrategyPost) {
        // ... resolve run, parse body { force }, triggerStrategyRun, respond 202/200
```

---

**Fim do relatório.**
