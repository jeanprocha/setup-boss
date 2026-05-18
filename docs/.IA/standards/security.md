# Security

**Scope:** PATCH execution security, `allowed_files` enforcement, sensitive data rules.

---

# PATCH Execution Security

The executor writes to the target project ONLY for files listed in `allowed_files` (defined by the architect in `run-context.json`).

Hard restrictions enforced in `scripts/executor.js`:

- No paths with `..` (directory traversal)
- No writes to `.git/`
- No writes to `node_modules/`
- Target file must exist before PATCH is applied
- Each PATCH requires a `search` string that matches exactly once in the file

Violation → patch fails with explicit error; no silent skips.

---

# `allowed_files` Contract

The architect determines `allowed_files` during planning.

The executor validates every write against this list.

AI agents must NOT attempt to write outside `allowed_files`.

---

# Sensitive Data Rules

Never store in `.IA`, agents, context, or any repo file:

- `OPENAI_API_KEY` values
- Tokens, passwords, secrets, private keys
- Production credentials
- Internal IPs, SSH hosts, deploy targets

Use placeholders when documenting operational workflows:

```bash
ssh <DEPLOY_USER>@<DEPLOY_SERVER>
```

---

# Governance Gate

`evaluateApplyGovernance` in `scripts/runtime/governance/` checks paths against a protected list before physical apply.

Result appended to `governance-decisions.json` under `physical_apply_audit`.

---

# Force Policy Bypass

`--force-policy-bypass` / `SETUP_BOSS_FORCE_POLICY_BYPASS=1` bypasses governance gates.

This is audited. Use only for deliberate debugging. Never in formal pipelines.

---

# Dry-Run Mode

`--dry-run` prevents any filesystem writes.

Required when `STRICT` profile + high-risk task signals + no bypass. See `docs/governance.md`.

---

# Environment Variables

Never commit `.env` to git. Only `.env.example` (with empty values) is committed.
