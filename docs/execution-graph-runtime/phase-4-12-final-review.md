# Fase 4.12 — Review final (consolidado)

**Data:** 2026-05-14  
**Tipo:** validação e revisão documental — **sem** alterações de código nesta ronda.  
**Escopo:** subfases **4.12.1**–**4.12.9** (modelo, runtime, scheduler, overlay, adapters, replay, risk, release readiness) e **observabilidade** no sentido de consumo read-only de artefactos.

---

## 1. Status final da 4.12

| Critério | Resultado |
|----------|-----------|
| Pipeline oficial intacto | **OK** — integração única em `scripts/runtime/run-runtime.js` (`tryWriteShadowExecutionGraphArtifacts`), envolvida em `try/catch` que não altera exit code. |
| `orchestration.js` sem dependência DAG | **OK** — sem referências a `execution-graph`, `graph/shadow` ou `tryWriteShadowExecutionGraph`. |
| DAG runtime advisory / shadow | **OK** — flags `off` \| `shadow`; relatórios e JSON derivados; sem execução paralela operacional nem handlers de etapa invocados pelo grafo. |
| Dependência operacional nova | **Nenhuma** detectada — orquestração linear mantém-se; artefactos não são consumidos pelo pipeline canónico. |
| Testes | **OK** — `npm test`: **379** testes, **0** falhas (inclui toda a árvore `scripts/runtime/graph/**/*.test.js`, incluindo `release-readiness`). |
| Documentação e env | **OK** — ficheiros `phase-4-12-*.md` (1,2,3,4,5,6,8,9), `setup-boss-roadmap.md`, `setup-boss-evolution.md`, `.env.example` alinhados às flags `SETUP_BOSS_EXECUTION_GRAPH*`. |

**Conclusão:** a Fase **4.12** está **aprovada** para encerramento formal como camada **observacional/advisory**, com ressalvas explícitas em “Limitações” e “Observabilidade” abaixo.

---

## 2. Arquitetura consolidada (visão única)

- **Fonte de verdade estrutural:** grafo canónico em memória (`buildCanonicalExecutionGraph`) + fingerprint SHA-256 estável (`buildFingerprintPayload` / `stableStringify`).
- **Artefactos por run** (outputDir da corrida, best-effort):  
  `execution-graph.json` → `execution-graph-runtime.json` → relatórios scheduler / overlay / node-adapters / replay / risk → **`execution-graph-release-readiness.json`** (último hook, consolida leituras).
- **Fronteira:** `scripts/runtime/graph/**` não é importado por `orchestration.js`; apenas `run-runtime.js` aciona a escrita shadow agregada.
- **Determinismo:** ordem de scheduling alinhada a `computeDeterministicSchedulingOrder` (arestas `edges` sem `repeat_edges`); release readiness cruza scheduler ↔ overlay ↔ canónico com a mesma base.

---

## 3. Validação executada (nesta review)

### 3.1 Comandos

- `npm test` — **379 passed**, suites graph incluídas (`execution-graph`, `runtime-state`, `scheduler`, `overlay`, `node-adapters`, `replay`, `risk`, `release-readiness`).

### 3.2 Conferências estáticas (amostra direccionada)

- **`orchestration.js`:** ausência de `execution-graph` / `require("./graph")`.
- **`run-runtime.js`:** único `require("./graph")` para `tryWriteShadowExecutionGraphArtifacts` (pós-pipeline / resume).
- **Flags em `.env.example`:** todas as `SETUP_BOSS_EXECUTION_GRAPH*` documentadas com default **off**; `SETUP_BOSS_EXECUTION_GRAPH_DEBUG` opcional.
- **`schema_version` por artefacto:** constantes **1** em `constants.js` de graph principal, runtime, scheduler, overlay, node-adapters, replay, risk e release-readiness — coerente entre si para o MVP actual.

### 3.3 Validação cruzada entre artefactos (comportamento no código)

- **Overlay / fingerprint:** `overlay` + testes cobrem `fingerprint_validation`, runtime vs grafo, fallbacks de scheduler.
- **Scheduler:** `repeat_edges` documentadas como `skipped_repeat_edges`; `getSchedulingEdges` não incorpora `repeat_edges` nas deps — **advisory** mantido.
- **Replay:** plano advisory, `compat.advisory_only` / `real_pipeline_handlers_invoked` validados em testes e em **release readiness**.
- **Risk:** análise read-only; relatório sem bloquear pipeline; testes de degradação com dir vazio.
- **Release readiness (4.12.9):** alinhamento de fingerprints, ordem determinística (scheduler vs overlay vs canónico), auditoria de flags, boundary de imports em ficheiros allowlisted, estados `ready` \| `warning` \| `blocked`.

---

## 4. Subfases 4.12.1–4.12.9 — check-list de review

| ID | Tema | Estado review |
|----|------|----------------|
| 4.12.1 | Graph model (`execution-graph.json`) | OK — validação doc, ciclos hard, fingerprint. |
| 4.12.2 | Runtime state (`execution-graph-runtime.json`) | OK — transições, snapshot, alinhamento structural/fingerprint. |
| 4.12.3 | Scheduler advisory | OK — serial, meta advisory, `repeat_edges` fora do motor de deps. |
| 4.12.4 | Overlay linear vs DAG | OK — relatório, modos consistent/warning/divergent, sem acoplamento a orchestration. |
| 4.12.5 | Node adapters | OK — registo determinístico, sem invocar runtimes de etapa. |
| 4.12.6 | Replay runtime | OK — planeamento/invalidação advisory, ordem alinhada ao scheduler. |
| 4.12.8 | Risk / deadlock | OK — agregação read-only, safe JSON, sem impacto em exit code. |
| 4.12.9 | Release readiness | OK — artefacto consolidado, degradação graciosa, último na cadeia shadow. |

---

## 5. Observabilidade (4.12.x)

- **Não existe** subdocumento dedicado **phase-4-12-7** no repositório; a observabilidade distribui-se por **diagnostics** nos relatórios (overlay, scheduler, runtime, replay, risk) e por tooling/CLI descrito em discovery (`graph-observability-discovery.md`, resumo em `execution-graph-discovery-summary.md`).
- **Read-only:** camada graph não escreve no pipeline oficial nem altera `metadata.json` canónico para decisão de fluxo; consumo é opcional por humano/ferramenta.
- **Release readiness** consolida `diagnostics` apenas como **cópia agregada** — sem efeitos colaterais.

---

## 6. Imports, acoplamento, ciclos, vazamento

| Risco | Avaliação |
|-------|-----------|
| Imports indevidos (orchestration ← graph) | **Não observado.** |
| Acoplamento acidental forte | **Baixo** — `require("./graph")` localizado em `run-runtime.js`. |
| Dependências circulares óbvias | **Não detectadas** na cadeia principal: submódulos importam “para dentro” do pacote graph; `release-readiness` não é requerido por `graph-builder` / `artifact-writer` base. |
| Vazamento para runtime oficial | **Controlado** — falhas de escrita shadow engolidas; exit code da corrida não depende dos artefactos 4.12. |

---

## 7. Inconsistências de schema / artefactos / ordem / fingerprint

- **Schema:** `schema_version: 1` homogéneo nos artefactos derivados do MVP; evoluções futuras devem versionar por ficheiro.
- **Fingerprints:** testes e release readiness garantem alinhamento ao canónico quando os ficheiros existem; ausência gera **warning** / readiness parcial, não aborta pipeline.
- **`deterministic_order`:** validação cruzada explícita na 4.12.9 (scheduler vs overlay vs `computeDeterministicSchedulingOrder`) evita divergência silenciosa entre documentos.
- **Replay / scheduler / overlay:** inconsistências graves (ex.: fingerprint, handlers invocados) elevam a **blocked** no relatório de release readiness, sem feedback para o motor oficial.

---

## 8. Riscos remanescentes (baixos mas reais)

- **Env local:** desenvolvedor pode definir flags inválidas (`on`, etc.) — release readiness **bloqueia** nesse cenário no relatório; o pipeline continua.
- **Disco / permissões:** escrita shadow pode falhar silenciosamente (debug opcional) — risco de “falso negativo” humano se ninguém olhar para o outputDir.
- **Evolução do grafo canónico:** qualquer mudança em `graph-builder` exige rever fingerprints e testes de overlay/replay/scheduler em conjunto.

---

## 9. Limitações conhecidas

- Artefactos **não** são fonte de verdade para o executor/review — são **derivados**.
- **Sem** paralelismo operacional DAG na 4.12.
- **Sem** fase 4.12.7 como doc de produto separado; observabilidade é transversal aos relatórios existentes.
- Release readiness **não** substitui CI nem auditoria manual de segurança do repositório.

---

## 10. Gaps futuros (não reabrem a 4.12 como MVP)

- Artefacto ou CLI único tipo **`inspect-graph`** consumindo todos os JSON (hoje parcialmente na discovery).
- Política de **retenção/pruning** de JSON shadow em runs antigas.
- **Evolução de `schema_version > 1`** com migradores ou compat explícita no release readiness.
- (Macro) integração **opt-in** de insights do DAG num dashboard ou gate **não** bloqueante — pertence a fases posteriores, não à 4.12 advisory.

---

## 11. Readiness geral

- **Técnica:** alta — cobertura de testes + validação cruzada na 4.12.9 + fronteiras claras.
- **Operacional:** depende de equipa consultar `outputDir` quando flags `shadow` estão activas.
- **Documental:** consistente entre roadmap, evolution, `.env.example` e `phase-4-12-*.md`.

---

## 12. Recomendações para a próxima macrofase

1. **Declarar explicitamente** a macrofase seguinte (ex.: 4.13 ou “Fase 5 incremental”) sem misturar execução DAG real com o pipeline linear até haver ADR e flags separadas.
2. Manter **regra de ouro:** nenhuma decisão de `exitCode` ou de `orchestration` baseada apenas em artefactos 4.12.
3. Se se avançar para **consumo** de métricas do grafo, introduzir **contrato de leitura** (versão, TTL, schema) e testes de **não-regressão** do pipeline sem flags shadow.
4. Opcional: **uma** página de operador que liste flags 4.12 + paths dos ficheiros — reduz fricção operacional.

---

## 13. Assinatura de fecho

- **Regressões detectadas nesta review:** nenhuma (testes verdes; conferências estáticas alinhadas).  
- **4.12:** **aprovada** como entrega **advisory/shadow** completa até **4.12.9**, com observabilidade entendida como read-only sobre artefactos existentes e documentação de discovery onde aplicável.
