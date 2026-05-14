# Fase 4.11.8 — Deterministic Review: estabilização e release readiness

Documento de **fecho oficial da Fase 4.11** (evidências determinísticas de review, risco, gates opcionais, diff e baseline). **Não** introduz novas regras de findings nem enforcement além do já implementado; consolida **artefactos**, **semântica operacional**, **observabilidade** e critérios para suportar **Fase 4.12+**.

**Ligações:** [`observability.md`](./observability.md) · [`validation-runtime-phase410-release-readiness.md`](./validation-runtime-phase410-release-readiness.md) (4.10, inputs do validation plan) · [`hybrid-runtime-release-readiness.md`](./hybrid-runtime-release-readiness.md) (4.9, ortogonal).

---

## 1. Estado da Fase 4.11

| Subfase | Entrega | Modo típico |
|---------|---------|-------------|
| 4.11 core | `deterministic-review.json` — structural + semantic light + validation/cache/graph findings | Observacional (`SETUP_BOSS_REVIEW_ENGINE` ≠ off) |
| 4.11.4 | `risk_summary` determinístico (score, nível, highlights, top findings) | Dentro do artefacto |
| 4.11.5 | Gate opcional por `risk_summary` (`gate` no JSON + CLI) | Default **off** |
| 4.11.6 | `review-diff.json` via diff entre duas runs (`compareDeterministicReviews`) | CLI / CI opcional |
| 4.11.7 | `review-baseline-summary.json` — regressão vs baseline em ficheiro | Default **off**; baseline ausente **não** aborta pipeline |
| **4.11.8** | **Docs, checklist, inspect, consistência de artefactos** | Encerramento |

**Critério geral:** fingerprints do `deterministic-review.json` **excluem** timestamps no payload canónico do hash de conteúdo; findings e agregados seguem **ordenação determinística**; pipeline principal permanece **não bloqueante** por defeito.

---

## 2. Artefactos — trio consistente (4.11)

| Ficheiro | `schema_contract` / papel | Quando existe |
|----------|---------------------------|---------------|
| **`deterministic-review.json`** | `deterministic-review/1` — fonte de verdade da corrida para evidência + risco + gate | Após `finalizeDeterministicReviewObservability` no `review.js` (best-effort) |
| **`review-diff.json`** | `deterministic-review-diff/1` — comparativo run A → run B | Só quando gravado explicitamente (`inspect-review --diff … --write-diff` na run destino B) |
| **`review-baseline-summary.json`** | `deterministic-review-baseline/1` — decisão baseline/regressão + diagnostics | Gravado quando corre baseline finalize no review (sempre que há doc actual; modo off incluído no sumário) |

**Relações:**

- **Diff** e **baseline** são **derivados** do mesmo modelo de comparação (`compareDeterministicReviews`); não alteram o documento principal nem os seus fingerprints.
- **`review-results.json`** pode referenciar o deterministic review via `extensions.deterministic_review_ref` (shadow).

---

## 3. Modelo de findings (resumo)

- **Tipos** incluem pelo menos: `cache`, `graph`, `validation`, `structural`, `semantic` (contrato em `deterministic-review-contract.js`).
- **`finding_id`** estável e derivado de conteúdo semântico relevante (hash curto) para diff por identidade.
- **Structural / semantic light:** regras dedicadas (`structural-deterministic-review-rules.js`, `semantic-light-deterministic-review-rules.js`); sem AST profunda nem política DSL nesta fase.

---

## 4. Modelo de risco (`risk_summary`)

- Versão do modelo em `risk_summary.score_model.version` (ex.: `deterministic-review-risk/1`).
- **`risk_score`** e **`overall_risk_level`** agregam contagens e severidades de forma **fixa e auditável** (ver `deterministic-review-risk.js`).
- **Highlights** e **top_risk_findings** são derivados determinísticos para inspect — não entram no fingerprint de conteúdo principal como objeto separado mutável além dos findings já canonizados.

---

## 5. Modelo de gate (4.11.5)

| Env | Valores | Efeito |
|-----|---------|--------|
| `SETUP_BOSS_REVIEW_GATE_MODE` | `off` (default), `advisory`, `enforce` | `off`: só observação; `advisory`: warn no stderr; `enforce`: `exitCode=1` se risco ≥ threshold |
| `SETUP_BOSS_REVIEW_GATE_THRESHOLD` | `low` \| `medium` \| `high` \| `critical` | Comparador ordinal ≥ (inválido → `high`) |

O campo **`gate`** no JSON reflecte a decisão à altura da gravação; **não** faz parte do payload fingerprintado do conteúdo (comportamento já estabelecido na 4.11.5).

---

## 6. Baseline / regressão (4.11.7)

| Env | Valores | Efeito |
|-----|---------|--------|
| `SETUP_BOSS_REVIEW_BASELINE_MODE` | `off` (default), `advisory`, `enforce` | Baseline ausente ou ilegível → **sem falha** (`cli_effect=none`) |
| `SETUP_BOSS_REVIEW_BASELINE_PATH` | caminho para `deterministic-review.json` de referência | Relativo ao cwd ou absoluto |
| `SETUP_BOSS_REVIEW_BASELINE_THRESHOLD` | `all` ou lista: `new_findings`, `risk_score_delta`, `gate_regression` | Tokens inválidos ou lista vazia → perfil **`all`** |

**Violações fixas (por token):**

- `new_findings`: contagem de findings novos vs baseline (`finding_id`).
- `risk_score_delta`: `risk_score` actual **>** baseline.
- `gate_regression`: decisão gate pior (ordinal: pass → warn → fail).

**Métricas informativas** no sumário: `validation_failures_delta`, `structural_errors_delta` (destaque em diagnostics; enforcement só via tokens acima).

---

## 7. `inspect-review` — uso

```text
npm run setup-boss -- inspect-review [runId | latest | índice] [--json] [--compact] [--rerun-invariants] [--include-transaction] [--full-deterministic]
npm run setup-boss -- inspect-review --diff <runA> <runB> [--json] [--write-diff] [--compact]
```

- **`--json`:** payload inclui `deterministic_review_bundle` (presença do trio 4.11), envs efectivas e sumários.
- **`--compact`:** saída humana mais curta (artefactos 4.11 numa linha, menos buckets `by_code` / amostras).
- **`--diff`:** compara duas runs; `--write-diff` grava `review-diff.json` na pasta da run **B**.

Diagnósticos agregados: `collectReviewDiagnostics` (`scripts/review-runtime/diagnostics/review-diagnostics.js`).

---

## 8. Exemplos CI (ilustrativos)

**Gate de risco em CI (após `npm run review …`):**

```bash
export SETUP_BOSS_REVIEW_GATE_MODE=enforce
export SETUP_BOSS_REVIEW_GATE_THRESHOLD=high
node scripts/review.js "$RUN_ID"
```

**Regressão vs baseline commitado:**

```bash
export SETUP_BOSS_REVIEW_BASELINE_MODE=enforce
export SETUP_BOSS_REVIEW_BASELINE_PATH="$CI_WORKSPACE/baselines/deterministic-review.json"
export SETUP_BOSS_REVIEW_BASELINE_THRESHOLD=all
node scripts/review.js "$RUN_ID"
```

**Diff entre duas corridas (artefacto na run mais recente):**

```bash
npm run setup-boss -- inspect-review --diff main-branch-run feature-branch-run --write-diff
```

---

## 9. Checklist operacional (release readiness)

- [ ] **Ordenação determinística:** findings e chaves agregadas ordenadas lexicalmente onde aplicável (`deterministic-review-runtime`, diff).
- [ ] **Replay safety:** fingerprint `deterministic_review_content_sha256` sem campos de relógio no payload canónico.
- [ ] **Non-blocking defaults:** `SETUP_BOSS_REVIEW_GATE_MODE` e `SETUP_BOSS_REVIEW_BASELINE_MODE` em **off** não alteram exit da pipeline.
- [ ] **Advisory vs enforce:** advisory só stderr; enforce só `exitCode=1` quando regra violada (gate 4.11.5 antes de baseline 4.11.7 no `finally` do review).
- [ ] **Baseline fallback:** path em falta / JSON inválido → sumário com `skipped_reason`, **sem** falha de processo.
- [ ] **Fingerprint stability:** alterações em `gate` ou extensões shadow não rebalanceiam o hash de conteúdo principal.
- [ ] **Inspect:** `inspect-review` expõe trio de artefactos, gate, baseline e diff CLI documentados.
- [ ] **Backward compatibility:** `SETUP_BOSS_REVIEW_ENGINE=off` mantém fluxo legado; artefactos 4.11 ausentes não quebram consumidores antigos.

---

## 10. Testes focados sugeridos

```bash
node --test scripts/review-runtime/deterministic-review-runtime.test.js
node --test scripts/review-runtime/deterministic-review-gate.test.js
node --test scripts/review-runtime/deterministic-review-diff.test.js
node --test scripts/review-runtime/deterministic-review-baseline.test.js
node --test scripts/review-runtime/review-runtime.test.js
```

(Regras structural/semantic específicas já cobertas indirectamente pelo runtime e pelo review engine quando activo.)

---

## 11. Limitações MVP (oficial)

- Sem **policy engine** genérico nem DSL de supressão.
- Sem **DAG** de review nem runtime distribuído.
- Sem **AST profunda** no ramo deterministic-review (structural/semantic light apenas).
- **Diff** e **baseline** não substituem decisão de produto em `review-output.json`; são evidência e gates opcionais.
- **`review-diff.json`** não é emitido automaticamente em cada run — opt-in via CLI.

---

## 12. Próximo passo após fecho da 4.11 (4.12+)

- Cruzamento **validation results ↔ deterministic findings** e overlays de impacto (continuação do roadmap pós-4.10).
- Inspecções adicionais na CLI quando `SETUP_BOSS_PLAN_MODE=shadow` e review engine activo.
- Evolução opt-in de thresholds baseline (continuar a evitar policy engine pesado).

---

## 13. Arquitetura (resumo textual)

```
review.js (finally)
  → finalizeDeterministicReviewObservability → deterministic-review.json
  → applyDeterministicReviewGateCliEffects (4.11.5)
  → finalizeBaselineRegressionForRun → review-baseline-summary.json
  → applyBaselineRegressionGateCliEffects (4.11.7)

inspect-review --diff → compareDeterministicReviews → opcional review-diff.json
inspect-review       → collectReviewDiagnostics (+ bundle trio 4.11)
```

**Declaração:** a **Fase 4.11** considera-se **estável**, **auditável**, **observável**, **replay-safe** nos termos acima e **pronta** para trabalho **4.12** em targeting/impacto sem obrigar novos artefactos neste trio.
