# Discovery: Correções Pós-Strategy UX

**Data:** 2026-05-16  
**Status:** Discovery concluído — prontos para implementação  
**Run de referência:** `20260516-163856-na-tela-de-integracao-criar-componente-de-chat-botao-de-abri`

---

## 1. Resumo Executivo

| Pergunta | Resposta |
|---|---|
| A activity ainda roda? | Não — ela terminou em ~21 ms; artefatos confirmados em disco |
| O que está incorreto? | `run-context.json` nunca recebe `phase3.status = "strategy_ready"` após conclusão; permanece como `"strategy_runtime_initialized"` — estado ambíguo interpretado como "pendente" por toda a pilha |
| Qual fix deve vir primeiro? | Alterar o status terminal em `run-strategy-runtime.js` de `PHASE3_STATUS ("strategy_runtime_initialized")` para `"strategy_ready"` no `run-context.json` final |

---

## 2. Mapa de Divergência

| Camada | Fonte | Estado atual | Estado correto | Evidência |
|---|---|---|---|---|
| Disco | `run-context.json phase3.status` | `strategy_runtime_initialized` | `strategy_ready` | `run-strategy-runtime.js` linha 534-548: spread `phase3Base` sem alterar `status` |
| Disco | `strategy/strategy-readiness.json` | `strategy_ready` ✅ | — | Artefato correto, não lido pela clarification API |
| Disco | `strategy/execution-ready-handoff.json` | `execution_ready_handoff_completed` ✅ | — | Artefato correto, não lido pela clarification API |
| API — clarificação | `GET /runs/:id/clarification` → `session.runtimePhase` | `strategy_pending` ❌ | `strategy_ready` | `mapPhase2ToRuntimePhase()`: `p3st = "strategy_runtime_initialized"` → branch `strategy_pending` |
| API — strategy | `GET /runs/:id/strategy` → `summary.phase3Status` | `strategy_runtime_initialized` | `strategy_ready` | `collectStrategyBundle()` lê `phase3.status` direto do `run-context.json` |
| API — strategy | `GET /runs/:id/strategy` → `summary.operationalReadiness` | `ready` ✅ | — | Lê `strategy-readiness.json` corretamente |
| Frontend | `mapPhase3StatusToRuntimePhase()` | `strategy_pending` ❌ | `strategy_ready` | `PHASE3_TO_RUNTIME["strategy_runtime_initialized"]` = `undefined` → fallback `"strategy_pending"` |
| Frontend | `strategyAutoStartInProgress()` | `true` ❌ | `false` | Recebe `runtimePhase = "strategy_pending"` → retorna `true` indefinidamente |

---

## 3. Causa Raiz por Item

### 3.1 Estado da Strategy — Causa Raiz Principal

**Arquivo:** `scripts/runtime/strategy-runtime/run-strategy-runtime.js`

`PHASE3_STATUS = "strategy_runtime_initialized"` é usado como estado **intermediário** (escrito durante execução) E como estado **terminal** (nunca atualizado após conclusão).

```
// Linha 402-426: fase3Base escrito durante execução
const phase3Base = {
  status: PHASE3_STATUS,  // = "strategy_runtime_initialized"
  ...
};

// Linha 534-548: update final — phase3.status NUNCA MUDA
const nextRc = {
  ...runContext,
  phase3: {
    ...phase3Base,        // status ainda = "strategy_runtime_initialized" ⚠️
    readiness: { status: "strategy_ready", ... },
    handoff: { status: "execution_ready_handoff_completed", ... },
  },
};
```

O status correto para o estado terminal seria `"strategy_ready"`. A verificação de idempotência (linha 156-190) também usa `PHASE3_STATUS` para decidir se pode pular — ou seja: a estratégia concluída e a estratégia em progresso têm o mesmo `phase3.status`. Isso é tecnicamente válido para a idempotência (checa também os sub-status), mas quebra toda camada de leitura externa.

---

### 3.2 Mapeamento na Clarification API

**Arquivo:** `scripts/daemon/lib/run-clarification.js`, função `mapPhase2ToRuntimePhase`

```js
// Linha 44-50
if (st === "ready_for_execution") {
  const p3st = ...String(phase3.status);
  if (p3st && p3st !== "strategy_ready" && p3st !== "ready_for_execution") {
    return "strategy_pending";  // "strategy_runtime_initialized" cai aqui ⚠️
  }
  return "ready_for_execution";
}
```

A função checa se `phase3.status` é exatamente `"strategy_ready"` ou `"ready_for_execution"`. `"strategy_runtime_initialized"` não é nenhum dos dois → retorna `"strategy_pending"`.

A função não lê os arquivos `strategy-readiness.json` nem `execution-ready-handoff.json`. Apenas consulta `run-context.json.phase3.status`.

**Consequência:** A API de clarificação retorna `runtimePhase = "strategy_pending"` mesmo com strategy pronta em disco.

---

### 3.3 Mapeamento no Frontend (Strategy Bundle)

**Arquivo:** `frontend/lib/runtime/strategy/strategy-state.ts`, função `mapPhase3StatusToRuntimePhase`

```ts
// Linha 30-43
export function mapPhase3StatusToRuntimePhase(
  phase3Status: string | null,
  readiness: StrategyBundleDto["summary"]["operationalReadiness"],
  blockingCount: number,
): StrategyRuntimePhase {
  if (readiness === "ready" && phase3Status === "ready_for_execution") {
    return "ready_for_execution";
  }
  const base = phase3Status ? PHASE3_TO_RUNTIME[phase3Status] : null;
  // PHASE3_TO_RUNTIME não tem "strategy_runtime_initialized"
  // base = undefined → null
  return base ?? "strategy_pending";  // ⚠️ fallback incorreto
}
```

`PHASE3_TO_RUNTIME` não contém `"strategy_runtime_initialized"` → `base = null` → retorna `"strategy_pending"`.

**Caso concreto:** `operationalReadiness = "ready"` + `phase3Status = "strategy_runtime_initialized"` → retorna `"strategy_pending"` em vez de `"strategy_ready"`.

---

### 3.4 Evento Final da Strategy Inline

**Arquivo:** `scripts/daemon/lib/run-strategy-api.js`

A via inline (approve → `autoStartStrategyAfterApproval` → `triggerStrategyRun`) **emite** os eventos:
- `strategy_requested`
- `strategy_started`
- `strategy_plan_loaded` (via `onProgress`)
- `strategy_context_prepared` (via `onProgress`)
- `strategy_llm_started/completed` (via `onProgress`)
- `strategy_artifacts_written` (via `onProgress`)
- `strategy_completed` ← emitido corretamente!

O problema **não é a ausência do evento** — é que após o evento, o frontend faz poll e a API retorna `strategy_pending`, sobrescrevendo o estado SSE. O frontend se prende em `strategy_pending` para sempre.

---

### 3.5 Contrato Canônico de Estados

**Estados encontrados:**

| Estado encontrado | Camada | Significado atual | Problema | Recomendação |
|---|---|---|---|---|
| `strategy_runtime_initialized` | Disco (`run-context.json`) | Estado único para "em progresso" E "concluído" | Ambíguo — nunca atualizado | Usar como intermediário; terminal = `strategy_ready` |
| `strategy_ready` | Disco (`strategy-readiness.json`) | Artefatos válidos e prontos | Não lido pela clarification API | Usar como fonte de verdade |
| `execution_ready_handoff_completed` | Disco (`execution-ready-handoff.json`) | Handoff completo | Não lido pela clarification API | Verificar como condição adicional |
| `strategy_pending` | API/Frontend | Strategy não iniciou | Falso positivo: retornado mesmo quando pronta | Corrigir mapeamento |
| `strategy_generating` | Frontend (derivado) | Strategy rodando agora | Sem fonte de verdade real — nunca emitido via poll | Usar apenas via SSE |
| `strategy_ready` | API/Frontend (esperado) | Artefatos prontos | Nunca retornado atualmente por `mapPhase2ToRuntimePhase` | Corrigir source |
| `ready_for_execution` | API/Frontend | Handoff OK + aprovado | Só retornado quando `phase3.status = "ready_for_execution"` exato | Não existe esse valor em `run-context.json` hoje |

**Questões:**
1. **Estados persistidos em disco:** `strategy_runtime_initialized`, `strategy_ready` (em `strategy-readiness.json`), `execution_ready_handoff_completed`
2. **Retornados pela API:** `strategy_pending` (incorreto), `unavailable`, `partial`
3. **Derivados no frontend:** `strategy_generating`, `strategy_ready`, `ready_for_execution` (todos raramente corretos)
4. **Apenas visuais:** `stalled` (derivado por timeout no frontend), `strategyAutoStartInProgress`
5. **Ambiguidade `pending` vs `running`:** Sim — em `strategy_pending` com `clarificationHandoff=true`, `deriveStrategyOperationalStatus` retorna `"running"` mesmo sem progresso
6. **Frontend inventa `running`:** `strategyAutoStartInProgress()` retorna `true` para qualquer `runtimePhase === "strategy_pending"` sem verificar timestamps
7. **Fonte de verdade para `ready`:** `strategy-readiness.json` com `status = "strategy_ready"`

---

### 3.6 Timeline

Não existe endpoint que retorne eventos do run em ordem cronológica. Existe:
- `GET /runs/:id/observability` → bundle com logs e eventos do daemon
- SSE via `/events/stream` → eventos em tempo real
- `strategy-diagnostics.json` → eventos internos da strategy (não expostos pela API)

A UI usa `useRunObservabilityBundle` + `runtime-event-bus.ts` para acumular eventos SSE. Essa lista poderia ser a base de uma timeline oficial, mas faltam:
- `startedAt`/`endAt` por fase
- duração calculada
- mudanças de fase persistidas
- ações humanas (approve, reject, respostas)
- separação entre evento operacional, log técnico e diagnóstico visual

**Proposta mínima de timeline (sem implementar agora):**
```
{ type: "phase_change" | "human_action" | "system_event" | "warning" | "error",
  at: ISO,
  phase: string,
  label: string,
  durationMs?: number }
```

---

### 3.7 Heartbeat Daemon/Worker

**Endpoint existente:** `GET /status`

Retorna:
- `running` (daemon ativo?) ✅
- `pid` ✅
- `uptimeMsApprox` ✅
- `worker.busy` ✅
- `worker.currentJobId` ✅
- `worker.currentPhase` ✅
- `worker.lastPipelineEventAt` ✅
- `runningJobsCount` ✅
- `runningJobs` (array) ✅

**Situação:** Backend completo. Frontend **não exibe** essas informações em nenhum painel. O header/painel direito não tem componente de heartbeat.

---

### 3.8 UI Labels

**Arquivo:** `frontend/lib/runtime/strategy/strategy-operational-state.ts`

```ts
case "strategy_pending":
  return handoff ? "running" : "waiting_user";
```

Com `clarificationHandoff=true`, `strategy_pending` → `OperationalStepStatus = "running"` → exibe spinner "Em progresso".

**Problema:** Não há separação entre:
- `strategy_pending` genuíno (estratégia não iniciou)
- `strategy_pending` falso (estratégia concluída, API retornando errado)
- `strategy_generating` (estratégia em execução ativa — sabido via SSE)

**Mudanças mínimas sem redesign:**
- Após fix do backend (`phase3.status = "strategy_ready"`), esse caminho será eliminado
- Adicionar `strategyAutoStartInProgress()` timeout/stall detection: se `strategy_pending` por mais de X minutos → marcar como `stalled`

---

### 3.9 Logs e Normalização

A implementação recente de normalização/deduplicação está em `frontend/lib/runtime/observability/normalize-runtime-log-for-ui.ts` e `frontend/stores/runtime-observability-logs-store` (acumulativo por run).

Pontos a validar:
- O limite de 500 entradas é **por run** (chave no store por `runId`)
- Deduplicação cobre eventos sem `eventId` via `runtimeLogDedupeKey` (hash por `type+ts+preview`)
- Payloads grandes são truncados (`detailTruncated = true`, `detailBytes` preservado)
- `runtime.projects.pipeline` e `runtime.output_dir_resolved` são classificados como `technical` → excluídos dos logs operacionais

**Risco remanescente:** Classificação incorreta pode esconder erros. Nenhuma evidência encontrada de problemas ativos.

---

## 4. Arquivos Envolvidos

| Arquivo | Responsabilidade | Risco de alteração | Recomendação |
|---|---|---|---|
| `scripts/runtime/strategy-runtime/run-strategy-runtime.js` | Executa a strategy, escreve `run-context.json` | **Baixo** — alteração cirúrgica no status terminal | **P0:** Alterar `phase3.status` final para `"strategy_ready"` |
| `scripts/daemon/lib/run-clarification.js` | `mapPhase2ToRuntimePhase` — mapeia fase da clarificação | **Baixo** — adicionar `"strategy_runtime_initialized"` como caso alternativo | **P0** alternativo/defensivo |
| `frontend/lib/runtime/strategy/strategy-state.ts` | `mapPhase3StatusToRuntimePhase` — mapeia para UX | **Baixo** — adicionar caso para `operationalReadiness = "ready"` | **P0** defensivo |
| `scripts/runtime/strategy-runtime/run-strategy-runtime.test.js` | Testa o runtime da strategy | **Baixo** | Atualizar asserção de `phase3.status` final |
| `scripts/daemon/lib/run-clarification.test.js` | Testa o fluxo de approve | **Baixo** | Adicionar asserção que approve → `strategy_ready` não `strategy_pending` |
| `frontend/lib/runtime/strategy/strategy-auto-start-policy.ts` | `strategyAutoStartInProgress` | **Baixo** | Adicionar stall detection (P1) |
| `frontend/lib/runtime/strategy/strategy-operational-state.ts` | `deriveStrategyOperationalStatus` | **Baixo** | Separar `pending` genuíno de `pending` falso (P1) |

---

## 5. Plano de Correção Recomendado

### P0 — Corrigir agora

**Fix principal (recomendado):**

Em `scripts/runtime/strategy-runtime/run-strategy-runtime.js`, alterar o `nextRc` final (linha ~534) para usar `status: "strategy_ready"` em vez de propagar `PHASE3_STATUS`:

```js
const nextRc = {
  ...runContext,
  phase3: {
    ...phase3Base,
    status: "strategy_ready",  // ← FIX: sobrescrever o status intermediário
    readiness: { status: STRATEGY_READY_STATUS, artifact: STRATEGY_READINESS_REL },
    handoff: { status: HANDOFF_STATUS, artifact: EXECUTION_READY_HANDOFF_REL },
  },
};
```

Atualizar a verificação de idempotência (linha ~162) para aceitar também `"strategy_ready"`:

```js
const phase3StatusOk =
  p3st === PHASE3_STATUS || p3st === "strategy_ready";
```

**Fix defensivo no frontend:**

Em `frontend/lib/runtime/strategy/strategy-state.ts`, adicionar fallback para `operationalReadiness = "ready"`:

```ts
export function mapPhase3StatusToRuntimePhase(...): StrategyRuntimePhase {
  if (readiness === "ready" && phase3Status === "ready_for_execution") return "ready_for_execution";
  // Novo: qualquer status com readiness pronta = strategy_ready
  if (readiness === "ready" && phase3Status != null) {
    const base = PHASE3_TO_RUNTIME[phase3Status];
    if (!base || base === "strategy_pending") return "strategy_ready";
  }
  const base = phase3Status ? PHASE3_TO_RUNTIME[phase3Status] : null;
  if (phase3Status === "strategy_ready" && blockingCount > 0) return "strategy_blocked";
  return base ?? "strategy_pending";
}
```

**Fix defensivo na clarification API:**

Em `scripts/daemon/lib/run-clarification.js`, `mapPhase2ToRuntimePhase`, adicionar `strategy_runtime_initialized` na lista de estados que indicam strategy pronta:

```js
if (p3st && p3st !== "strategy_ready" && p3st !== "ready_for_execution" && p3st !== "strategy_runtime_initialized") {
  return "strategy_pending";
}
```

Ou mais limpo: verificar também se readiness/handoff existem em disco:

```js
if (p3st === "strategy_runtime_initialized" || p3st === "strategy_ready") {
  return "ready_for_execution";
}
```

---

### P1 — Próximo

1. **Stall detection no frontend:** `strategyAutoStartInProgress()` retorna `true` indefinidamente. Adicionar timeout: se `strategy_pending` por mais de 3 minutos sem evento SSE → marcar como `stalled` e mostrar CTA de retry.

2. **Heartbeat na UI:** Consumir `GET /status` para exibir estado do worker (idle/busy, lastActivityAt). O backend já tem todos os campos.

3. **Separação clara de estados visuais:**
   - `strategy_pending` genuíno: approve acabou de acontecer, aguardando daemon
   - `strategy_pending` falso: nunca deve ocorrer após fix P0
   - `strategy_generating`: apenas via SSE, não via poll
   - `stalled`: timeout sem progresso

---

### P2 — Futuro

- Timeline oficial com `startedAt`/`endAt` por fase
- Persistir ações humanas (approve, reject) como eventos de timeline
- Endpoint `GET /runs/:id/timeline` que mescla eventos SSE + daemon logs + `strategy-diagnostics.json`
- Cancel/retry/resume de strategy

---

## 6. Testes Mínimos Recomendados

### Testes a adicionar/alterar

**`scripts/runtime/strategy-runtime/run-strategy-runtime.test.js`**
```js
// Após runStrategyRuntimeBase bem-sucedido:
assert.strictEqual(
  JSON.parse(fs.readFileSync(rcPath)).phase3.status,
  "strategy_ready"  // não "strategy_runtime_initialized"
);
```

**`scripts/daemon/lib/run-clarification.test.js`**
```js
// Após approve + strategy completa:
const bundle = collectClarificationForRun(runId, null);
assert.strictEqual(bundle.data.session.runtimePhase, "ready_for_execution");
// NÃO deve ser "strategy_pending"
```

**`frontend/lib/runtime/strategy/strategy-state.test.ts`** (novo ou existente)
```ts
test("operationalReadiness=ready + strategy_runtime_initialized → strategy_ready", () => {
  const result = mapPhase3StatusToRuntimePhase("strategy_runtime_initialized", "ready", 0);
  assert.strictEqual(result, "strategy_ready");
});
```

**`frontend/lib/runtime/strategy/strategy-auto-start-policy.test.ts`**
```ts
test("strategyAutoStartInProgress=false quando strategy_ready", () => {
  const result = strategyAutoStartInProgress(
    null,
    { summary: { runtimePhase: "strategy_ready" } } as any,
  );
  assert.strictEqual(result, false);
});
```

---

## 7. Critério de Parada

A discovery termina aqui. Está claro:

| Questão | Resposta |
|---|---|
| Onde corrigir `strategy_pending` falso | `run-strategy-runtime.js` (P0 principal) + `strategy-state.ts` + `run-clarification.js` (defensivos) |
| Onde emitir `strategy_completed` inline | Já emitido corretamente via `triggerStrategyRun` → `run-strategy-api.js` |
| Quais estados devem ser canônicos | `pending`, `generating`, `ready`, `blocked`, `failed`, `stalled` (derivado visual) |
| Quais ajustes são apenas UX | Stall detection, heartbeat, separação visual de `pending` genuíno vs timeout |
| Quais mudanças ficam para depois | Timeline oficial, cancel/retry/resume, persistência de ações humanas |
