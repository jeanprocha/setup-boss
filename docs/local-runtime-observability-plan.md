# Plano técnico: observabilidade local robusta (runtime)

Documento de **discovery + plano apenas**. Sem alterações de código nem comportamento.

---

## 1. Diagnóstico do problema actual

### 1.1 Sintoma

A Mission Control mostra progressão na timeline (incluindo mensagens que parecem confirmar artifacts “phase1” / clarificação), mas ao inspecionar disco — especialmente fora do **`projectRoot` registado** — não aparecem os ficheiros esperados.

### 1.2 Causas já identificadas (baseline)

| Categoria | Descrição |
|-----------|-----------|
| **Path errado** | Artefactos de corrida residem em **`<projectRoot>/docs/.IA/outputs/<runId>/`** (ou `.IA/outputs` legado). `SETUP_BOSS_DATA_DIR` é só estado do **daemon** (fila, locks, `events.jsonl`), não substitui a pasta IA do projeto. |
| **Nomes de contract** | Não há `task-plan.md` no pipeline actual — são **`task-plan-initial.md`** e **`task-plan-refined.md`**. |
| **Skip LLM** | Submissão via UI envia `skipLlm: true`; alguns markdowns de intake não são gerados por LLM. |
| **Clarificação em duas fases** | Primeira invocação passiva pode só inicializar sessão (`clarification_initialized`) **sem** `clarification-questions.json` ainda. |
| **Narração client-side** | `seedIntakeAuditForRun` injecta pseudo-eventos `intake_*` **sem ler disco** — timeline pode divergir do filesystem. |
| **Erros silenciosos** | `emitRuntimeEvent` pode falhar no append sem falhar o pedido; `run-intake-api.js` envolve emissões em `try/catch` vazio. |
| **Índice vs DATA_DIR** | `.setup-boss/runs/<runId>.json` no checkout setup-boss vs estado daemon opcionalmente isolado — dois “mundos” de paths. |

### 1.3 Gap central que este plano resolve

Hoje não há **trilho único auditável** que prove: mesmo request → mesmo `requestId` → path `outputDir` resolvido → cada artifact esperado/criado/lido → cada evento emitido e sua fonte (servidor vs cliente sintético). O sistema de logs proposto fecha esse gap **antes** de refactors maiores de UI/runtime.

---

## 2. Arquitectura proposta dos logs

### 2.1 Duas camadas (requisito §9 — separação)

| Camada | Destino sugerido | Conteúdo |
|--------|------------------|----------|
| **JSONL estruturado** | Por corrida **ou** por pedido correlacionável | Linhas JSON schema-fixo (campos mínimos + `correlation`). |
| **Log humano (opcional)** | `daemon.log` existente ou ficheiro rotativo por daemon | Mensagens curtas para operadores; não substitui JSONL. |

### 2.2 Onde gravar o JSONL por run

**Opção recomendada (coerência com fonte de verdade):**

- **Primário:** `<outputDir>/runtime-trace.jsonl` (isto é, **ao lado dos artifacts** da corrida no projecto), porque correlaciona naturalmente com `run-context.json` e validações.

**Opção complementar (daemon / troubleshooting quando output ainda não existe):**

- **`${SETUP_BOSS_DATA_DIR}/traces/<runId>.jsonl`** ou **`.../traces/<requestId>.jsonl`** até `outputDir` ser conhecido; primeira linha registaria `outputDir` resolvido.

**Racional:** operadores que olham só para `SETUP_BOSS_DATA_DIR` continuam sem ver IA outputs — o plano deve **espelhar no trace** `outputDir` absoluto e relativo sempre que resolvido.

### 2.3 Componentes instrumentados (alto nível)

```
UI (Next) → proxy /api/runtime → runtime-api.js → createRunFromTask / handlers
                → queue-store / workers
                → intake-runtime.js → clarification-runtime.js → …
                → runtime-events.js → events.jsonl → SSE → UI
```

Cada componente escreve no trace com campo `component` estável (`ui`, `runtime_api`, `queue`, `worker`, `intake`, `clarification`, `strategy`, `execution`, `sse_bridge`, `events_store`).

---

## 3. Formato JSONL recomendado

Uma linha = um objecto JSON. Campos mínimos (extensível com `data`).

### 3.1 Schema base (campos mínimos §1)

| Campo | Tipo | Notas |
|-------|------|--------|
| `ts` | string ISO8601 | Timestamp UTC |
| `level` | `"debug"\|"info"\|"warn"\|"error"` | |
| `component` | string | Ver lista §2.3 |
| `event` | string | snake_case, estável |
| `projectId` | string \| null | |
| `runId` | string \| null | |
| `jobId` | string \| null | |
| `phase` | string | Ex.: `intake`, `clarify`, `queue`, `sse` |
| `step` | string | Sub-etapa |
| `message` | string | Curto, human-readable PT ou EN (fixar uma língua no código) |
| `durationMs` | number \| null | Opcional; spans |
| `dataDir` | string \| null | Valor efectivo `SETUP_BOSS_DATA_DIR` ou default `.setup-boss` |
| `outputDir` | string \| null | Absoluto após resolve |
| `artifactPath` | string \| null | Relativo ao `outputDir` quando aplicável |
| `error` | object \| null | `{ code, message, stack?: }` |

### 3.2 Correlation (requisito §2)

Campos adicionais por linha (quando disponíveis):

| Campo | Descrição |
|-------|-----------|
| `requestId` | UUID gerado no início do pedido HTTP ou no cliente antes do POST |
| `traceId` | Opcional: mesmo que `requestId` ou jerárquico |
| `parentSpanId` / `spanId` | Opcional fase B+ |

**Propagação:** cabeçalho HTTP `X-Setup-Boss-Request-Id` (UI → proxy → daemon); eco na resposta JSON e na primeira linha do trace.

### 3.3 Artifact audit envelope (requisito §3)

Para linhas `event` prefixadas por `artifact_*`, usar `data`:

```json
{
  "artifactAudit": {
    "name": "run-context.json",
    "operation": "expected|created|read|missing|validation_failed",
    "sha256": null,
    "validationErrors": []
  }
}
```

---

## 4. Lista de eventos obrigatórios (checkpoints §5 + stream §4)

### 4.1 Pipeline / checkpoints

| `event` | `phase` | Notas |
|---------|---------|--------|
| `submit_received` | `api` | Body validado; `requestId` capturado |
| `job_enqueued` | `queue` | Alinhar com evento já existente |
| `run_created` | `orchestration` | Após intake+clarify+enqueue OK |
| `worker_claimed_job` | `worker` | Quando aplicável ao modelo actual |
| `intake_started` / `intake_completed` | `intake` | |
| `ia_context_loading_started` | `intake` | `ensureIA` / `resolveProjectIaDir` |
| `spec_generation_started` | `intake` | LLM intake (ou `skipped` explícito) |
| `artifacts_phase1_written` | `intake` | Lista nominal de paths |
| `clarification_detected` | `clarify` | Estado derivado vs artifact |
| `clarification_session_initialized` | `clarify` | |
| `questions_generation_started` | `clarify` | ou `skipped` |
| `approval_gate_waiting` | `clarify` | Quando UI estado assim |
| `executor_started` | `execution` | Futuro / já existente |
| `review_started` | `review` | Futuro |

Cada checkpoint deve ter variantes internas ou campo `outcome`: `start | success | failure | skipped` (via `step` ou `data.outcome`).

### 4.2 Stream / SSE audit (requisito §4)

| `event` | Descrição |
|---------|-----------|
| `sse_event_emitted` | Daemon/publicação para stream |
| `sse_event_source` | `artifact_derived`, `internal_state`, `queue_mirror`, `client_synthetic` |
| `runtime_event_appended` | Escrita em `events.jsonl` |

Campos em `data`: `runtimeEventType`, `payloadSummary` (truncado), `sequence` monotónico por run ou global com key `(runId, seq)`.

---

## 5. Lista de artifacts auditáveis

### 5.1 Críticos (lista do utilizador alinhada ao código)

| Nome canónico | Notas |
|---------------|--------|
| `run-context.json` | Sim |
| `task-plan-initial.md` | Substituir mentalmente “task-plan.md” do requisito |
| `task-plan-refined.md` | Sim |
| `clarification-session.json` | Sim |
| `clarification-questions.json` | Sim |
| `clarification-answers.json` | Ver constante `ANSWERS_FILE` em runtime clarify |
| `approval-state.json` | Sim |
| `metadata.json`, `intake-manifest.json`, `intake-classification.json` | Recomendados como auditáveis |
| **`daemon/status.json`** | Sob `dataDir` |
| **`daemon/events.jsonl`** | Stream append-only |

Operações a registar: **expected**, **created**, **read**, **missing**, **validation_failed** (com mensagens da validação existente em `intake-manifest` / `validate-clarification-artifacts`).

---

## 6. Pontos de instrumentação por arquivo/função (mapeamento)

> Lista **planeada** — não implementação. Priorizar caminhos quentes do fluxo Mission Control.

| Área | Ficheiro | Função / momento |
|------|----------|------------------|
| HTTP entrada | `scripts/daemon/runtime-api.js` | Início de cada handler; resolver `repoRoot`; ler `X-Setup-Boss-Request-Id` |
| Create run | `scripts/daemon/lib/run-intake-api.js` | Antes/depois `executeIntake`, `executeClarification`; cada `emitRuntimeEvent`; substituir `catch {}` por log estruturado + mantém comportamento |
| Intake | `scripts/runtime/intake/intake-runtime.js` | Após `resolveProjectIaOutputDir`; cada `writeFileSync` principal; `validateIntakeArtifactsOrThrow` |
| Clarify | `scripts/runtime/clarification/clarification-runtime.js` | Ramos init vs `persistQuestionGeneration`; writes session/rc |
| Paths | `scripts/shared/ia-path-resolver.js` | Log `iaDir`, `source` preferred/legacy |
| Índice | `core/run-resolver.js` | `writeRunIndex`; `resolveOutputDir` sucesso/falha |
| Eventos | `scripts/daemon/lib/runtime-events.js` | Antes/append `events.jsonl`; falha de append |
| Fila | `scripts/daemon/lib/queue-store.js` | `enqueueJob`, claim worker |
| SSE | Onde o stream monta payload (runtime-api ou módulo dedicado) | Cada push ao cliente + origem |
| UI proxy | `frontend/app/api/runtime/[[...segments]]/route.ts` | Opcional: eco `requestId` |
| UI cliente | `frontend/hooks/use-create-run.ts`, `intake-audit-store.ts` | Marcar linhas como `component: "ui"` e `sse_event_source: "client_synthetic"` |

### 6.1 Erros silenciosos a mapear (requisito §6)

| Local | Padrão | Acção planeada |
|-------|--------|----------------|
| `run-intake-api.js` | `catch {}` em torno de `emitRuntimeEvent` | Log `warn` + `error.code` sem alterar fluxo |
| `runtime-events.js` | append falha → `null` | Log `error` com path absoluto |
| `queue-store.js` | `catch (_) {}` auxiliar | Classificar e logar só se operação era crítica |
| UI | `seedIntakeAuditForRun` | Documentar que **não** implica IO; trace cliente explícito |
| Evento sem artifact | `clarification_initialized` com `questionsCount: 0` | SSE audit deve permitir `internal_state` |

---

## 7. Comandos CLI sugeridos (requisito §7)

Implementação futura sob `scripts/cli` ou `setup-boss` existente:

| Comando | Função |
|---------|--------|
| `inspect-run <runId>` | Mostrar índice `.setup-boss/runs`, `outputDir`, `project_root`, últimos N trace lines |
| `inspect-job <jobId>` | Job na queue + metadata + link para runId |
| `inspect-artifacts <runId>` | Lista esperada vs existência + validação leve |
| `inspect-events <runId>` | Filtrar `events.jsonl` por `runId`/`jobId` |
| `inspect-pipeline <runId>` | Vista agregada: checkpoints do trace + gaps |
| `doctor-runtime-logs` | Permissões, paths, rotação, tamanhos, últimos erros de append |

Todos devem aceitar `--data-dir` para espelhar `SETUP_BOSS_DATA_DIR`.

---

## 8. Painel UI debug (requisito §8)

Secção colapsável “Runtime debug” (só em dev ou flag `NEXT_PUBLIC_SETUP_BOSS_DEBUG=1`):

- **IDs:** `requestId`, `runId`, `jobId`, `projectId`
- **Paths:** `dataDir` efectivo (se exposto por API segura), `outputDir` do run
- **Artifacts:** tabela esperado vs encontrado (via novo endpoint `GET /runs/:id/debug/artifacts` — planeamento futuro)
- **Últimos eventos:** merge com etiqueta **origem** (`daemon` vs `client_audit`)
- **Último erro:** última linha `level=error` do trace ou resposta API
- **Filtros:** `component`, `phase`

**Segurança:** não expor paths absolutos de outros tenants sem auth (mesmo local, preferir paths relativos ao projectRoot registado).

---

## 9. Retenção e tamanho (requisito §9)

| Política | Sugestão |
|----------|----------|
| Por run | Cap máx. ex.: **5–15 MiB** por `runtime-trace.jsonl`; truncar head com checkpoint |
| Rotação | Ao exceder: mover para `runtime-trace.1.jsonl` ou apagar linhas mais antigas preservando últimas 2k |
| Daemon `events.jsonl` | Já há lógica de prune — alinhar trace daemon ao mesmo `SETUP_BOSS_EVENTS_*` |
| Limpeza segura | `doctor-runtime-logs --prune-traces --older-than 30d` (dry-run por defeito) |

---

## 10. Plano de implementação em fases pequenas

### Fase A — Logger estruturado base

- Módulo único `runtime-trace` (Node): append JSONL, rotação simples, API `trace.info/warn/error({...})`.
- Escrever em `<outputDir>/runtime-trace.jsonl` quando `outputDir` conhecido; fallback em `dataDir/traces`.

### Fase B — Correlation IDs

- Gerar `requestId` no daemon ao receber POST relevantes; cabeçalho opcional do cliente.
- Propagar em `metadata` do job e em todas as linhas de trace.

### Fase C — Artifact audit

- Wrapper `auditArtifact(op, name, outputDir)` chamado nos pontos §6.
- Integração com validações existentes para `validation_failed`.

### Fase D — SSE / events audit

- Em `emitRuntimeEvent`: linha `runtime_event_appended` + `sse_event_source`.
- Classificar origem (interno vs derivado de leitura de disco quando aplicável).

### Fase E — Inspect CLI

- Implementar `inspect-run`, `inspect-artifacts`, `inspect-events` primeiro (maior ROI).

### Fase F — UI debug panel

- Endpoint agregador read-only + componente React minimal.

---

## 11. Critérios de sucesso

- Dado um `runId`, um operador consegue **num único comando** ver `outputDir` real e lista **created vs missing** para artifacts críticos.
- Dado um pedido falhado, existe **cadeia completa** `requestId` → trace → último erro sem “buracos” por `catch` vazio não logado.
- Cada evento na timeline pode ser classificado como **servidor com artifact**, **servidor estado interno**, ou **cliente sintético**.

---

## Referências internas

- Investigação prévia: `docs/runtime-investigation-ui-vs-real-pipeline.md`
- Resolução IA output: `scripts/shared/ia-path-resolver.js`
- Create run API: `scripts/daemon/lib/run-intake-api.js`
- Event store: `scripts/daemon/lib/runtime-events.js`
