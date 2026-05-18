# Architectural Decisions

---

## 1. PATCH Strategy — Unique Search Required

**Decision:** The executor applies changes via `search`/`replace` PATCH operations. The `search` string must match exactly once in the target file.

**Rationale:** Prevents ambiguous edits. If the search string matches multiple times, the operation fails explicitly rather than applying unpredictable changes.

**Constraint:** Tasks that require rewriting entire files cannot use the current PATCH schema. Workaround: use a single large `search` covering the entire section to replace.

**Impact:** Architect must ensure `allowed_files` and PATCH targets are scoped to files where unique matches are expected.

**Source:** `scripts/executor.js`, `agents/executor.md`

---

## 2. `run-context.json` As Compact Source Of Truth

**Decision:** The architect writes `run-context.json` after planning. This compact file (task summary, `allowed_files`, acceptance criteria, review focus) is consumed by executor, review, correction, and knowledge — replacing the need to inject full scan/architect outputs in subsequent stages.

**Rationale:** Reduces prompt size and token cost for later pipeline stages. Keeps per-stage context focused.

**Constraint:** If `run-context.json` is missing or invalid, subsequent stages must fall back to full context injection — increasing token cost.

**Source:** `scripts/architect.js`, `docs/README.md`

---

## 3. Shadow Mode Per Runtime Module

**Decision:** All optional runtime modules (validation, risk, review, correction, transaction, hybrid executor, execution graph) default to `off`. They can be enabled in `shadow` mode (produces artifacts, does not alter pipeline) before `active`/`enforce` modes.

**Rationale:** Allows incremental rollout of complex runtimes without pipeline risk. Shadow mode provides observability data without operational impact.

**Constraint:** Shadow mode artifacts exist even when the module does not affect behavior. Teams must understand that shadow JSON files are not operational signals — they are advisory.

**Source:** `.env.example` feature flags, `docs/hybrid-runtime-lifecycle.md`

---

## 4. Governance Policy Profiles

**Decision:** Four governance profiles — `FAST`, `NORMAL`, `STRICT`, `ENTERPRISE` — control enforcement levels. `STRICT` mandates dry-run for high-risk tasks. `ENTERPRISE` enforces maximum checks.

**Rationale:** Different operational contexts (development vs production-adjacent) require different governance levels. A single hardcoded policy is too rigid.

**Constraint:** `--force-policy-bypass` overrides governance gates and is always audited in `governance-decisions.json`. Should not be used in formal pipelines.

**Source:** `scripts/runtime/governance/profiles.js`, `docs/governance.md`

---

## 5. Hybrid Executor — Textual Fallback Guaranteed

**Decision:** The hybrid executor (AST-based structural execution, Phase 4.9) always falls back to the textual executor if the structural path fails, confidence is below threshold, or the structural result diverges from the textual patch.

**Rationale:** Maintains pipeline reliability. AST execution is an optimization, not a requirement. Fallback ensures the run always completes using the proven textual path.

**Constraint:** MVP covers only `ImportDeclaration`, `VariableDeclaration`, `FunctionDeclaration`. Multi-file transactions and global recast are not supported in the structural path.

**Source:** `scripts/hybrid-executor/`, `.env.example` hybrid executor flags, `docs/hybrid-runtime-lifecycle.md`

---

## 6. Allowed Files Enforcement At Execution Time

**Decision:** The executor enforces `allowed_files` at write time, not only at planning time. Writes outside `allowed_files`, to `.git/`, or `node_modules/` fail hard.

**Rationale:** Defense in depth. The architect defines scope; the executor enforces it independently. An LLM-generated PATCH targeting an unauthorized path is rejected explicitly.

**Source:** `scripts/executor.js`
