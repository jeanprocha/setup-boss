# Access

**Scope:** OpenAI API access, model configuration, environment variables.

---

# Required Access

| Resource | How |
|---|---|
| OpenAI API Key | Set `OPENAI_API_KEY` in `.env` |

No other external services, databases, VPNs, or SSH targets are required for local operation.

---

# Minimal `.env` Configuration

```bash
OPENAI_API_KEY=<your-key>
OPENAI_MODEL=gpt-5.4-mini       # fallback model for all stages

# Per-stage models (override fallback)
ARCHITECT_MODEL=gpt-5.4-mini
EXECUTOR_MODEL=gpt-5.4-mini
REVIEW_MODEL=gpt-5.4-mini
CORRECTION_MODEL=gpt-5.4-mini
KNOWLEDGE_MODEL=gpt-5.4-mini
SCAN_MODEL=gpt-5.4-mini
ENSURE_IA_MODEL=gpt-5.4-mini
SEMANTIC_IA_MODEL=gpt-5.4-mini
```

Full variable reference: `.env.example`.

---

# Cost Tracking (Optional)

Set pricing variables to enable estimated cost per run:

```bash
GPT_5_4_MINI_INPUT_USD_PER_1M=<value>
GPT_5_4_MINI_OUTPUT_USD_PER_1M=<value>
```

Without these, `estimated_cost_usd` in `metadata.json` will be `null`.

---

# Daemon / Runtime API

The local HTTP API runs on `127.0.0.1` only:

```bash
SETUP_BOSS_RUNTIME_API_PORT=3210   # default
```

No external network access needed. Not a production service.

---

# Key Environment Variables (Operational)

| Variable | Default | Purpose |
|---|---|---|
| `MAX_CORRECTIONS` | 3 | Max correction cycles per run |
| `MAX_TOTAL_STEPS` | 20 | Hard step budget per run |
| `ENABLE_SCAN_CACHE` | true | Use cached scan when valid |
| `SETUP_BOSS_MAX_WORKERS` | 1 | Daemon worker concurrency |
| `SETUP_BOSS_DATA_DIR` | (default) | Daemon state directory override |
| `SETUP_BOSS_POLICY_PROFILE` | (none) | Governance profile: FAST, NORMAL, STRICT, ENTERPRISE |

---

# Unknown / REQUIRES HUMAN INPUT

- Deploy or distribution of setup-boss to other environments: not documented
- CI/CD integration: no pipeline detected in this repo
- Production or staging environments: unknown
