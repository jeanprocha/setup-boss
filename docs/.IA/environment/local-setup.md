# Local Setup

**Platform:** Windows (PowerShell primary); Linux/macOS compatible.

---

# Prerequisites

- Node.js (LTS recommended)
- npm
- OpenAI API key (see `access.md`)

---

# Installation

```powershell
git clone <repo>
cd setup-boss
npm install
cp .env.example .env
# Edit .env: set OPENAI_API_KEY and model variables
```

---

# Running The Pipeline

```powershell
# Full pipeline (recommended)
npm run setup-boss -- run tasks/task.md ../target-project

# With dry-run (no filesystem writes)
npm run setup-boss -- run tasks/task.md ../target-project --dry-run

# Individual stages
npm run scan ../target-project
npm run architect tasks/task.md ../target-project
npm run executor <runId>
npm run review <runId>
npm run correction <runId>
npm run knowledge <runId>
```

---

# CLI Commands

```powershell
npm run setup-boss -- list --limit=20       # list recent runs
npm run setup-boss -- inspect latest        # lifecycle + drift of last run
npm run setup-boss -- inspect <runId>
npm run setup-boss -- doctor                # smoke checks
npm run setup-boss -- replay <runId> --from=executor
npm run setup-boss -- resume <runId>
npm run setup-boss -- apply <runId> --confirm
```

---

# Daemon

```powershell
npm run setup-boss -- daemon start
npm run setup-boss -- daemon status
npm run setup-boss -- daemon stop
```

See `runbooks/daemon.md` for full lifecycle.

---

# Forcing Fresh Scan

By default, scan is cached. To force a real scan:

```powershell
$env:FORCE_SCAN='1'
npm run setup-boss -- run tasks/task.md ../target-project
```

Or via node directly:

```powershell
node scripts/run.js tasks/task.md ../target-project --force-scan
```

---

# Windows / PowerShell Notes

- Use `$env:VAR='value'` to set env vars in PowerShell (not `export VAR=value`).
- `npm run` may not forward `--` flags in all PowerShell versions; prefer `node scripts/run.js` directly when needed.
- Terminal encoding: set UTF-8 if seeing garbled output — see `docs/windows-terminal-utf8.md`.

---

# Validate Run Artifacts

```powershell
npm run validate:artifacts -- <runId>
# or
node scripts/validate-run-artifacts.js <runId>
```

---

# Tests

```powershell
npm test              # governance + runtime unit tests
npm run test:e2e      # E2E deterministic suite
npm run test:continuity
```
