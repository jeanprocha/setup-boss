# Daemon Runbook

**Component:** `scripts/daemon/setup-bossd.js`  
**Purpose:** Persistent background process managing the worker pool, scheduler, queue, and local HTTP API.

---

# Lifecycle

## Start

```powershell
npm run setup-boss -- daemon start
```

The daemon:
1. Writes PID to PID file (`pid-file.js`)
2. Starts local HTTP API on `SETUP_BOSS_RUNTIME_API_PORT` (default `3210`, `127.0.0.1` only)
3. Starts worker pool (`SETUP_BOSS_MAX_WORKERS` workers, default 1)
4. Starts scheduler loop (poll: `SETUP_BOSS_SCHEDULER_POLL_MS`, default 1500ms)
5. Loads queue from `queue-store.js`

## Status

```powershell
npm run setup-boss -- daemon status
npm run setup-boss -- doctor
```

## Stop

```powershell
npm run setup-boss -- daemon stop
```

---

# Configuration

| Variable | Default | Purpose |
|---|---|---|
| `SETUP_BOSS_RUNTIME_API_PORT` | `3210` | Local HTTP API port |
| `SETUP_BOSS_RUNTIME_API_REQUEST_TIMEOUT_MS` | `30000` | Request timeout (ms) |
| `SETUP_BOSS_MAX_WORKERS` | `1` | Total concurrent workers |
| `SETUP_BOSS_MAX_WORKERS_PER_PROJECT` | `1` | Concurrent workers per project |
| `SETUP_BOSS_SCHEDULER_POLL_MS` | `1500` | Scheduler poll interval (ms) |
| `SETUP_BOSS_DATA_DIR` | (default `.setup-boss/`) | Daemon state directory |

---

# State Directory

The daemon persists queue, registry, events, and PID in `SETUP_BOSS_DATA_DIR` (or default `.setup-boss/`).

To use an isolated state directory (e.g., for testing):

```powershell
$env:SETUP_BOSS_DATA_DIR='C:\path\to\isolated-state'
npm run setup-boss -- daemon start
```

---

# Project Lock

Each project has a lock to prevent concurrent workers on the same project (`project-lock.js`).

`SETUP_BOSS_MAX_WORKERS_PER_PROJECT` limits same-project concurrency independently of the total pool.

---

# Diagnostics

```powershell
npm run setup-boss -- doctor --json
npm run setup-boss -- doctor --fix-safe
```

Checks: policy smoke, queue integrity, event consistency, worker state.

---

# Abnormal Termination

If daemon terminates abruptly:

1. PID file may remain — daemon will not start again until stale PID is cleared.
2. Run `npm run setup-boss -- doctor` to diagnose.
3. Clear stale PID manually if needed, then restart.
4. Check queue state — in-flight jobs may need replay (`runbooks/recovery.md`).

---

# Runtime API

Local HTTP API (`127.0.0.1:<port>`):

- Not a production service; for internal daemon coordination only
- Used by CLI commands to communicate with the running daemon
- Source: `scripts/daemon/runtime-api.js`
