# Ciclo de vida do runtime

Este documento descreve **estados e transições** relevantes para auditoria operacional. A lista canónica de estados está em `RUNTIME_LIFECYCLE` ([lifecycle.js](../scripts/runtime/replay/lifecycle.js)).

## Estados principais (macro fluxo)

1. **PREFLIGHT → ARCHITECTING → EXECUTING → REVIEWING** — fluxo feliz até resultado do executor.
2. **CORRECTING** — quando o review rejeita e pede correção.
3. **DRY_RUN_* / AWAITING_APPLY** — modo dry-run: patches apenas overlay/virtual até decisão humana e apply físico.
4. **APPLYING → APPLIED** — aplicação determinística (apply-later).
5. **FAILED / RESUMABLE** — falhas ou pontos seguros para resume.

## Estados de recovery e política

- **RECOVERING / RECOVERED / RECOVERY_FAILED / RETRY_EXHAUSTED** — retries inteligentes do executor sem obrigar novo ciclo de correção macro (detalhes em [recovery-system.md](recovery-system.md)).
- **POLICY_BLOCKED / POLICY_OVERRIDE** — caminho travado ou explicitamente contornado por bypass auditável ([governance.md](governance.md)).
- **REPLAYING** — estado transitório durante `setup-boss replay` (antes de restaurar o `lifecycle_state` anterior nos metadados).

## Transições válidas (orientação)

O runtime não usa obrigatoriamente uma máquina de estados fechada em cada arquivo; a consistência é verificada por:

- `validateLifecycleConsistency` (`scripts/runtime/validation/lifecycle-consistency.js`)
- `buildTemporalInspectReport` (`scripts/runtime/replay/temporal-status.js`)

**Invariantes frequentes:**

- `pending_apply === true` com `mode: dry_run` exige review **approved** e artefactos de manifest antes do apply físico.
- `APPLIED` não deve coexistir com `pending_apply` verdadeiro.
- Checkpoints devem referenciar ficheiros existentes quando hashes são registados.

## Validation runtime (Fase 4.10)

Em modo **shadow** (`SETUP_BOSS_PLAN_MODE`), a corrida pode gravar **`validation-plan.json`** e artefactos associados após reconciliação/targeting. O executor de validação é **local e síncrono**; não altera estados de lifecycle macro além dos relatórios gravados. Ver **`docs/validation-runtime-phase410-release-readiness.md`**.

## Deterministic review observability (Fase 4.11)

Após **`review.js`**, pode existir **`deterministic-review.json`** (best-effort), **`review-baseline-summary.json`** (se baseline configurado ou modo gravado no sumário), e **`review-diff.json`** apenas quando a CLI o grava. O **`inspect-review`** agrega presença dos três (`deterministic_review_bundle` em `--json`) e resume gates env vs artefacto. Ver **`docs/deterministic-review-phase411-release-readiness.md`**.

## Replay consistency

Replay preserva o último `lifecycle_state` após terminar (ver replay-engine). Se `executor-changes.json` divergir do `patch-manifest.json`, considerar essa run **não aplicável** até nova corrida ou reconciliação manual.
