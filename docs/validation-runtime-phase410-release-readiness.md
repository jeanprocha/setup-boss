# Fase 4.10.8 — Validation Runtime: estabilização e release readiness

Documento de **fecho oficial da Fase 4.10** (validation plan, executor local sync, cache, dependency graph MVP, graph-aware planning em metadados). Não adiciona runtimes novos; consolida **artefactos**, **identidade/replay**, **observabilidade** e critérios operacionais.

**Ligações:** [`discovery-phase410.md`](./discovery-phase410.md) (descoberta técnica histórica) · [`observability.md`](./observability.md) · [`validation-targeting-phase412.md`](./validation-targeting-phase412.md) (hints) · [`hybrid-runtime-release-readiness.md`](./hybrid-runtime-release-readiness.md) (4.9, ortogonal).

---

## 1. Estado da Fase 4.10

| Subfase | Entrega | Modo típico |
|---------|---------|-------------|
| 4.10.1–2 | `validation-plan.json` + resolver de comandos | Shadow (`SETUP_BOSS_PLAN_MODE=.shadow`) |
| 4.10.3 | `validation-results.json` (execução sync) | Opcional após plano |
| 4.10.4 | `validation-cache.json` (passed-only, fingerprint) | Local à corrida |
| 4.10.5 | `validation-runtime-summary.json` | Observabilidade compacta |
| 4.10.6 | `dependency-graph.json` + `impact_expansion` nos targets | Heurístico, parcial |
| 4.10.7 | Campos graph-aware no plano (`graph_impact`, `graph_candidates`, …) | Read-only para executor |
| **4.10.8** | **Manifests, docs, inspect, checklist** | Encerramento |

**Critério geral:** com `SETUP_BOSS_PLAN_MODE=shadow`, a corrida pode produzir a cadeia de artefactos com **ordenação determinística**, **fingerprints sem timestamps** nos payloads canónicos de grafo/graph-aware, e **identidade do validation-plan** estável face a refs extra em `sources` (allowlist na identidade).

---

## 2. Artefactos e registo (`plan-artifacts.json`)

O manifesto agrega, quando presentes no output da run:

| Chave / extensão | Ficheiro | Notas |
|------------------|----------|--------|
| `artifacts.validation_targets` | `validation-targets.json` | Targets + hints + `impact_expansion` |
| `artifacts.validation_manifest` | `validation-manifest.json` | Refs, telemetria de targeting |
| `artifacts.validation_propagation_manifest` | `validation-propagation-manifest.json` | Propagação semântica shadow |
| `artifacts.dependency_graph` | `dependency-graph.json` | Grafo local MVP |
| `artifacts.validation_plan` | `validation-plan.json` | Comandos resolvidos + metadados graph-aware |
| `artifacts.validation_results` | `validation-results.json` | Resultados do executor |
| `artifacts.validation_cache` | `validation-cache.json` | Entradas reusáveis |
| `artifacts.validation_runtime_summary` | `validation-runtime-summary.json` | Resumo + fingerprints de resultados |

Extensão `artifacts.extensions.validation_execution_plan` inclui refs úteis (`validation_plan_ref`, `dependency_graph_ref`, `validation_propagation_manifest_ref`, etc.) quando os ficheiros existem.

---

## 3. Modelo de cache (4.10.4)

- Entradas indexadas por fingerprints derivados do plano/identidade **estável** (comandos + targets resolvidos; metadados graph-aware **não** entram no payload de identidade do plano).
- Reutilização **apenas** para resultados `passed` (política explícita no executor).
- **`sources` na identidade:** só entram chaves fixas (`validation_targets`, `validation_manifest`, …); `dependency_graph` em `sources` é **observabilidade** e não invalida o hash de identidade.

Detalhe de envs: `.env.example` e `validation-executor.js`.

---

## 4. Grafo e graph-aware planning (limitações MVP)

- **Dependency graph:** imports relativos resolvidos por heurística (extensões + `index.*`); imports não resolvidos **não** quebram o pipeline.
- **Impact expansion:** BFS com caps; truncagens assinaladas em metadados.
- **Graph-aware no plano:** `graph_candidates`, `graph_impact`, `risk_hints` agregados, `scope_expansion` — **complementares**; o executor **não** depende destes campos.

---

## 5. Flags e envs (revisão)

| Variável | Valores | Efeito |
|----------|---------|--------|
| `SETUP_BOSS_PLAN_MODE` | `off` (default), `shadow` | Shadow: targeting + artefactos de validação |
| `SETUP_BOSS_SEMANTIC_VALIDATION_PROPAGATION` | `off` (default), `shadow` | Candidatos semânticos no propagation manifest |

Fonte canónica: `scripts/execution-plan/feature-flags.js`.

---

## 6. Observabilidade e inspect

- **`inspect-plan`:** manifest inclui `validation_propagation_manifest`, `dependency_graph`; targeting mostra `dependency_graph_present` e contagem de targets com `impact_expansion`.
- **`inspect-validation-runtime`:** resumo 4.10 + bloco **Graph-aware planning** quando `validation-plan.json` contém `graph_impact` (candidatos, reverse imports, testes ligados, fingerprints curtos).
- **Telemetria de targeting:** eventos incluem `dependency_graph_built`, além de geração de targets e propagação semântica.

---

## 7. Checklist operacional (release readiness)

- [ ] **Ordenação determinística:** arrays canónicos ordenados nos builders/fingerprints relevantes.
- [ ] **Replay safety:** payloads de fingerprint sem `generated_at` / relógio nos hashes de grafo e graph-aware.
- [ ] **Cache safety:** identidade do plano inalterada ao adicionar refs só em `sources.dependency_graph`.
- [ ] **Unresolved safety:** falhas de resolução de import no grafo apenas incrementam contadores / omitem arestas.
- [ ] **Compatibilidade pipeline:** `SETUP_BOSS_PLAN_MODE=off` não exige artefactos de validação.
- [ ] **Observabilidade:** `plan-artifacts.json` reflete novos ficheiros quando gravados.
- [ ] **Fallback:** enrich graph-aware e grafo em `try/catch` no builder/targeting — falhas não abortam a corrida principal.

**Testes focados sugeridos:**

```bash
node --test scripts/execution-plan/validation-targeting.test.js
node --test scripts/execution-plan/validation-targeting/dependency-graph.test.js
node --test scripts/execution-plan/validation-targeting/graph-aware-plan-enrichment.test.js
node --test scripts/execution-plan/stabilization.test.js
```

---

## 8. Limitações MVP (oficial)

- Sem daemon de validação nem execution DAG.
- Grafo sem análise semântica profunda nem cross-language.
- Propagação semântica permanece **shadow** por defeito.
- Graph-aware **não** agenda nem filtra comandos do executor.

---

## 9. Próximo passo após 4.10 (4.11 — fechado)

- A **Fase 4.11** (deterministic review, gates opcionais, diff e baseline) está **encerrada** em **[`deterministic-review-phase411-release-readiness.md`](./deterministic-review-phase411-release-readiness.md)**.
- **Seguinte (4.12+):** overlays candidatos ↔ execução, inspecções cruzadas com `deterministic-review.json` quando o motor está activo, e evolução opcional do grafo mantendo caps e política de falha suave.

---

## 10. Arquitetura (resumo textual)

```text
execution-plan + executor-changes + reconciliation
  → validation-targets (+ dependency-hints, impact_expansion)
  → dependency-graph.json
  → validation-propagation-manifest (opcional, shadow)
  → validation-plan.json (comands + graph_impact read-only)
  → validation-results.json + validation-cache.json + validation-runtime-summary.json
  → plan-artifacts.json (refs consolidadas)
```
