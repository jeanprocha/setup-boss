# Runtime debug log (`logs/runtime.log`)

Camada **temporária e pragmática** para desenvolvimento local/MVP: ficheiro único, legível por humanos, append-only, ao lado do repo. **Não substitui** traces JSONL (`.setup-boss/traces/`), nem `events.jsonl` — complementa com narrativa rápida para VS Code e `Get-Content -Wait`.

---

## 1. Resumo

- **Logger**: `scripts/runtime/logger.js` (singleton, `fs.appendFileSync`, sem deps novas).
- **Destinos**:
  - `logs/runtime.log` — todos os níveis escritos.
  - `logs/runtime-error.log` — duplica apenas linhas **ERROR** (bonus simples).
- **Integração principal**: cada `emitRuntimeEvent` bem persistido gera também uma entrada `runtime.emit.<tipo>` (com filtros de ruído mínimos).
- **HTTP/SSE**: pedidos (DEBUG opcional), `POST /runs`, SSE connect/disconnect, erros não tratados no handler.
- **Resolver**: `writeRunIndex` e resoluções bem-sucedidas / falhas de `resolveOutputDir`.
- **Intake**: linha `runtime.run_intake.dispatch_meta` com `uiState`, `questionsCount`, `outputDir`, etc.

`logs/` já está no `.gitignore`.

---

## 2. Arquivos criados

| Ficheiro | Função |
|----------|--------|
| `scripts/runtime/logger.js` | API `info`, `warn`, `error`, `debug`, `logEmit` |
| `docs/runtime-debug-log-report.md` | Este relatório |

---

## 3. Arquivos alterados

| Ficheiro | Alteração |
|----------|-----------|
| `scripts/daemon/lib/runtime-events.js` | `logEmit` após append OK; `runtime.emit.persist_failed` no catch |
| `scripts/daemon/runtime-api.js` | Logs HTTP/SSE/`POST /runs` |
| `scripts/daemon/lib/run-intake-api.js` | `runtime.run_intake.dispatch_meta` |
| `core/run-resolver.js` | `artifact.write` no índice de corrida; `runtime.output_dir_resolved` / `_failed` |

---

## 4. Estrutura do logger

Formato obrigatório da primeira linha:

```text
[YYYY-MM-DD HH:mm:ss.SSS] LEVEL event_name
```

Linhas seguintes: `chave=valor` (objetos aninhados viram `pai.filho=valor`). Blocos ERROR incluem `error=…` e stack indentada.

**API**

```javascript
const logger = require("./scripts/runtime/logger");

logger.info("runtime exemplo.evento", { runId: "...", foo: 1 });
logger.warn("runtime exemplo.aviso", { reason: "..." });
logger.error("runtime exemplo.falha", err, { runId: "..." });
logger.debug("runtime http.trace", { path: "/runs" }); // só se SETUP_BOSS_RUNTIME_DEBUG_LOG=1
```

**Eco de eventos** (`logEmit`): nomes `runtime.emit.<type>` com nivelização simples (falhas → ERROR; stuck/cancel → WARN; `clarification_initialized` + `questionsCount=0` → WARN + mensagem fixa).

**Ruído suprimido** em `logEmit`: `scheduler_tick`, `worker_busy`, `worker_idle`.

---

## 5. Exemplos reais de logs

Após `POST /runs` e fluxo normal:

```text
[2026-05-15 15:12:01.145] INFO runtime.api.submit_received
projectId=...
requestId=...
skipLl=true
taskChars=120

[2026-05-15 15:12:01.146] INFO runtime.run_intake.dispatch_meta
classification=needs_context
initialState=clarification_required
outputDir=C:\...\outputs\...
phase2Status=clarification_initialized
questionsCount=0
runId=...
uiPhase=clarify
uiState=waiting_clarification_questions

[2026-05-15 15:12:01.147] INFO runtime.emit.job_enqueued
eventId=evt_...
jobId=...

[2026-05-15 15:12:01.148] WARN runtime.emit.clarification_initialized
message=Clarification initialized without generated questions
questionsCount=0
runId=...
```

Resolver:

```text
[2026-05-15 15:12:02.010] INFO runtime.output_dir_resolved
outputDir=C:\...\outputs\<runId>
query=<runId>
via=run_index
```

Artifact:

```text
[2026-05-15 15:12:02.020] INFO artifact.write
kind=run_index
outputDir=C:\...\outputs\<runId>
path=C:\...\setup-boss\.setup-boss\runs\<runId>.json
...
```

---

## 6. Acompanhar logs em tempo real

**PowerShell** (repo root):

```powershell
Get-Content .\logs\runtime.log -Wait -Tail 80
```

**Cmd / Git Bash**: `tail -f logs/runtime.log` (se disponível).

**Variável opcional** (pedidos HTTP no handler sem poluir o ficheiro por defeito):

```powershell
$env:SETUP_BOSS_RUNTIME_DEBUG_LOG = "1"
```

---

## 7. Limitações atuais

- Escrita **síncrona** — pode acrescentar latência sob carga extrema (aceite para MVP local).
- **Sem rotação** automática — o ficheiro cresce; apagar manualmente ou truncar quando necessário.
- Nem todos os `writeFileSync` do projeto foram instrumentados; foco nos caminhos críticos + eco dos eventos runtime.
- **Auditoria client-side** da UI não aparece aqui (continua nos mecanismos da própria UI / metadata).

---

## 8. Próximos passos (observabilidade futura)

- Manter JSONL/traces como fonte estruturada para pipelines e CI.
- Se necessário, migrar este formato para um shipper ou alinhar campos com o schema JSONL existente.
- Rotação por tamanho ou `SETUP_BOSS_LOG_MAX_MB` pode vir numa fase posterior sem mudar a API do logger.
