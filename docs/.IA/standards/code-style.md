# Code Style

**Stack:** Node.js (pure scripts, no web framework, no transpiler)

---

# Module Pattern

- CommonJS only (`require` / `module.exports`)
- No ESM (`import`/`export`) unless explicitly introduced
- No TypeScript; plain `.js` files
- No build step; scripts run directly with `node`

---

# File Organization

```txt
scripts/           ← entry points and runtime modules
  <runtime>/       ← each runtime module in its own folder
    index.js       ← public surface
    constants.js   ← module constants
    feature-flags.js ← env flag resolution
    *.test.js      ← tests co-located with source
core/              ← shared utilities (llm-client, llm-usage, etc.)
agents/            ← LLM prompt templates (.md)
context/           ← global context read by scan
```

---

# Naming

- Files: `kebab-case.js`
- Functions: `camelCase`
- Constants: `UPPER_SNAKE_CASE`
- Test files: `<module-name>.test.js` co-located in the same folder as the module

---

# Feature Flags

Each optional runtime module owns a `feature-flags.js` that reads env vars and exports booleans:

```js
const ENABLED = process.env.SETUP_BOSS_X === 'shadow' || process.env.SETUP_BOSS_X === 'active';
```

Modes: `off` (default), `shadow`, `telemetry`, `active`, `enforce` — varies per module.

---

# Tests

- Framework: Node.js built-in `node:test`
- Run: `node --test <test-files>`
- E2E suite: `scripts/tests/e2e/e2e-runner.js`
- Tests are co-located with source files

---

# Telemetry Pattern

Each major runtime module has a `telemetry.js` file that writes JSON artifacts to the run output directory.

Artifacts are always written under the active semantic IA directory: `<target>/docs/.IA/outputs/<run-id>/` (legacy: `<target>/.IA/outputs/<run-id>/`) — never to setup-boss's own tree.

---

# Error Handling

- Prefer explicit errors with descriptive messages
- Recovery errors go through `scripts/runtime/recovery/failure-classifier.js`
- Operational errors write to `recovery-log.json` when recovery is active

---

# No Framework

No Express, no Fastify, no ORM, no DI container.

The local HTTP API (`scripts/daemon/runtime-api.js`) uses Node's built-in `http` module.
