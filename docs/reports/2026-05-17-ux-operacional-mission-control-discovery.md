# Discovery: Camada UX Operacional do Mission Control

**Data:** 2026-05-17  
**Escopo:** Discovery apenas — nenhuma alteração de código  
**Objetivo:** Resolver definitivamente a sensação de "não está acontecendo nada" durante execução

---

## Índice

1. [Diagnóstico Profundo](#1-diagnóstico-profundo)
2. [Mapeamento de Eventos Atuais](#2-mapeamento-de-eventos-atuais)
3. [Taxonomia de Eventos](#3-taxonomia-de-eventos)
4. [Semantic Runtime Event Architecture](#4-semantic-runtime-event-architecture)
5. [Active Step Architecture](#5-active-step-architecture)
6. [Timeline Architecture](#6-timeline-architecture)
7. [Runtime Activity Feed](#7-runtime-activity-feed)
8. [Technical Debug Console](#8-technical-debug-console)
9. [UX State Machine](#9-ux-state-machine)
10. [Event Normalization Contract](#10-event-normalization-contract)
11. [Noise Reduction Strategy](#11-noise-reduction-strategy)
12. [Future Compatibility Analysis](#12-future-compatibility-analysis)
13. [Frontend Architecture Proposal](#13-frontend-architecture-proposal)
14. [Backend e Runtime Impacts](#14-backend-e-runtime-impacts)
15. [SSE Impacts](#15-sse-impacts)
16. [Persistência, Replay e Hydration](#16-persistência-replay-e-hydration)
17. [Migração Incremental](#17-migração-incremental)
18. [Riscos](#18-riscos)
19. [Complexidade](#19-complexidade)
20. [Plano Faseado de Implementação](#20-plano-faseado-de-implementação)

---

## 1. Diagnóstico Profundo

### 1.1 O problema real

O runtime **funciona corretamente**. O problema é exclusivamente de percepção: a camada de apresentação não traduz o que está acontecendo para linguagem operacional humana.

**Sintomas observados:**

| Sintoma | Causa raiz identificada |
|---------|------------------------|
| "Parece travado" | Ausência de active step dominante visível; sem stall detection |
| "Não sei o que falta" | Timeline não representa fases futuras (apenas passado) |
| "Muita informação técnica" | Eventos de infra (scheduler, worker, daemon) misturados com eventos operacionais |
| "Não sei se depende de mim" | Sem separação clara de `waiting_user` vs `running` |
| "Quando vai acabar?" | Sem noção de progresso/profundidade do pipeline |
| "O que já aconteceu?" | Timeline operacional existe mas não é o elemento dominante da UI |
| "Parece tudo igual" | Eventos técnicos e semânticos têm mesmo peso visual |

### 1.2 Problemas estruturais identificados no código

**a) `KNOWN_RUNTIME_EVENT_TYPES` desatualizado**  
O set em `scripts/daemon/lib/runtime-events.js` lista apenas eventos de infra (job_, worker_, scheduler_, daemon_). Nenhum evento de domínio (intake_, clarification_, strategy_, execution_, review_, correction_) está registrado. Isso significa que não existe fonte de verdade centralizada para a taxonomia de eventos.

**b) `execution_started` duplicável**  
Emitido em `run-execute-api.js` e novamente em `run-orchestration-sync.js` dependendo do timing de sync de artefatos. Sem deduplicação garantida no backend.

**c) `clarification_approve` vs `clarification_approved`**  
O runtime emite `clarification_approve`; a timeline trata ambos como sinônimos via regex. Inconsistência de naming que pode gerar duplicatas visuais.

**d) `jobId`/`projectId` nulos em eventos críticos**  
O filtro SSE por `projectId` pode silenciosamente omitir eventos cujo `runId` é válido mas `projectId` é nulo. O frontend depende de merge com polling para compensar — acoplamento frágil.

**e) Mistura de canais SSE**  
`useRuntimeSse` (por `projectId`) e `useWorkspaceRunSse` (por `workspaceId`) são dois EventSource independentes. `unified-realtime-status.ts` combina os dois, mas a superfície de reconexão é duplicada.

**f) `workspace_run_sync.*` sem ancoragem a run**  
Os eventos de sync de workspace (`workspace_run_sync.tick`, `.summary`, etc.) são emitidos via `emitWorkspaceRunSyncLog` sem `jobId`/`runId`. Não entram na timeline por run — são telemetria global que aparece no observability panel sem contexto.

**g) `derive-run-operational-timeline.ts` usa heurísticas frágeis**  
A inferência de `phaseBucket` é feita por regex sobre o `type` e `phaseHint`. A função `inferPhaseBucket` pode categorizar incorretamente eventos com nomes ambíguos. Não há contrato de fase no evento em si.

**h) Sem noção de etapa ativa dominante**  
O `currentStatus` derivado na timeline é o estado do último item, não uma etapa ativa real. Se o último evento foi `strategy_started`, o status é "running", mas não há como saber quantas fases restam, ou se o sistema está aguardando LLM vs filesystem vs HITL.

**i) Sem stall detection**  
Não existe lógica de detecção de "última atividade há mais de X segundos". O campo `lastProgressLabel` existe mas não aciona nenhum comportamento visual de alerta ou indicação de "ainda processando".

**j) Dois sistemas de timeline paralelos**  
Existe `RunOperationalTimelinePanel` (observabilidade) e `CentralExecutionTimeline` / `ExecutionFeed` (aba de execução). Não está claro qual é a fonte de verdade principal para o usuário.

---

## 2. Mapeamento de Eventos Atuais

### 2.1 Todos os tipos de eventos por origem

#### Domínio: Intake
| type | arquivo | userVisible |
|------|---------|-------------|
| `run_created` | run-intake-api.js | sim |
| `intake_completed` | run-intake-api.js | sim |
| `clarification_initialized` | run-intake-api.js | sim (diagnóstico) |
| `clarification_questions_generated` | run-intake-api.js | sim |
| `job_enqueued` | queue-store.js | técnico |

#### Domínio: Clarificação
| type | arquivo | userVisible |
|------|---------|-------------|
| `clarification_answers_submitted` | run-clarification.js | sim |
| `task_plan_initial_created` | run-clarification.js | sim |
| `task_plan_refined_created` | run-clarification.js | sim |
| `approval_requested` | run-clarification.js | sim (aguarda ação) |
| `clarification_refine` | runtime-api.js | sim (ação usuário) |
| `clarification_approve` | runtime-api.js | sim (ação usuário) |
| `clarification_reject` | runtime-api.js | sim (ação usuário) |
| `refinement_failed` | run-clarification.js | sim (erro) |
| `strategy_auto_started_after_approval` | run-clarification.js | sim |
| `strategy_auto_start_failed` | run-clarification.js | sim (erro) |

#### Domínio: Estratégia
| type | arquivo | userVisible |
|------|---------|-------------|
| `strategy_requested` | run-strategy-api.js | sim |
| `strategy_started` | run-strategy-api.js | sim |
| `strategy_completed` | run-strategy-api.js | sim |
| `strategy_failed` | run-strategy-api.js | sim (erro) |

#### Domínio: Execução
| type | arquivo | userVisible |
|------|---------|-------------|
| `execution_triggered` | run-execute-api.js | sim |
| `execution_started` | run-execute-api.js + run-orchestration-sync.js | sim (duplicável) |
| `execution_completed` | run-orchestration-sync.js | sim |
| `execution_failed` | run-orchestration-sync.js | sim (erro) |
| `execution_recovered` | run-orchestration-sync.js | contexto |
| `review_started` | run-orchestration-sync.js | sim |
| `review_rejected` | run-orchestration-sync.js | sim |
| `review_completed` | run-orchestration-sync.js | sim |
| `correction_started` | run-orchestration-sync.js | sim |
| `correction_completed` | run-orchestration-sync.js | sim |
| `retry_started` | run-orchestration-sync.js | contexto |
| `git_branch_prepared` | run-git-branch-api.js | técnico |

#### Domínio: Pipeline/Worker
| type | arquivo | userVisible |
|------|---------|-------------|
| `phase_started` | runtime/orchestration.js via bridge | técnico/contexto |
| `phase_completed` | runtime/orchestration.js via bridge | técnico/contexto |
| `phase_failed` | runtime/orchestration.js via bridge | sim (erro) |
| `runtime_started` | runtime-events.js | técnico |
| `runtime_finished` | runtime-events.js | técnico |

#### Domínio: Infra/Fila (puro ruído para usuário)
| type | arquivo |
|------|---------|
| `job_claimed`, `job_started`, `job_completed`, `job_failed` | setup-bossd.js |
| `job_skipped_project_busy`, `job_cancelled`, `job_cancel_requested` | setup-bossd.js |
| `job_retry_requested`, `job_requeued`, `job_retry_rejected` | setup-bossd.js |
| `job_stuck_detected`, `worker_stuck_detected` | setup-bossd.js |
| `worker_busy`, `worker_idle`, `worker_started`, `worker_stopping`, `worker_stopped`, `worker_crashed` | setup-bossd.js |
| `scheduler_tick`, `scheduler_recovered` | scheduler-loop.js |
| `job_scheduled`, `job_available`, `job_delayed` | queue-store.js / scheduler-loop.js |
| `retry_scheduled`, `retry_available`, `delayed_job_recovered` | scheduler-loop.js |
| `recurring_job_created`, `recurring_job_scheduled`, `recurring_job_skipped` | queue-store.js |
| `maintenance_queue_pruned`, `maintenance_events_pruned` | runtime-api.js |

#### Domínio: Recovery/Boot
| type | arquivo | userVisible |
|------|---------|-------------|
| `daemon_recovery_started`, `daemon_recovery_completed` | setup-bossd.js | técnico |
| `daemon_recovered_lock`, `daemon_recovered_job` | setup-bossd.js | técnico |
| `recovery_started`, `recovery_completed` | run-runtime-rehydration.js | contexto |
| `runtime_recovered`, `runtime_stale`, `runtime_orphaned` | run-runtime-rehydration.js | contexto/erro |
| `recovery_failed` | run-runtime-rehydration.js | sim (erro) |

#### Domínio: Workspace Sync (não ancorados a run)
| type | emissor | visibilidade atual |
|------|---------|-------------------|
| `workspace_run_sync.tick` | workspace-run-sync.js | ruído (aparece em observability) |
| `workspace_run_sync.summary` | workspace-run-sync.js | ruído |
| `workspace_run_sync.completed` | workspace-run-sync.js | técnico |
| `workspace_run_sync.failed` | workspace-run-sync.js | técnico |
| `workspace_run_sync.waiting` | workspace-run-sync.js | técnico |
| `workspace_run_sync.advance` | workspace-run-sync.js | técnico |
| `workspace_run_sync.error` | workspace-run-sync.js | técnico |
| `workspace_run_sync.backoff` | workspace-run-sync.js | técnico |

#### SSE Workspace (eventos SSE tipados)
| SSE event name | significado |
|----------------|------------|
| `workspace_run.updated` | run atualizado genericamente |
| `workspace_run.started` | run iniciou |
| `workspace_run.advanced` | run avançou de fase |
| `workspace_run.waiting_user_action` | aguarda ação humana |
| `workspace_run.failed` | run falhou |
| `workspace_run.completed` | run concluiu |
| `workspace_run.git_updated` | branch git atualizado |
| `workspace_run.error` | erro de sync |

---

## 3. Taxonomia de Eventos

### 3.1 Classificação proposta (5 camadas)

```
LAYER_1: USER_FACING      — diretamente visíveis na timeline principal
LAYER_2: OPERATIONAL      — visíveis em painel expandido (Activity Feed)
LAYER_3: TECHNICAL        — visíveis apenas no Debug Console
LAYER_4: DEBUG_ONLY       — disponíveis via export/trace, não na UI
LAYER_5: NOISE/HEARTBEAT  — descartados da UI completamente
```

### 3.2 Mapeamento eventos → camada

| Evento | Camada atual | Camada proposta | Razão |
|--------|-------------|-----------------|-------|
| `run_created` | OPERATIONAL | USER_FACING | Marcador de início |
| `intake_completed` | OPERATIONAL | USER_FACING | Checkpoint visível |
| `clarification_questions_generated` | OPERATIONAL | USER_FACING | Aguarda input |
| `clarification_answers_submitted` | OPERATIONAL | USER_FACING | Ação do usuário |
| `task_plan_initial_created` | OPERATIONAL | USER_FACING | Progresso visível |
| `task_plan_refined_created` | OPERATIONAL | USER_FACING | Progresso visível |
| `approval_requested` | OPERATIONAL | USER_FACING | Gate de usuário |
| `clarification_approve` | OPERATIONAL | USER_FACING | Ação do usuário |
| `clarification_reject` | OPERATIONAL | USER_FACING | Ação do usuário |
| `strategy_started` | OPERATIONAL | USER_FACING | Etapa em progresso |
| `strategy_completed` | OPERATIONAL | USER_FACING | Checkpoint visível |
| `strategy_failed` | OPERATIONAL | USER_FACING | Erro visível |
| `execution_triggered` | OPERATIONAL | USER_FACING | Início de execução |
| `execution_started` | OPERATIONAL | USER_FACING | Etapa em progresso |
| `execution_completed` | OPERATIONAL | USER_FACING | Conclusão |
| `execution_failed` | OPERATIONAL | USER_FACING | Erro visível |
| `review_started` | OPERATIONAL | USER_FACING | Etapa em progresso |
| `review_completed` | OPERATIONAL | USER_FACING | Checkpoint |
| `review_rejected` | OPERATIONAL | USER_FACING | Alerta |
| `correction_started` | OPERATIONAL | OPERATIONAL | Detalhe de loop |
| `correction_completed` | OPERATIONAL | OPERATIONAL | Detalhe de loop |
| `phase_started` | TECHNICAL | OPERATIONAL | Contexto útil |
| `phase_completed` | TECHNICAL | OPERATIONAL | Contexto útil |
| `phase_failed` | OPERATIONAL | USER_FACING | Erro visível |
| `recovery_failed` | TECHNICAL | USER_FACING | Erro crítico |
| `runtime_recovered` | TECHNICAL | OPERATIONAL | Contexto de boot |
| `runtime_stale` | TECHNICAL | OPERATIONAL | Alerta de estado |
| `runtime_orphaned` | TECHNICAL | OPERATIONAL | Alerta de estado |
| `git_branch_prepared` | TECHNICAL | TECHNICAL | Detalhe de infra |
| `execution_recovered` | TECHNICAL | OPERATIONAL | Contexto de retry |
| `retry_started` | TECHNICAL | OPERATIONAL | Contexto de retry |
| `job_completed` | TECHNICAL | TECHNICAL | Infra |
| `job_failed` | TECHNICAL | OPERATIONAL | Contexto de falha |
| `job_stuck_detected` | TECHNICAL | USER_FACING | Stall crítico |
| `worker_stuck_detected` | TECHNICAL | USER_FACING | Stall crítico |
| `daemon_recovery_*` | TECHNICAL | TECHNICAL | Boot/infra |
| `worker_busy`, `worker_idle` | NOISE | NOISE | Sem valor UX |
| `scheduler_tick` | NOISE | NOISE | Heartbeat infra |
| `maintenance_*` | NOISE | NOISE | Telemetria |
| `workspace_run_sync.tick` | NOISE | NOISE | Heartbeat sync |
| `workspace_run_sync.summary` | TECHNICAL | TECHNICAL | Métricas de sync |
| `clarification_initialized` | TECHNICAL | TECHNICAL | Diagnóstico interno |

### 3.3 Grupos semânticos (para agrupamento na UI)

```
GROUP: intake         → run_created, intake_completed, job_enqueued
GROUP: clarification  → clarification_*, task_plan_*, approval_*
GROUP: strategy       → strategy_*
GROUP: execution      → execution_*, phase_*, runtime_started, runtime_finished
GROUP: review         → review_*
GROUP: correction     → correction_*, retry_started
GROUP: recovery       → recovery_*, runtime_recovered, runtime_stale
GROUP: infra          → job_*, worker_*, scheduler_*, daemon_*
GROUP: workspace      → workspace_run_sync.*, workspace_run.*
```

---

## 4. Semantic Runtime Event Architecture

### 4.1 Problema central

Hoje existe **um único canal de eventos** (`events.jsonl` + SSE `runtime_event`) que mistura:
- Eventos de domínio de negócio (intake, clarification, strategy, execution)
- Eventos de infraestrutura (job, worker, scheduler)
- Eventos de observabilidade (workspace sync, daemon recovery)

A separação acontece **apenas no frontend** via heurísticas de regex. Isso é frágil, não escalável e impede telemetria server-side focada.

### 4.2 Proposta: Semantic Event Layer

Propor uma camada de transformação **no backend** que produz `SemanticOperationalEvent` a partir de `RuntimeEventRow`:

```typescript
// Contrato de saída da camada semântica
type SemanticOperationalEvent = {
  id: string;
  runId: string | null;
  jobId: string | null;
  projectId: string | null;
  timestamp: string;
  
  // Classificação semântica
  category: "user_facing" | "operational" | "technical" | "debug" | "noise";
  semanticGroup: "intake" | "clarification" | "strategy" | "execution" | "review" | "correction" | "recovery" | "infra" | "workspace";
  semanticType: string;         // ex: "plan_approved", "strategy_running", "execution_completed"
  
  // Impacto na UX
  activeStepImpact: "start" | "progress" | "checkpoint" | "gate" | "terminal" | "error" | "none";
  requiresUserAction: boolean;
  
  // Mensagens
  shortMessage: string;         // max 80 chars, human readable
  detail: string | null;        // max 200 chars, opcional
  technicalPayload: unknown;    // payload bruto para Debug Console
  
  // Flags
  userVisible: boolean;
  debugOnly: boolean;
  isTerminal: boolean;
  
  // Metadados de fase
  phase: SemanticPhase | null;
  phaseProgress: number | null; // 0–1 dentro da fase, quando calculável
};

type SemanticPhase = 
  | "intake" 
  | "clarification" 
  | "planning" 
  | "strategy" 
  | "execution" 
  | "review" 
  | "correction" 
  | "completed" 
  | "failed";
```

### 4.3 Mapeamento técnico → semântico (exemplos)

| Evento técnico | semanticType | shortMessage | activeStepImpact |
|----------------|-------------|--------------|-----------------|
| `run_created` | `run_initialized` | "Run iniciado" | `start` |
| `intake_completed` | `intake_done` | "Intake concluído" | `checkpoint` |
| `clarification_questions_generated` | `questions_ready` | "Perguntas geradas — aguarda resposta" | `gate` |
| `clarification_answers_submitted` | `answers_received` | "Respostas recebidas" | `progress` |
| `task_plan_initial_created` | `initial_plan_ready` | "Plano inicial criado" | `checkpoint` |
| `task_plan_refined_created` | `refined_plan_ready` | "Plano refinado criado" | `checkpoint` |
| `approval_requested` | `approval_pending` | "Aprovação necessária" | `gate` |
| `clarification_approve` | `plan_approved` | "Plano aprovado" | `checkpoint` |
| `clarification_reject` | `plan_rejected` | "Plano rejeitado — revisão solicitada" | `progress` |
| `strategy_started` | `strategy_running` | "Gerando estratégia operacional..." | `start` |
| `strategy_completed` (skipped=true) | `strategy_skipped` | "Estratégia concluída (sem decomposição necessária)" | `checkpoint` |
| `strategy_completed` (skipped=false) | `strategy_done` | "Estratégia operacional gerada" | `checkpoint` |
| `strategy_failed` | `strategy_error` | "Estratégia falhou" | `error` |
| `execution_triggered` | `execution_queued` | "Execução enfileirada" | `progress` |
| `execution_started` | `execution_running` | "Executor iniciando..." | `start` |
| `phase_started` (data.phase) | `phase_running` | "Fase: {phase}" | `progress` |
| `phase_completed` | `phase_done` | "Fase concluída: {phase}" | `checkpoint` |
| `execution_completed` | `execution_done` | "Execução concluída" | `terminal` |
| `execution_failed` | `execution_error` | "Execução falhou" | `error` |
| `review_started` | `review_running` | "Revisando resultado..." | `progress` |
| `review_completed` | `review_done` | "Revisão concluída" | `checkpoint` |
| `correction_started` | `correction_running` | "Aplicando correção..." | `progress` |
| `job_stuck_detected` | `stall_detected` | "Executor parece travado" | `error` |
| `scheduler_tick` | (descartado) | — | `none` |
| `worker_idle` | (descartado) | — | `none` |

### 4.4 Onde implementar a transformação

**Opção A (recomendada para V1):** Transformação puramente no frontend, em `map-event.ts`, usando o novo contrato `SemanticOperationalEvent`. Zero mudanças no backend.

**Opção B (recomendada para V2):** Emitir campo `semantic` dentro do `data` do evento no backend, enriquecendo progressivamente os eventos que o daemon já conhece.

**Opção C (futura):** Canal SSE separado `semantic_event` que emite apenas `SemanticOperationalEvent`, sem payload técnico.

---

## 5. Active Step Architecture

### 5.1 Definição

"Active Step" é o **único estado dominante visível** em qualquer momento da execução. Responde à pergunta: "O que está acontecendo agora?"

### 5.2 Estados possíveis do Active Step

```typescript
type ActiveStepState = {
  id: string;
  phase: SemanticPhase;
  status: ActiveStepStatus;
  label: string;                // ex: "Gerando estratégia..."
  sublabel: string | null;      // ex: "Fase: decomposition"
  startedAt: string | null;
  elapsedMs: number | null;
  requiresUserAction: boolean;
  userActionType: "clarify" | "approve" | "review" | null;
  stall: StallInfo | null;
};

type ActiveStepStatus = 
  | "initializing"    // ● Run criado, intake em progresso
  | "waiting_input"   // ⏸ Aguarda respostas do usuário
  | "waiting_approval"// ⏸ Aguarda aprovação do usuário
  | "processing"      // ● LLM/sistema processando
  | "executing"       // ● Executor rodando
  | "reviewing"       // ● Revisão em progresso
  | "correcting"      // ● Correção em progresso
  | "completed"       // ✓ Concluído
  | "failed"          // ✗ Falhou
  | "stalled";        // ⚠ Sem atividade detectada

type StallInfo = {
  detectedAt: string;
  silentForMs: number;
  context: string;    // ex: "Aguardando LLM", "Aguardando filesystem"
};
```

### 5.3 Fonte de verdade e derivação

```
Fonte primária:    último SemanticOperationalEvent com activeStepImpact != "none"
Fonte secundária:  workspace_run.* SSE events (estado do workspace run)
Fallback:          último evento com timestamp + stall detection timer
```

**Algoritmo de derivação:**
```
1. Filtrar eventos por runId atual
2. Ordenar por timestamp
3. Pegar último evento com activeStepImpact in ["start", "progress", "gate", "terminal", "error"]
4. Mapear para ActiveStepState via lookup table
5. Se último evento tem mais de STALL_THRESHOLD_MS sem novo evento → status = "stalled"
6. Se requiresUserAction → sobrescrever status para waiting_input | waiting_approval
```

**STALL_THRESHOLD_MS por fase:**
```
intake:        15_000ms
clarification: 30_000ms (LLM pode demorar)
strategy:      60_000ms (LLM estratégia é pesado)
execution:     45_000ms (por fase do pipeline)
review:        30_000ms
correction:    30_000ms
```

### 5.4 Sincronização SSE

O Active Step deve ser atualizado via SSE sem polling:
1. `runtime_event` SSE → `publishSseRuntimeEvent` → reducer de Active Step
2. `workspace_run.waiting_user_action` → força `status = "waiting_input"`
3. `workspace_run.advanced` → atualiza fase

### 5.5 Persistência e reidratação

- O Active Step é **derivado**, não persistido separadamente
- No refresh: replay dos eventos do runId atual → derivar Active Step
- O evento mais recente no JSONL por runId é a fonte de verdade
- `useRunEvents` (merge API + live) já fornece os dados necessários

### 5.6 Visual proposto

```
Estado: Gerando estratégia operacional...        ●●● (animado)
        Fase: decomposition · 47s
        
        [Último progresso há 12s]
```

```
Estado: Aprovação necessária                     ⏸
        Plano refinado criado — aguarda decisão
        
        [Aprovar plano] [Rejeitar]
```

```
Estado: Executor analisando arquivos...          ●●●
        Fase: file-analysis · subtarefa 2/8
```

```
Estado: Executor parece travado                  ⚠
        Sem atividade há 2m30s
        
        [Ver logs técnicos]
```

---

## 6. Timeline Architecture

### 6.1 Modelo de timeline proposto

A timeline deve ser uma **lista ordenada de checkpoints semânticos**, não um log de eventos brutos.

```typescript
type TimelineCheckpoint = {
  id: string;
  phase: SemanticPhase;
  status: "completed" | "active" | "pending" | "error" | "skipped";
  label: string;
  sublabel: string | null;
  timestamp: string | null;    // null para checkpoints futuros
  duration: string | null;     // ex: "2m14s" para checkpoints concluídos
  isUserAction: boolean;
  isGate: boolean;             // requer ação humana
  events: SemanticOperationalEvent[];  // eventos colapsados neste checkpoint
};

type ExecutionTimeline = {
  checkpoints: TimelineCheckpoint[];
  activeCheckpointId: string | null;
  overallProgress: number;     // 0–1, baseado em checkpoints concluídos
  estimatedRemaining: string | null;
};
```

### 6.2 Checkpoints fixos do pipeline

Para cada run, existe uma sequência conhecida de checkpoints possíveis:

```
PIPELINE_CHECKPOINTS = [
  { id: "intake",         label: "Intake",                   phase: "intake" },
  { id: "clarification",  label: "Clarificação",             phase: "clarification" },
  { id: "planning",       label: "Planejamento",             phase: "planning" },
  { id: "approval",       label: "Aprovação",                phase: "clarification", isGate: true },
  { id: "strategy",       label: "Estratégia operacional",   phase: "strategy" },
  { id: "execution",      label: "Execução",                 phase: "execution" },
  { id: "review",         label: "Revisão",                  phase: "review" },
  { id: "completion",     label: "Conclusão",                phase: "completed" },
]
```

Checkpoints opcionais (ativados por eventos):
- `correction`: ativado se `correction_started` emitido
- `retry`: ativado se `retry_started` emitido

### 6.3 Progresso baseado em checkpoints

```
overallProgress = checkpoints_concluídos / total_checkpoints_ativos
```

Sem fake progress. A barra avança apenas quando um checkpoint passa para `completed`.

### 6.4 Ordenação e agrupamento

- Checkpoints ordenados por fase natural do pipeline
- Dentro de cada checkpoint: eventos colapsados em ordem cronológica
- Expansível: clicar no checkpoint revela os eventos individuais
- Correção/retry: aparecem como sub-checkpoints dentro de "Execução"

### 6.5 Exibição visual proposta

```
✓ Intake                          (há 3m)
✓ Clarificação                    (há 2m30s · 4 perguntas respondidas)
✓ Planejamento                    (há 2m · plano refinado)
✓ Aprovação                       (há 1m50s · aprovado por usuário)
● Estratégia operacional          (há 45s · executando...)
○ Execução
○ Revisão
○ Conclusão

[████████░░░░░░░░░░░░] 45%
```

### 6.6 Stalls na timeline

Se o checkpoint ativo está em stall:
```
● Estratégia operacional          ⚠ sem atividade há 2m30s
  Aguardando LLM...
```

### 6.7 Loops de correção na timeline

```
✓ Execução                        (concluída com correção)
  ↳ ✓ Tentativa 1                 (falhou · revisão iniciou correção)
  ↳ ✓ Correção 1                  (aplicada)
  ↳ ✓ Tentativa 2                 (concluída)
```

### 6.8 Persistência, replay e hydration

- Timeline é **derivada** dos eventos persistidos em `events.jsonl`
- No refresh: `GET /events?runId=X` → replay completo → derivar timeline
- SSE adiciona novos checkpoints em tempo real sem reload
- Deduplicação garantida por `runtimeLogDedupeKey`

---

## 7. Runtime Activity Feed

### 7.1 Propósito

O Activity Feed substitui a aba "Observabilidade" atual como painel expandido. Mostra os **eventos operacionais** (camadas USER_FACING + OPERATIONAL) em ordem cronológica, com granularidade maior que a timeline mas sem o ruído técnico.

### 7.2 Estrutura proposta

```
RUNTIME ACTIVITY FEED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[Intake]
  09:14:02  ✓  Run iniciado
  09:14:03  ✓  Intake concluído

[Clarificação]
  09:14:04  ●  4 perguntas geradas
  09:15:32  ✓  Respostas recebidas
  09:15:33  ✓  Plano inicial criado
  09:15:45  ✓  Plano refinado criado
  09:15:46  ⏸  Aprovação necessária
  09:16:10  ✓  Plano aprovado

[Estratégia]
  09:16:11  ●  Gerando estratégia operacional...  ←— active
             └  Fase: decomposition

```

### 7.3 Filtros do Activity Feed

- **Por fase**: Intake / Clarificação / Estratégia / Execução / Revisão / Correção
- **Por severidade**: Info / Warn / Error
- **Por ação de usuário**: toggle para mostrar apenas ações humanas
- **Compactar loops**: collapse de correction/retry repetidos

### 7.4 Comportamento de scroll

- Auto-scroll para o evento mais recente quando ativo
- Anchor no active event (não perde posição se usuário fez scroll manual)
- Indicador visual de novos eventos quando scrollado para cima

### 7.5 Eventos colapsáveis

Eventos repetitivos do mesmo tipo em janela de 30s → colapsar em "N eventos similares":
```
  [+3] Fase: file-analysis (progresso)
```

---

## 8. Technical Debug Console

### 8.1 Propósito

Separar completamente os logs técnicos (TECHNICAL + DEBUG) da experiência principal. Acessível via toggle ou aba separada "Debug".

### 8.2 Conteúdo do Debug Console

Mostra **todos os eventos** incluindo os filtrados do Activity Feed:
- `workspace_run_sync.*` (tick, summary, backoff)
- `scheduler_tick`, `worker_*`, `daemon_*`
- `job_*` (infra)
- Payloads técnicos completos (sem truncamento)
- SSE connection/reconnection events
- `phase_started/completed` com contexto completo
- `clarification_initialized` (diagnóstico)
- Timestamps precisos (ms)
- IDs completos (event ID, job ID, run ID)

### 8.3 Estrutura proposta

```
TECHNICAL DEBUG CONSOLE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Filtros: ALL | DAEMON | WORKER | SCHEDULER | WORKSPACE | RUNTIME]
[Severidade: ALL | ERROR | WARN | INFO]
[Export JSONL]

09:14:02.341  [ORCHESTRATOR]  job_enqueued        jobId=j_abc123  projectId=p_xyz
09:14:02.342  [WORKER]        job_claimed         jobId=j_abc123
09:14:02.343  [WORKER]        job_started         jobId=j_abc123
09:14:02.344  [RUNTIME]       runtime_started     jobId=j_abc123
09:14:02.345  [RUNTIME]       phase_started       phase=intake
...
09:14:10.001  [WORKSPACE]     workspace_run_sync.tick   workspaceRunId=wr_def
09:14:10.002  [SCHEDULER]     scheduler_tick      ts=2026-05-17T09:14:10.002Z
```

### 8.4 Separação de tabs proposta

```
┌─────────────────────────────────────────────────┐
│  MISSION CONTROL                                 │
│  [Timeline]  [Activity Feed]  [Debug]  [Docs]   │
└─────────────────────────────────────────────────┘
```

- **Timeline**: checkpoints visuais + active step (tela principal)
- **Activity Feed**: eventos operacionais (USER_FACING + OPERATIONAL)
- **Debug**: todos os eventos técnicos, exportável
- A aba "Observabilidade" atual divide em Activity Feed + Debug

---

## 9. UX State Machine

### 9.1 Estados da máquina de execução (RunUxState)

```typescript
type RunUxState =
  | { status: "idle" }                           // sem run ativo
  | { status: "initializing"; since: string }    // run criado, intake em progresso
  | { 
      status: "waiting_clarification"; 
      since: string;
      questionsCount: number;
    }
  | { 
      status: "planning"; 
      since: string;
      planVersion: "initial" | "refined";
    }
  | { 
      status: "waiting_approval"; 
      since: string;
    }
  | { 
      status: "strategy"; 
      since: string;
      elapsedMs: number;
      stall: StallInfo | null;
    }
  | { 
      status: "executing"; 
      since: string;
      currentPhase: string | null;
      subtaskProgress: { current: number; total: number } | null;
      stall: StallInfo | null;
    }
  | { 
      status: "reviewing"; 
      since: string;
      attempt: number;
    }
  | { 
      status: "correcting"; 
      since: string;
      attempt: number;
    }
  | { 
      status: "completed"; 
      since: string;
      duration: string;
    }
  | { 
      status: "failed"; 
      since: string;
      reason: string;
      recoverable: boolean;
    }
  | { 
      status: "stalled"; 
      since: string;
      lastActivityAt: string;
      silentForMs: number;
      context: string;
    };
```

### 9.2 Transições de estado

```
idle              → initializing        (run_created)
initializing      → waiting_clarification (clarification_questions_generated)
initializing      → planning            (task_plan_initial_created, sem perguntas)
waiting_clarification → planning        (clarification_answers_submitted)
planning          → waiting_approval    (approval_requested)
planning          → strategy            (strategy_auto_started_after_approval)
waiting_approval  → strategy            (clarification_approve)
waiting_approval  → planning            (clarification_reject)
strategy          → executing           (execution_triggered | execution_started)
executing         → reviewing           (review_started)
reviewing         → correcting          (review_rejected + correction_started)
reviewing         → completed           (review_completed + execution_completed)
correcting        → executing           (correction_completed)
executing         → completed           (execution_completed, sem review)
any               → failed              (execution_failed | strategy_failed | recovery_failed)
any               → stalled             (timer: STALL_THRESHOLD_MS sem evento)
stalled           → any                 (novo evento recebido)
failed            → initializing        (job_requeued | job_retry_requested)
```

### 9.3 Derivação do estado a partir de eventos

```typescript
function deriveRunUxState(events: SemanticOperationalEvent[], nowMs: number): RunUxState {
  // 1. Filtrar por runId, ordenar por timestamp
  // 2. Replay linear de transições
  // 3. Verificar stall no estado atual
  // 4. Retornar estado atual
}
```

Reducer puro, determinístico, testável sem efeitos colaterais.

### 9.4 Exposição no frontend

```typescript
// Hook derivado
function useRunUxState(runId: string): RunUxState {
  const events = useRunEvents(runId);      // existente
  const nowMs = useNow(5000);              // tick a cada 5s para stall detection
  return useMemo(() => deriveRunUxState(events, nowMs), [events, nowMs]);
}
```

---

## 10. Event Normalization Contract

### 10.1 Contrato de evento normalizado

```typescript
type NormalizedRuntimeEvent = {
  // Identidade
  id: string;                              // evt_xxx
  runId: string | null;
  jobId: string | null;
  projectId: string | null;
  timestamp: string;                       // ISO 8601
  
  // Classificação
  category: EventCategory;                 // user_facing | operational | technical | debug | noise
  semanticGroup: SemanticGroup;            // intake | clarification | strategy | execution | ...
  semanticType: string;                    // ex: "plan_approved"
  rawType: string;                         // ex: "clarification_approve" (original)
  
  // Impacto
  activeStepImpact: ActiveStepImpact;      // start | progress | checkpoint | gate | terminal | error | none
  requiresUserAction: boolean;
  userActionType: UserActionType | null;   // clarify | approve | review | null
  isTerminal: boolean;
  
  // Mensagens
  shortMessage: string;                    // max 80 chars, PT-BR, human readable
  detail: string | null;                   // max 200 chars, opcional
  technicalPayload: Record<string, unknown> | null;  // payload bruto
  
  // UX
  userVisible: boolean;                    // aparece no Activity Feed
  debugOnly: boolean;                      // apenas no Debug Console
  
  // Fase
  phase: SemanticPhase | null;
  
  // Deduplicação
  dedupeKey: string;                       // hash(runId + rawType + timestamp_minute)
};

type EventCategory = "user_facing" | "operational" | "technical" | "debug" | "noise";
type SemanticGroup = "intake" | "clarification" | "strategy" | "execution" | "review" | "correction" | "recovery" | "infra" | "workspace";
type ActiveStepImpact = "start" | "progress" | "checkpoint" | "gate" | "terminal" | "error" | "none";
type UserActionType = "clarify" | "approve" | "review";
type SemanticPhase = "intake" | "clarification" | "planning" | "strategy" | "execution" | "review" | "correction" | "completed" | "failed";
```

### 10.2 Naming convention para semanticType

```
{domínio}_{estado}

Exemplos:
  run_initialized
  intake_done
  questions_ready
  answers_received
  initial_plan_ready
  refined_plan_ready
  approval_pending
  plan_approved
  plan_rejected
  strategy_running
  strategy_done
  strategy_error
  execution_queued
  execution_running
  phase_running
  phase_done
  execution_done
  execution_error
  review_running
  review_done
  correction_running
  stall_detected
  run_completed
  run_failed
```

### 10.3 Deduplicação

Chave de dedupe proposta:
```typescript
dedupeKey = sha1(`${runId}:${semanticType}:${timestamp_truncated_to_minute}`)
```

Eventos com mesmo `dedupeKey` dentro de janela de 60s são colapsados (mostrar count, não duplicar na timeline).

Exceção: eventos `gate` (waiting_approval, questions_ready) nunca são deduplicados pois são estados únicos e importantes.

### 10.4 Transformação incremental

```
ApiRuntimeEventRow         (backend atual)
    ↓  mapApiEventToDto
RuntimeEventDto            (frontend atual)
    ↓  normalizeRuntimeEvent (NOVO)
NormalizedRuntimeEvent     (contrato novo)
    ↓  deriveRunUxState
RunUxState                 (estado UX)
    ↓  deriveTimeline
ExecutionTimeline          (timeline visual)
```

---

## 11. Noise Reduction Strategy

### 11.1 Eventos a descartar completamente da UI

| Evento | Estratégia | Razão |
|--------|-----------|-------|
| `scheduler_tick` | DISCARD | Heartbeat de infra, sem valor UX |
| `worker_idle` | DISCARD | Estado interno do worker |
| `worker_busy` | DISCARD | Estado interno do worker |
| `maintenance_queue_pruned` | DISCARD | Manutenção silenciosa |
| `maintenance_events_pruned` | DISCARD | Manutenção silenciosa |
| `workspace_run_sync.tick` | DISCARD | Heartbeat de sync |
| `recurring_job_scheduled` | DISCARD | Infra agendamento |
| `recurring_job_skipped` | DISCARD | Infra agendamento |
| `job_available` | DISCARD | Sinal de fila interna |
| `job_scheduled` | DISCARD | Sinal de fila interna |
| `job_delayed` | DISCARD | Sinal de fila interna |
| `retry_available` | DISCARD | Sinal de fila interna |
| `retry_scheduled` | DISCARD | Sinal de fila interna |
| `delayed_job_recovered` | DISCARD | Infra recovery |

### 11.2 Eventos a mover para Debug Console apenas

| Evento | Estratégia |
|--------|-----------|
| `job_claimed`, `job_started` | DEBUG only |
| `job_completed` | DEBUG (já representado por `execution_completed`) |
| `worker_started`, `worker_stopping`, `worker_stopped` | DEBUG only |
| `worker_crashed` | Converter em alerta OPERATIONAL se associado a runId ativo |
| `daemon_recovery_*` | DEBUG only (exceto se recovery falhou → OPERATIONAL) |
| `workspace_run_sync.summary` | DEBUG only (métrica de sync) |
| `workspace_run_sync.backoff` | DEBUG only |
| `clarification_initialized` | DEBUG only (diagnóstico interno) |
| `git_branch_prepared` | DEBUG only |
| `runtime_started`, `runtime_finished` | DEBUG only |

### 11.3 Eventos a colapsar/agregar

| Padrão | Estratégia de colapso |
|--------|----------------------|
| Múltiplos `phase_started` do mesmo job | Mostrar apenas o mais recente com histórico expansível |
| `correction_started` + `correction_completed` consecutivos | Colapsar em "Correção aplicada" |
| `review_started` → `review_rejected` → `correction_*` → loop | Colapsar em "Loop de correção (N iterações)" |
| `execution_started` duplicado (2 fontes) | Deduplicar por `dedupeKey` |
| `workspace_run_sync.*` sem runId | Agrupar em "Workspace sync" no Debug Console |

### 11.4 Transformar em métricas silenciosas

Os seguintes eventos devem alimentar **métricas internas** sem aparecer no feed:

```
scheduler_tick        → métrica: daemon alive
worker_idle           → métrica: idle_since
workspace_run_sync.tick → métrica: last_sync_at
heartbeat SSE         → métrica: connection_alive
```

Essas métricas alimentam badges de status (ex: "● Daemon ativo · sync há 3s") sem poluir a timeline.

### 11.5 Resultado esperado na timeline principal

**Antes (log atual):**
```
workspace_run_sync.tick
workspace_run_sync.tick
scheduler_tick
worker_idle
workspace_run_sync.summary {payload 2KB}
output_dir_resolved
governance_validation
strategy_started
workspace_run_sync.tick
strategy_completed skipped=true
```

**Depois (Activity Feed):**
```
✓ Estratégia operacional concluída
  Nenhuma decomposição adicional necessária.
```

---

## 12. Future Compatibility Analysis

### 12.1 Multi-projeto

- O `NormalizedRuntimeEvent` já inclui `projectId`
- A `ExecutionTimeline` deve ser indexada por `runId`, não global
- O Active Step precisa de contexto por projeto para exibição multi-projeto
- A `SemanticGroup` e `SemanticPhase` são agnósticas de projeto → compatível

### 12.2 DAG de execução

- O modelo atual de checkpoints lineares pode evoluir para `CheckpointGraph`
- `TimelineCheckpoint.dependsOn?: string[]` para representar DAG
- O progresso geral precisará mudar de linear para DAG-weighted
- A UX de DAG visual (tipo GitHub Actions matrix) é extensão natural

### 12.3 Subtasks

- `phase_started` já carrega `data.phase` que pode ser `subtask_N`
- `NormalizedRuntimeEvent.phase` pode ser hierárquico: `"execution.subtask_2"`
- A timeline pode ter sub-checkpoints dentro de "Execução"

### 12.4 Correction/Review loops

- O modelo de `RunUxState` já tem `attempt: number`
- A timeline já prevê "Loop de correção (N iterações)"
- Sem limite de loops → compatível com N retries

### 12.5 Multi-agent

- Quando existirem múltiplos agentes em paralelo, cada um produzirá eventos com seu próprio `jobId`
- O `NormalizedRuntimeEvent` precisa de campo `agentId?: string` para futura distinção
- A timeline precisará de "trilhas paralelas" (tipo GitHub Actions matrix)

### 12.6 Realtime streaming

- O canal SSE já suporta streaming de eventos individuais
- A adição de `semantic_event` como novo tipo SSE não quebra clientes existentes
- `EventSource` pode receber múltiplos tipos de evento → compatível

### 12.7 Orchestration futura

- `SemanticPhase` pode ser estendido com novas fases sem breaking change
- `PIPELINE_CHECKPOINTS` pode receber novos checkpoints opcionais
- `RunUxState` aceita novos estados via union type

---

## 13. Frontend Architecture Proposal

### 13.1 Stores necessários (novos ou modificados)

```
NOVO:  semantic-event-store.ts
       - Map<runId, NormalizedRuntimeEvent[]>
       - alimentado por useRunEvents (existente)
       - aplica normalizeRuntimeEvent a cada ApiRuntimeEventRow
       
NOVO:  run-ux-state-store.ts
       - Map<runId, RunUxState>
       - derivado de semantic-event-store
       - atualizado em tempo real via SSE
       
NOVO:  execution-timeline-store.ts
       - Map<runId, ExecutionTimeline>
       - derivado de semantic-event-store
       - inclui checkpoints fixos + derivados de eventos
       
NOVO:  stall-detector-store.ts
       - Map<runId, StallInfo | null>
       - timer-based, roda a cada 5s
       - alimenta RunUxState.stall
       
EXISTENTE MANTIDO:  runtime-live-events-store.ts (sem modificação)
EXISTENTE MANTIDO:  runtime-sse-store.ts (sem modificação)
EXISTENTE MANTIDO:  workspace-run-sse-store.ts (sem modificação)
EXISTENTE MANTIDO:  runtime-connection-store.ts (sem modificação)
```

### 13.2 Hooks necessários

```
NOVO:  useRunUxState(runId)
       - consome semantic-event-store
       - aplica deriveRunUxState
       - inclui stall detection via useNow(5000)
       
NOVO:  useExecutionTimeline(runId)
       - consome semantic-event-store
       - aplica deriveExecutionTimeline
       - retorna ExecutionTimeline

NOVO:  useActivityFeed(runId, options?)
       - filtra NormalizedRuntimeEvent por category in ["user_facing", "operational"]
       - suporta filtros por phase, severity, userAction
       
NOVO:  useDebugConsole(runId, projectId?)
       - retorna TODOS os NormalizedRuntimeEvent inclusive debug/noise
       - sem filtros (mas com opções de filtro na UI)
       
EXISTENTE MANTIDO:  useRunEvents (sem modificação)
EXISTENTE MANTIDO:  useRuntimeSse (sem modificação)
```

### 13.3 Funções puras (sem side effects)

```typescript
// Núcleo da camada semântica
normalizeRuntimeEvent(row: ApiRuntimeEventRow): NormalizedRuntimeEvent
deriveRunUxState(events: NormalizedRuntimeEvent[], nowMs: number): RunUxState
deriveExecutionTimeline(events: NormalizedRuntimeEvent[]): ExecutionTimeline
deriveActiveStep(state: RunUxState): ActiveStepState
deriveCheckpointFromEvents(events: NormalizedRuntimeEvent[]): TimelineCheckpoint[]
detectStall(events: NormalizedRuntimeEvent[], phase: SemanticPhase, nowMs: number): StallInfo | null
```

### 13.4 Componentes novos

```
NOVO:  ActiveStepBanner
       - Exibe o estado dominante atual
       - Posição: topo do painel de run, sticky
       - Atualiza em tempo real via useRunUxState

NOVO:  ExecutionTimelineView
       - Substitui/unifica RunOperationalTimelinePanel + CentralExecutionTimeline
       - Checkpoints fixos com estado derived
       - Progresso geral

NOVO:  RuntimeActivityFeed
       - Lista de eventos OPERATIONAL filtrados
       - Auto-scroll, grupos por fase, collapse

NOVO:  TechnicalDebugConsole
       - Todos os eventos, sem filtro, com export
       
MODIFICADO:  RunViewShell
       - Adicionar ActiveStepBanner no topo
       - Substituir tabs de observabilidade por Activity Feed + Debug
```

### 13.5 Separação de responsabilidades

```
Dados brutos:         useRunEvents (existente)
Normalização:         normalizeRuntimeEvent (novo, puro)
Estado UX:            deriveRunUxState (novo, puro)
Timeline:             deriveExecutionTimeline (novo, puro)
Apresentação:         componentes novos
Debug/técnico:        canais existentes de observabilidade (intactos)
```

---

## 14. Backend e Runtime Impacts

### 14.1 Impactos no backend para V1 (mínimos)

**Nenhuma alteração obrigatória.** A camada semântica V1 é puramente frontend.

Melhorias opcionais de baixo risco:
- Corrigir `clarification_approve` → `clarification_approved` para consistência
- Garantir `projectId` em todos os eventos de domínio (clarification, strategy)
- Adicionar campo `phase` no `data` dos eventos de domínio onde falta

### 14.2 Impactos no backend para V2 (opcional)

- Emitir campo `semantic: { type, group, category, shortMessage }` dentro do `data` dos eventos
- Novo endpoint `GET /events/semantic?runId=X` que retorna apenas NormalizedRuntimeEvent
- Canal SSE `semantic_event` separado de `runtime_event`

### 14.3 Impactos no `emitRuntimeEvent`

Para V1: zero mudanças.
Para V2: aceitar opcionalmente `semantic` no payload e passá-lo no `data`.

### 14.4 `KNOWN_RUNTIME_EVENT_TYPES` precisa de atualização

Este set deve incluir **todos** os tipos de eventos emitidos (intake, clarification, strategy, execution, review, correction). Atualmente só lista infra. Mas isso é uma melhoria de documentação/validação, não bloqueia a V1 da UX.

---

## 15. SSE Impacts

### 15.1 Para V1

Zero mudanças no servidor SSE. O frontend consome `runtime_event` existente e aplica `normalizeRuntimeEvent`.

### 15.2 Para V2 (opcional)

Adicionar tipo de evento SSE `semantic_event` no `/events/stream`:
```
event: semantic_event
data: {"ok":true,"event":{...NormalizedRuntimeEvent}}
```

Vantagens:
- Clientes antigos ignoram o novo tipo (compatível)
- Clientes novos podem subscrever apenas `semantic_event` sem processar raw
- Filtro mais eficiente: servidor já decide o que é user_visible

### 15.3 Heartbeat SSE como métrica

O `heartbeat` SSE (a cada ~25s) deve alimentar `runtime-connection-store` como `lastHeartbeatAt`, exibido como badge "● Conexão ativa" sem aparecer na timeline.

### 15.4 `workspace_run.*` SSE

Estes eventos já são semânticos (`.waiting_user_action`, `.advanced`, `.completed`). Podem alimentar diretamente o `RunUxState` sem transformação adicional. `workspace_run.waiting_user_action` → força transição para `status: "waiting_input"`.

---

## 16. Persistência, Replay e Hydration

### 16.1 Modelo de persistência

| Dado | Onde persiste | Formato |
|------|--------------|---------|
| Eventos brutos | `events.jsonl` | JSONL append-only |
| Estado semântico | derivado, não persistido | em memória |
| Active Step | derivado, não persistido | em memória |
| Timeline | derivada, não persistida | em memória |
| Stall info | em memória com timer | volátil |

### 16.2 Replay no refresh

```
1. Página carrega, runId conhecido
2. GET /events?runId=X&limit=500
3. mapApiEventToDto → normalizeRuntimeEvent (para cada evento)
4. deriveRunUxState(eventos, Date.now()) → estado atual
5. deriveExecutionTimeline(eventos) → timeline atual
6. SSE reconecta → novos eventos adicionados incrementalmente
7. Estado UX atualizado a cada novo evento
```

### 16.3 Hydration sem refresh completo

SSE já garante que novos eventos chegam em tempo real. O reducer é incremental:
```typescript
// A cada runtime_event SSE:
function addEventToStore(store: SemanticEventStore, event: NormalizedRuntimeEvent) {
  const existing = store.get(event.runId) ?? [];
  store.set(event.runId, [...existing, event]);
  // State UX é re-derivado automaticamente por dependência reativa
}
```

### 16.4 Considerações de rotação do JSONL

O `events.jsonl` é rotacionado ao atingir `MAX_EVENTS_FILE_BYTES` (1MB padrão), mantendo as últimas 4000 linhas. Para runs longas com muitos eventos, o replay pode perder eventos antigos. Mitigação:
- V1: aceitar como limitação (eventos antigos são menos relevantes para UX)
- V2: adicionar endpoint `GET /runs/:runId/timeline` que retorna apenas os checkpoints semânticos persistidos, independente da rotação do JSONL

---

## 17. Migração Incremental

### Fase 1 — Normalização (sem breaking changes)

**Escopo:** Adicionar `normalizeRuntimeEvent` e `deriveRunUxState` como funções puras.
- Não remove nenhum componente existente
- Não altera nenhuma API
- Adiciona `semantic-event-store` alimentado pelos dados existentes
- Adiciona `useRunUxState` hook derivado
- Testa: a função pura com snapshot tests dos eventos reais

**Resultado visível:** Nenhum (fundação invisível)

### Fase 2 — Active Step Banner

**Escopo:** Exibir `ActiveStepBanner` no topo do run, consumindo `useRunUxState`.
- Não remove nenhum componente existente
- Adiciona elemento visual novo acima da timeline existente
- Inclui stall detection básico (timer 5s)

**Resultado visível:** Usuário vê "● Gerando estratégia..." em destaque no topo

### Fase 3 — Timeline com checkpoints fixos

**Escopo:** Substituir `RunOperationalTimelinePanel` por `ExecutionTimelineView` com checkpoints.
- Remove/depreca `RunOperationalTimelinePanel`
- Mantém `CentralExecutionTimeline` (aba diferente)
- Adiciona progresso visual (barra de checkpoints)

**Resultado visível:** Timeline limpa com ✓ / ● / ○ por fase

### Fase 4 — Activity Feed

**Escopo:** Substituir aba "Observabilidade" por tabs Activity Feed + Debug.
- `RuntimeActivityFeed` (filtrado, operacional)
- `TechnicalDebugConsole` (tudo, exportável)
- Migra `RuntimeObservabilityLogs` para Debug Console

**Resultado visível:** Aba principal mostra apenas eventos humanos; logs técnicos em Debug

### Fase 5 — Noise reduction + event collapsing

**Escopo:** Implementar collapse de eventos repetitivos e descarte de noise.
- Ajustar `normalizeRuntimeEvent` para marcar NOISE
- Implementar deduplicação por `dedupeKey`
- Implementar colapso de correction loops

**Resultado visível:** Timeline limpa sem ruído técnico

---

## 18. Riscos

| Risco | Probabilidade | Impacto | Mitigação |
|-------|--------------|---------|-----------|
| Eventos com `jobId`/`projectId` nulos não aparecem na timeline | Alta | Alto | Filtrar por `runId` como fallback primário (já existe em `readRuntimeEventsFiltered`) |
| `execution_started` duplicado cria checkpoint duplicado | Média | Médio | Deduplicação por `dedupeKey` na timeline |
| `deriveRunUxState` fica desatualizado se evento não chega via SSE | Baixa | Médio | Polling periódico como fallback (já existe via React Query) |
| Stall detection com threshold errado (falso positivo) | Média | Baixo | Thresholds configuráveis via env/config; feedback visual não bloqueia workflow |
| Timeline derivada difere de estado real após rotação do JSONL | Baixa | Médio | Endpoint de snapshot de run para V2 |
| Dois `EventSource` causam reconexão em cascata | Baixa | Baixo | `unified-realtime-status.ts` já trata isso |
| Regex frágil em `inferPhaseBucket` misclassifica eventos | Média | Baixo | Substituição por lookup table determinístico no `normalizeRuntimeEvent` |
| Breaking change acidental no `useRunEvents` existente | Baixa | Alto | Camada nova é adicional, não substitutiva na fase 1 |

---

## 19. Complexidade

### 19.1 Estimativa por área

| Área | Complexidade | Observações |
|------|-------------|-------------|
| `normalizeRuntimeEvent` (função pura) | Baixa | Lookup table, testável |
| `deriveRunUxState` (reducer puro) | Média | ~15 transições de estado |
| `deriveExecutionTimeline` | Média | Checkpoints fixos + derivação |
| `ActiveStepBanner` (componente) | Baixa | Consome hook existente |
| `ExecutionTimelineView` | Média | Novo componente visual |
| `RuntimeActivityFeed` | Média | Filtro + auto-scroll + collapse |
| `TechnicalDebugConsole` | Baixa | Lista existente + export |
| Stall detection (timer) | Baixa | useEffect + timer |
| Backend semantic events (V2) | Alta | Mudança em runtime-events.js |
| SSE `semantic_event` (V2) | Média | Novo tipo SSE + filtros |
| Snapshot de run (V2) | Média | Novo endpoint |

### 19.2 Total estimado

- **V1 (phases 1–3):** 3–5 dias de implementação
- **V2 (phases 4–5):** 2–3 dias adicionais
- **V3 (backend):** 2–4 dias adicionais

**Total para experiência completa:** ~7–12 dias de implementação faseada

---

## 20. Plano Faseado de Implementação

### Phase UX-A: Fundação Semântica

**Duração estimada:** 1–2 dias

**Entregáveis:**
1. `frontend/lib/runtime/semantic/normalize-runtime-event.ts` — função pura de normalização
2. `frontend/lib/runtime/semantic/derive-run-ux-state.ts` — reducer de estado UX
3. `frontend/lib/runtime/semantic/derive-execution-timeline.ts` — derivação de timeline
4. `frontend/stores/semantic-event-store.ts` — Zustand store derivado
5. `frontend/stores/run-ux-state-store.ts` — Zustand store derivado
6. Testes unitários de snapshot para as funções puras

**Critério de conclusão:** Funções puras testadas com eventos reais do JSONL

---

### Phase UX-B: Active Step Banner

**Duração estimada:** 1 dia

**Entregáveis:**
1. `useRunUxState(runId)` hook
2. `ActiveStepBanner` componente (sticky no topo do run)
3. Stall detection via `useNow(5000)`
4. Integração em `RunViewShell`

**Critério de conclusão:** Usuário vê estado dominante em tempo real no topo

---

### Phase UX-C: Timeline com Checkpoints

**Duração estimada:** 1–2 dias

**Entregáveis:**
1. `useExecutionTimeline(runId)` hook
2. `ExecutionTimelineView` componente com checkpoints fixos
3. Barra de progresso baseada em checkpoints concluídos
4. Integração em lugar de `RunOperationalTimelinePanel`

**Critério de conclusão:** Timeline mostra ✓/●/○ por fase com progresso

---

### Phase UX-D: Activity Feed + Debug Console

**Duração estimada:** 1–2 dias

**Entregáveis:**
1. `RuntimeActivityFeed` componente
2. `TechnicalDebugConsole` componente
3. Substituição das tabs de observabilidade
4. Auto-scroll e filtros no Activity Feed

**Critério de conclusão:** Logs técnicos separados dos operacionais

---

### Phase UX-E: Noise Reduction e Polish

**Duração estimada:** 1 dia

**Entregáveis:**
1. Descarte de NOISE no `normalizeRuntimeEvent`
2. Deduplicação por `dedupeKey`
3. Colapso de correction/review loops
4. Ajuste fino de thresholds de stall

**Critério de conclusão:** Timeline principal completamente limpa e humana

---

### Phase UX-F: Backend Enhancements (opcional)

**Duração estimada:** 2–4 dias

**Entregáveis:**
1. Atualizar `KNOWN_RUNTIME_EVENT_TYPES` com todos os eventos de domínio
2. Garantir `projectId` em eventos de domínio
3. Endpoint `GET /runs/:runId/timeline` (snapshot semântico)
4. Canal SSE `semantic_event` opcional

**Critério de conclusão:** Backend emite dados semânticos nativamente

---

## Sumário Executivo

### O que está errado hoje

O runtime **funciona corretamente**. O problema é a ausência de uma **camada de tradução semântica** entre os eventos técnicos do runtime e a experiência do usuário. Eventos de infra (scheduler, worker, daemon) estão misturados com eventos de domínio na mesma fila. A timeline atual é derivada por heurísticas de regex frágeis. Não existe um "estado dominante" visível. Não existe detecção de stall. Os checkpoints futuros do pipeline são invisíveis.

### O que precisa ser feito

1. **Criar `normalizeRuntimeEvent`** — função pura que classifica cada evento em categoria semântica e produz mensagem humana
2. **Criar `deriveRunUxState`** — reducer determinístico que produz o estado atual da execução
3. **Criar `ActiveStepBanner`** — componente que exibe o estado dominante no topo
4. **Criar `ExecutionTimelineView`** — timeline com checkpoints fixos do pipeline
5. **Separar Activity Feed de Debug Console** — eventos operacionais vs técnicos

### Resultado esperado

O Mission Control deve transmitir:
- **O que está acontecendo agora** (Active Step Banner, sempre visível)
- **O que já aconteceu** (checkpoints ✓ na timeline)
- **O que falta** (checkpoints ○ na timeline)
- **Se algo travou** (stall detection com visual de alerta)
- **Se depende de ação humana** (gate visual no Active Step e na timeline)
- **Quão avançado está** (barra de progresso por checkpoints)

Sem perder rastreabilidade técnica — o Debug Console contém tudo.

### Analogia de referência

```
Cursor / Claude Code:    Active step banner com spinner
GitHub Actions:          Pipeline de checkpoints ✓/●/○
Vercel deploys:          Progress bar determinístico
Linear:                  Estado atual dominante por etapa
```

O runtime atual **já é** como um GitHub Actions funcional. O que falta é a **interface que o representa** dessa forma.
