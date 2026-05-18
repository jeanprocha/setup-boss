# Fase 0 — Validação, compatibilidade e encerramento (MVP)

Documento de **encerramento oficial da Fase 0** (subfases **0.1**–**0.6**): migração para **`docs/.IA/`** como padrão corporativo, compatibilidade com **`.IA/`** na raiz, validações executadas e readiness para a **Fase 1** do MVP.

---

## Resumo da migração

- **Antes:** a memória semântica e os outputs por corrida eram descritos sobretudo como **`.IA/`** na raiz do projeto alvo.
- **Depois:** o padrão oficial é **`docs/.IA/`** e **`docs/.IA/outputs/<run-id>/`**; **`.IA/`** na raiz permanece **suportada** como legado.
- **Runtime:** resolução centralizada em **`scripts/shared/ia-path-resolver.js`** (e consumidores); sem alteração de DAG, Task Intake nem estratégia de execução nesta fase.

---

## Subfases 0.1 → 0.6

| Fase | Entrega principal |
|------|-------------------|
| **0.1** | Resolver: `docs/.IA` preferencial, `.IA` legado, avisos de coexistência |
| **0.2** | Outputs e índices alinhados ao resolver |
| **0.3** | Consumidores e preflight sem `path.join(projectRoot, ".IA")` hardcoded |
| **0.4** | Agents / `context/` / prompts (`scan`, `architect`) com narrativa corporativa |
| **0.5** | `ensure-ia` + docs operacionais + `docs/mvp-phase0-enterprise-ia-context-standard.md` |
| **0.6** | Limpeza textual residual, smoke real, `npm test`, encerramento (este documento) |

---

## O que mudou (síntese)

- Documentação e mensagens tratam **`docs/.IA`** como **padrão** e **`.IA` na raiz** como **legado**.
- Artefactos por corrida e índices continuam válidos para **ambos** os layouts.
- Script de smoke: **`scripts/smoke/mvp-phase0-ia-migration-smoke.js`** (cenários limpo, legado, híbrido, `writeRunIndex`, `validateRunArtifacts`, `appendProblemHistoryEntry`).

---

## Compatibilidade mantida

- Projeto **só com `docs/.IA/`** — uso normal.
- Projeto **só com `.IA/`** na raiz — resolver escolhe legado; aviso **`IA_LEGACY_FALLBACK`**.
- **Coexistência** de `docs/.IA` e `.IA` na raiz — prioridade a **`docs/.IA`**; aviso **`IA_LEGACY_COEXIST`**.
- Índices **`setup-boss/.setup-boss/runs/<run-id>.json`** podem apontar para qualquer output permitido pelo resolver.

---

## Comportamento final (referência rápida)

| Aspeto | Padrão | Legado |
|--------|--------|--------|
| Pasta semântica | `docs/.IA/` | `.IA/` na raiz |
| Outputs por run | `docs/.IA/outputs/<run-id>/` | `.IA/outputs/<run-id>/` |
| Nome “**.IA** system” | Conceito (governação / prompts) | — |

---

## Validações executadas (0.6)

- **`npm test`** — suite completa do repositório (regressão).
- **`node scripts/smoke/mvp-phase0-ia-migration-smoke.js`** — smoke sobre filesystem temporário:
  - projeto vazio → `ensureIAMinimal` cria **`docs/.IA`**;
  - só **`.IA`** → `source === "legacy"` e aviso esperado;
  - **ambos** → `source === "preferred"` e aviso de coexistência;
  - **`writeRunIndex`** + **`validateRunArtifacts`** com `metadata.json` / `run-log.json` mínimos;
  - **`appendProblemHistoryEntry`** com projeto legado grava **`09-problem-history.jsonl`** sob **`.IA`**.

*(Orquestração completa `npm run run` e `inspect` em projeto real não fazem parte deste script; continuam cobertos pelos testes automatizados e por uso operacional.)*

---

## Riscos residuais conhecidos

- Documentos fora dos caminhos revistos podem ainda mencionar só `.IA/outputs` — corrigir à medida que apareçam.
- Projetos com **só** legado continuam sem aviso até existir `docs/.IA` ou até migração manual.
- Smoke **não** substitui validação de API keys / LLM em pipeline completo.

---

## Readiness para MVP Fase 1

- **Fase 0 encerrada** para efeitos de path semântico e documentação operacional alinhada.
- **Pré-requisitos sugeridos para Fase 1:** backlog de features MVP, critérios de aceite por incremento, e (se aplicável) política explícita de migração de repositórios que ainda tenham só `.IA/` na raiz.

Ver também: **`docs/mvp-phase0-enterprise-ia-context-standard.md`**.
