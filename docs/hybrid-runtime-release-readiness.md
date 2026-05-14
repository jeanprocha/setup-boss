# Fase 4.9.8 — Validação final / Release readiness (Hybrid Executor)

Documento de encerramento da **Fase 4.9** do runtime híbrido (structural-first + fallback textual). Não introduz capacidades novas; consolida **estabilidade**, **previsibilidade operacional** e **critérios de rollout**.

**Ligações:** [`hybrid-runtime-lifecycle.md`](./hybrid-runtime-lifecycle.md) (fases, flags, fluxos) · [`observability.md`](./observability.md) (artefactos da corrida e telemetria LLM) · [`deterministic-review-phase411-release-readiness.md`](./deterministic-review-phase411-release-readiness.md) (4.11 — review determinístico; ortogonal ao hybrid).

---

## 1. Status da Fase 4.9

| Âmbito | Estado |
|--------|--------|
| Hybrid executor + AST read-only | Estável sob flags OFF por defeito |
| Planning shadow (4.9.2) | Estável (shadow) |
| Transform shadow (4.9.3) | Estável (shadow) |
| Hybrid execution apply (4.9.4) | Estável com fallback textual garantido |
| Apply estrutural controlado (4.9.5) | Opt-in; depende do gate 4.9.4 + `STRUCTURAL_APPLY_ENABLED` |
| Governança estrutural (4.9.6) | Estável com relatórios; opt-in |
| Replay foundation / stale / fingerprints (4.9.6.1) | Estável em relatório (sem replay apply real) |
| Replay shadow + continuity (4.9.7) | **Shadow-only** (simulação, artefactos) |
| Consolidação / observabilidade (4.9.7.1) | Estável com `HYBRID_RUNTIME_OBSERVABILITY_ENABLED` |
| **Release readiness (4.9.8)** | Matriz de flags + suite de consistência em `scripts/hybrid-executor/runtime/runtime-release-validator.js` |

**Critério geral:** a stack pode ser considerada **estável para uso controlado** quando as flags são aplicadas de forma explícita, os artefactos obrigatórios por modo existem e o validador de release (`runtime-release-validator.js`) ou o relatório embutido em `hybrid-runtime-summary.json → artifact_validation` não reportam erros.

---

## 2. Funcionalidades estáveis (produção pilot)

- Structural-first com **fallback textual automático** quando o gate falha ou o MVP não cobre o nó.
- Escrita de **`hybrid-execution-results.json`** e **`structural-fallback-report.json`** quando o pipeline chama `writeHybridExecutionArtifacts`.
- Contratos de schema (`runtime-lifecycle.js`) e validação de documentos cruzados (`runtime-artifact-validator.js`).
- Governança **declarativa em JSON** (sem workflows externos de aprovação).

---

## 3. Funcionalidades apenas shadow / relatório

- **Replay estrutural aplicado ao sistema de ficheiros:** não faz parte do MVP (explícito no âmbito do projeto).
- **`STRUCTURAL_REPLAY_SHADOW_ENABLED`:** simulação + classificação + continuidade — sempre `shadow_only: true` nos payloads dedicados.
- **Semantic propagation / transações multi-ficheiro globais / approvals externos:** fora de âmbito da Fase 4.9.

---

## 4. Limitações MVP (importantes para rollout)

- Superfície structural limitada (ex.: certos nós / patch classes seguem fallback textual).
- **Multi-ficheiro:** governança pode elevar risco; não há transação global entre ficheiros.
- Replay **apply real** não está incluído na Fase 4.9.
- Observabilidade consolidada só aparece com flag dedicada (ver secção 6).

---

## 5. Matriz de cenários (combinações)

O módulo `buildRuntimeReleaseMatrix()` cobre, entre outros:

| Cenário | Objectivo |
|---------|-----------|
| Todas as flags OFF | Baseline seguro; sem pipeline híbrido ativo |
| Hybrid ON sem governança | Structural-first + fallback mínimo |
| Governança ON | Relatórios de risco/blockers alinhados aos patches |
| Replay shadow ON | Trio `structural-replay-*.json` |
| Observabilidade ON | `hybrid-runtime-summary.json` + validação de artefactos embutida |
| Mixed runtime | Combinação gov + foundation + shadow + observabilidade |
| Apply controlado ON | `STRUCTURAL_APPLY_ENABLED` sobre gate 4.9.4 |
| Shadow transforms ON | Stack 4.9.3 sem hybrid execution apply |

Validação automatizada: `node scripts/hybrid-executor/runtime/runtime-release-validator.js` (exit `0` quando matriz + ordenação do lifecycle passam).

---

## 6. Flags recomendadas (rollout gradual)

1. **Pilot read-only / diagnóstico:** `HYBRID_EXECUTOR_ENABLED`, `STRUCTURAL_AST_READONLY_ENABLED`, opcionalmente `STRUCTURAL_PLANNING_ENABLED`.
2. **Hybrid apply controlado:** acrescentar `STRUCTURAL_PLANNING_ENABLED`, `HYBRID_EXECUTION_ENABLED`; afinar `STRUCTURAL_EXECUTION_MIN_CONFIDENCE`.
3. **Governança:** `STRUCTURAL_GOVERNANCE_ENABLED` + revisão de `STRUCTURAL_GOVERNANCE_LOW_CONFIDENCE_MODE` (`warning` vs `block`).
4. **Replay / stale (relatório):** `STRUCTURAL_REPLAY_FOUNDATION_ENABLED`, `STRUCTURAL_IDEMPOTENCY_ENABLED` conforme necessidade de relatórios.
5. **Replay shadow:** `STRUCTURAL_REPLAY_SHADOW_ENABLED` apenas em ambientes onde o custo de I/O e ruído de relatório são aceitáveis.
6. **Observabilidade:** `HYBRID_RUNTIME_OBSERVABILITY_ENABLED` para fecho operacional e validação automática do bundle no summary.

Definições exactas dos gates: `scripts/hybrid-executor/feature-flags.js`.

---

## 7. Rollout recomendado

1. Ambiente **feature branch / staging** com flags do passo 1–2.
2. Monitorizar histogramas de fallback (`fallback_reason_histogram`, `fallback_trigger_histogram`).
3. Activar governança antes de expandir para repositórios maiores ou mudanças sensíveis (imports/exports, deletes).
4. Só depois activar replay shadow + observabilidade para auditorias per-run.

---

## 8. Validação E2E e artefactos

- **Consistência fallback:** `validateFallbackConsistency` — contagens e histogramas entre `hybrid-execution-results.json` e `structural-fallback-report.json`.
- **Governança:** `validateGovernanceConsistency` — cardinalidade `per_patch` alinhada ao hybrid.
- **Replay shadow:** `validateReplayShadowConsistency` — trio presente, `shadow_only`, contagens de `per_patch`.
- **Stale:** `validateStaleReplayConsistency` — findings `stale_selector` refletidos na classificação.
- **Suite global:** `runRuntimeReleaseValidation({ bundle })` — inclui `runArtifactValidationSuite` + ordenação do lifecycle.

Cenários sintéticos úteis para drills: `buildSyntheticFallbackForcedRows`, `buildSyntheticCorruptionRows`, `buildSyntheticStaleReplayRows`.

---

## 9. Troubleshooting (curto)

| Sintoma | Verificar |
|---------|-----------|
| Sem telemetria híbrida | `HYBRID_EXECUTOR_ENABLED` e gate master (`isHybridExecutionApplyActive`) |
| Sempre textual | Threshold `STRUCTURAL_EXECUTION_MIN_CONFIDENCE`; motivos em `fallback_reason` |
| Divergência hybrid vs fallback report | Campos `patch_steps` / histogramas; re-execução com observabilidade ON |
| Governança ausente | `STRUCTURAL_GOVERNANCE_ENABLED` |
| Replay shadow incompleto | `STRUCTURAL_REPLAY_SHADOW_ENABLED`; ficheiros trio |
| `artifact_validation.ok: false` em summary | Executar `runRuntimeReleaseValidation` sobre o bundle carregado |

---

## 10. Rollback operacional

1. Definir **`HYBRID_EXECUTOR_ENABLED=0`** (ou remover da env) — desliga o ramo híbrido no executor.
2. Opcional: desligar apenas apply mantendo diagnóstico — **`HYBRID_EXECUTION_ENABLED=0`** sem desligar AST-readonly se quiser preservar scans.
3. Reverter alterações de código ou patches aplicados pelos mecanismos normais do projeto (Git); artefactos JSON podem ser ignorados ou arquivados conforme política de CI.

---

## 11. Checklist operacional (antes de declarar “go”)

- [ ] Matriz de flags validada (`runtime-release-validator.js` exit 0).
- [ ] Run piloto com **todas OFF** e run com **mixed runtime** conforme ambiente alvo.
- [ ] `hybrid-execution-results` ↔ `structural-fallback-report` sem divergências de contagens.
- [ ] Se governança ON: `structural-governance-report.json` coerente com número de patches.
- [ ] Se replay shadow ON: trio JSON com `shadow_only: true`.
- [ ] Se observabilidade ON: `hybrid-runtime-summary.json` presente e `artifact_validation.ok === true`.
- [ ] Plano de rollback comunicado (env + Git).

---

## 12. Referências de código

- Validador de release: `scripts/hybrid-executor/runtime/runtime-release-validator.js`
- Contratos / lifecycle: `scripts/hybrid-executor/runtime/runtime-lifecycle.js`
- Validação de artefactos: `scripts/hybrid-executor/runtime/runtime-artifact-validator.js`
- Testes 4.9.8: `scripts/hybrid-executor/runtime/runtime-release-validator.test.js`

### Referências documentais (índice / roadmap)

- [`docs/README.md`](./README.md) — índice principal e secção Hybrid runtime
- [`docs/setup-boss-evolution.md`](./setup-boss-evolution.md) — Fase 4.9 no histórico do projecto
- [`docs/setup-boss-roadmap.md`](./setup-boss-roadmap.md) — próximos passos após o marco 4.9
- [`docs/validation-runtime-phase410-release-readiness.md`](./validation-runtime-phase410-release-readiness.md) — **Validation runtime (Fase 4.10, ortogonal ao hybrid 4.9)**
