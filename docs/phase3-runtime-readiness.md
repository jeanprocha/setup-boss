# Setup Boss — Fase 3 (runtime): consolidacao operacional

Este documento descreve a arquitetura minima do **daemon local**, variáveis de ambiente relevantes, recuperacao e uma **matriz de cenarios** de referencia. Nao substitui o codigo-fonte como verdade absoluta.

## Arquitetura (runtime local)

| Componente | Papel |
|------------|--------|
| `scripts/daemon/setup-bossd.js` | Processo long-lived; recuperacao ao startup; workers via subprocess `scripts/run.js`. |
| `scripts/daemon/runtime-api.js` | HTTP em `127.0.0.1` (porta configurável): `/health`, `/status`, `/queue`, `/jobs`, `/events`, etc. |
| `.setup-boss/daemon/queue.json` | Fila persistente + mutex `queue.lock`; escritas atomicas por rename. |
| Worker pool (`worker-pool.js`) | Slots locais em memoria + fairness entre projectIds na seleção `pending`. |
| Scheduler (`scheduler-loop.js`) | Ativa jobs delayed (`availableAt`), opcional prune/guards por env. |
| Locks (`project-lock.js`) | Lock por projeto no disco; recuperacao de stale no startup do daemon. |
| `project-registry.js` | Registo/`deriveProjectId`/overview para CLI + API. |
| Event stream (`runtime-events.js`) | `events.jsonl` sob `.setup-boss/daemon/`. |

**Estado isolado:** quando `SETUP_BOSS_DATA_DIR` está definido, todo o diretório `.setup-boss/*` equivalente (daemon, locks, `projects.json`, …) usa esse prefixo em vez de `<repo>/.setup-boss`.

## Versões observáveis

- **`daemonVersion`**: protocolo interno daemon/status/API (`status.json` e campo espelhado em `/status`). Atual: **3.10**.
- **`runtimeVersion`**: versão semântica lida de `package.json` do repo setup-boss.
- **`featureFlags`** em `status.json`: flags derivadas do ambiente (ex.: diretorio isolado, modo noop E2E).

## Guião operacional (CLI)

Comandos usuais (ver também `docs/operator-guide.md`):

```bash
setup-boss daemon start [--foreground]
setup-boss daemon status
setup-boss daemon stop

setup-boss enqueue <task.md> <projeto> [--dry-run] [--yes]
setup-boss queue
setup-boss projects
setup-boss doctor [--json] [--fix-safe] [--runs-limit=N]
setup-boss watch …
```

## Variáveis de ambiente (configuração)

Lista minima (constantes no codigo podem ter outros defaults):

| Variável | Uso |
|---------|-----|
| `SETUP_BOSS_CLI_ROOT` | Raiz do repo setup-boss quando o CLI não corre dentro da pasta. |
| `SETUP_BOSS_DATA_DIR` | Prefixo alternativo ao estado `.setup-boss` (fila, locks, eventos). |
| `SETUP_BOSS_RUNTIME_API_PORT` | Porta da Runtime API (default 3210). |
| `SETUP_BOSS_RUNTIME_API_REQUEST_TIMEOUT_MS` | Timeout por pedido HTTP do servidor da API. |
| `SETUP_BOSS_MAX_WORKERS` | Slots globais do pool. |
| `SETUP_BOSS_MAX_WORKERS_PER_PROJECT` | Limite por `projectId`. |
| `SETUP_BOSS_SCHEDULER_POLL_MS` | Intervalo do scheduler. |
| `SETUP_BOSS_QUEUE_LOCK_*` | Mutex da fila (`queue-store.js`). |
| `SETUP_BOSS_STUCK_JOB_MS` / `SETUP_BOSS_STUCK_POLL_MS` | Deteção de jobs stuck. |

**Testes internos (sem LLM):**

| Variável | Uso |
|---------|-----|
| `SETUP_BOSS_E2E_WORKER_NOOP=1` | `scripts/run.js` termina sem pipeline (integração CI/E2E). |
| `SETUP_BOSS_E2E_WORKER_SLEEP_MS` | Espera cooperativa antes do noop (cancelamento). |
| `SETUP_BOSS_E2E_WORKER_EXIT_CODE` | Codigo de saida do noop (falha controlada + retry). |

Ver também `.env.example`.

## Recuperacao e doctor

- **Restart do daemon:** corre recuperação de locks stale, jobs `running`/`cancelling` órfãos (`recoverOrphanRunningJobs`), marcadores temporais (`emitTemporalRecoveryMarkers`).
- **Doctor `--fix-safe`:** remove locks stale/corruptos e apaga `pid` órfão se o processo não existe.

Guidance textual complementar: `docs/recovery-system.md`.

## Matriz de cenarios (minimo)

| Cenario | Coberto |
|---------|---------|
| daemon start/stop | Sim (E2E API health/status). |
| queue recovery | Sim (restart com job delayed pendente). |
| retry delayed | Sim (`POST /jobs/:id/retry` com `delayMs`). |
| recurring jobs | Sim (`POST /jobs` + `recurring.intervalMs`). |
| worker crash | Parcial (nao simula SIGKILL ao subprocess neste pacote de testes). |
| multi-project fairness | Sim (dois project roots + dois jobs). |
| cancel running | Sim (`POST …/cancel` + noop sleep). |
| stale lock | Sim (ficheiro `.lock` stale antes do startup). |
| watch/events | Parcial (`GET /events`; CLI watch não exercitado na mesma suite). |
| doctor | Sim (`doctor --json --fix-safe`). |

Suite: `scripts/tests/e2e/daemon-runtime.e2e.test.js` (invocada por `npm test`).

## Troubleshooting rapido

Ver `docs/troubleshooting.md` (secção daemon/runtime).
