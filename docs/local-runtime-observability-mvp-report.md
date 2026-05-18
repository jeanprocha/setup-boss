# Relatório MVP — Observabilidade local do runtime

## 1. Resumo do implementado

- Logger JSONL **append-only** com schema estável (`timestamp`, `level`, `component`, `event`, IDs correlacionáveis, `outputDir`, `artifactPath`, `error`, etc.).
- Escrita **dupla**: `<outputDir>/runtime-trace.jsonl` quando a pasta existe, mais **`${SETUP_BOSS_DATA_DIR|repo/.setup-boss}/traces/runtime-trace.jsonl`** como fallback global (todas as linhas).
- Contexto **AsyncLocalStorage** iniciado em **`POST /runs`** (`runWithTraceContext`) para propagar `requestId` e merges ao longo do `createRunFromTask`.
- Header **`X-Setup-Boss-Request-Id`** na resposta (sucesso e erro) do `POST /runs`.
- Instrumentação em **`run-intake-api`**, **`intake-runtime`**, **`core/run-resolver`** (`writeRunIndex`), **`runtime-events`** (`sse_event_emitted` / falha de append).
- Módulo **`artifact-audit`**: eventos `artifact_*` para lista nominal de artefactos da corrida + `daemon/events.jsonl` e `daemon/status.json`.
- **`inspect-run <runId>`** na CLI para texto consolidado (paths, artefactos, últimas linhas, último erro).
- UI: eventos derivados de **`seedIntakeAuditForRun`** passam a levar **`metadata`** com `source: "client"`, `derivedFrom: "client-audit"`, `notArtifactBacked: true`.

## 2. Ficheiros criados

| Ficheiro | Função |
|----------|--------|
| `scripts/runtime-observability/runtime-trace.js` | Append JSONL, ALS, helpers |
| `scripts/runtime-observability/artifact-audit.js` | Auditoria de artefactos |
| `scripts/runtime-observability/runtime-trace.test.js` | Testes mínimos |
| `scripts/cli/commands/inspect-run.js` | Comando CLI |
| `docs/local-runtime-observability-usage.md` | Guia rápido |
| `docs/local-runtime-observability-mvp-report.md` | Este relatório |

## 3. Ficheiros alterados

| Ficheiro | Alteração |
|----------|-----------|
| `scripts/daemon/runtime-api.js` | ALS + traces `submit_*`; header request id |
| `scripts/daemon/lib/run-intake-api.js` | Checkpoints intake/clarify/queue; audits; traces em falhas |
| `scripts/daemon/lib/runtime-events.js` | Trace SSE / falha de escrita |
| `core/run-resolver.js` | Trace `resolveOutputDir` start; `run_index_written` |
| `scripts/runtime/intake/intake-runtime.js` | Trace IA/output dir pronto |
| `frontend/lib/api/runtime-types.ts` | `metadata?` opcional em `RuntimeEventDto` |
| `frontend/stores/intake-audit-store.ts` | Metadados client-audit |
| `scripts/cli/index.js` | Comando `inspect-run` + uso |
| `package.json` | Inclusão de `runtime-trace.test.js` na suite `npm test` |

## 4. Exemplo de linha JSONL real

Registo típico no fim de `createRunFromTask` (ficheiro global `.setup-boss/traces/runtime-trace.jsonl` após teste local):

```json
{"timestamp":"2026-05-15T17:55:59.669Z","level":"info","component":"run_intake_api","event":"run_created_checkpoint","requestId":null,"projectId":null,"jobId":"job_mp77xnvv_19fcb5d6fc2b","runId":"20260515-145559-runs-para-criar-atividades-reais-no-mission-control-com-inta","phase":"submit","step":null,"message":"createRunFromTask concluído com sucesso","dataDir":"C:\\Users\\pierr\\Documents\\automacao\\setup-boss\\.setup-boss","projectRoot":"C:\\Users\\pierr\\AppData\\Local\\Temp\\sb-intake-api-ok-be1unb\\demo-project","outputDir":"C:\\Users\\pierr\\AppData\\Local\\Temp\\sb-intake-api-ok-be1unb\\demo-project\\docs\\.IA\\outputs\\20260515-145559-runs-para-criar-atividades-reais-no-mission-control-com-inta","artifactPath":null,"durationMs":null,"source":"daemon","derivedFrom":"state","metadata":{"initialState":"clarification_required","clarificationRequired":true},"error":null}
```

**Nota:** `requestId` surge como `null` quando `createRunFromTask` é invocado **fora** do wrapper `runWithTraceContext` da Runtime API (ex.: testes unitários directos). Com **`POST /runs`** via daemon, o campo deve estar preenchido.

Exemplo de evento SSE no trace (`sse_event_emitted`):

```json
{"timestamp":"2026-05-15T17:55:59.662Z","level":"info","component":"runtime_events","event":"sse_event_emitted","phase":"events","step":"emit","message":"runtime event job_enqueued","source":"sse","derivedFrom":"unknown","metadata":{"eventName":"job_enqueued","payloadKeys":["taskArg","projectArg","availableAt","recurring","projectId","projectRoot"],"payloadSummary":"taskArg,projectArg,availableAt,recurring…"},"jobId":"job_mp77xnvv_19fcb5d6fc2b","runId":null,"projectId":"demo-local"}
```

## 5. Exemplo de saída `inspect-run`

```text
runId (argumento):     <runId>
outputDir (resolvido): <docs/.IA/outputs/<runId>>
runtime-trace (run):  ...\runtime-trace.jsonl (existe|ausente)
runtime-trace (fallback daemon DATA_DIR): ...\.setup-boss\traces\runtime-trace.jsonl

— Artefactos auditáveis (run output) —
presentes (n): ...
ausentes (m): ...

— Últimas 20 linhas de trace ...
```

Comando:

```bash
npm run setup-boss -- inspect-run <runId>
```

## 6. Validações executadas

- `node --test scripts/runtime-observability/runtime-trace.test.js scripts/daemon/lib/run-intake-api.test.js scripts/daemon/lib/runtime-events.test.js core/run-resolver.test.js` — **passou** (13 testes no agregado da execução).

### Validação manual solicitada (checklist — não automatizada aqui)

1. Definir `SETUP_BOSS_DATA_DIR` e iniciar o daemon.
2. Iniciar o frontend e submeter tarefa pelo Mission Control.
3. Confirmar `.setup-boss/traces/runtime-trace.jsonl` (ou equivalente sob `DATA_DIR`) contém linhas `submit_received` / checkpoints com **`requestId`** preenchido.
4. Confirmar `<outputDir>/runtime-trace.jsonl` após corridas novas (quando o directório existe no momento do append).
5. Executar `inspect-run <runId>` e validar artefactos **presentes/ausentes** sem falha fatal.
6. Na timeline UI, inspeccionar eventos `intake_*` com **`metadata.notArtifactBacked`** quando aplicável.

## 7. Limitações restantes

- **`derivedFrom` em `sse_event_emitted`** está frequentemente como **`unknown`** — classificar `artifact` vs `state` exigiria contrato mais rico por tipo de evento.
- **`requestId` ausente** em chamadas a `createRunFromTask` sem passar pela Runtime API (testes, scripts futuros).
- **`inspect-run`** usa fallback heurístico (`JSON.stringify(o).includes(runId)`) se o filtro estrito não encontrar linhas — pode colidir em IDs muito curtos ou substring ambígua.
- **Rotação / limites de tamanho** do `runtime-trace.jsonl` global não implementados (previstos no plano).
- **Painel UI de debug** não implementado (fase posterior).

## 8. Próximos passos recomendados

1. Propagar **`X-Setup-Boss-Request-Id`** no proxy Next → daemon (opcional) para correlacionar no cliente.
2. Enriquecer **`derivedFrom`** por tipo de evento SSE.
3. Implementar rotação simples do ficheiro global `traces/runtime-trace.jsonl`.
4. Endpoint **`GET /runs/:id/debug/trace`** (últimas N linhas) para alimentar painel debug.
5. Opcional: eco **`requestId`** em `201 data` se o contrato da UI evoluir.
