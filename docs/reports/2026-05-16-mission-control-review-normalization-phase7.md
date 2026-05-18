# Fase 7 — Normalizar review approved no fluxo Mission Control execute-only

**Data:** 2026-05-16  
**Tipo:** implementação (ponte bundle daemon → `review-output.json` → commit Fase 6)  
**Relacionado:** `docs/reports/2026-05-16-git-auto-commit-phase6.md`

---

## Alterações realizadas

1. **`core/normalize-review-output-from-bundle.js`**
   - Lê review agregado do bundle (`collectExecutionForRun` / `summary.review` + `subtasks`)
   - `hasClearApprovedEvidence` — exige subtasks com review `approved`, sem `pending`/`rejected`, sem subtask `completed` com review `none`
   - `isPreservedReviewOutput` — não sobrescreve `review-output.json` válido (`approved` com `requires_correction`, ou `rejected`/`blocked`)
   - Gera `review-output.json` compatível com `enrichIAAfterApprovedRun` e `tryGitCommitAfterApprovedRun`
   - Stub `review-output.md` só se ainda não existir

2. **`scripts/daemon/lib/run-git-commit-after-review.js`**
   - Chama normalização antes de enrich + commit
   - Logs `[review-normalize]` por acção (`preserved` / `written` / `skip`)
   - Aceita `opts.bundle` opcional (testes)

3. **Integração existente** — `run-orchestration-sync.js` → `review_completed` → `runPostReviewApprovedGitCommit` (sem alteração de contrato)

---

## Arquivos alterados

| Arquivo | Acção |
|---------|--------|
| `core/normalize-review-output-from-bundle.js` | **novo** |
| `core/normalize-review-output-from-bundle.test.js` | **novo** (7 testes) |
| `scripts/daemon/lib/run-git-commit-after-review.js` | normalização + logs |
| `docs/reports/2026-05-16-mission-control-review-normalization-phase7.md` | **novo** |

---

## Decisões técnicas

| Decisão | Motivo |
|---------|--------|
| Evidência estrita além de `summary.review.status === approved` | Evita approved artificial com subtasks `completed` ainda em `none` |
| Preservar qualquer `review-output.json` terminal válido | Pipeline clássico e rejeições manuais não são sobrescritos |
| Campo `normalization.source = execution_bundle_normalization_v1` | Rastreabilidade sem alterar contrato de commit |
| Normalização só no hook pós-review do daemon | Pipeline clássico continua a escrever review no `orchestration.js` |
| Regras de commit inalteradas (Fase 6) | Escopo limitado à ponte de artefactos |

---

## Contrato `review-output.json` normalizado

```json
{
  "status": "approved",
  "acceptance_level": "development",
  "blocking_issues": [],
  "warnings": ["Review normalizado a partir do bundle..."],
  "requires_correction": false,
  "summary": "Review aprovado (execution-runtime) — subtask 001.",
  "markdown_report": "**Approved (normalized from execution bundle)**...",
  "normalization": {
    "source": "execution_bundle_normalization_v1",
    "normalized_at": "<iso>",
    "run_id": "<runId>",
    "subtasks_approved": ["001"]
  }
}
```

---

## Testes executados

```bash
node --test core/normalize-review-output-from-bundle.test.js core/git-approved-run-commit.test.js
```

**Resultado:** 15/15 passaram.

Cobertura Fase 7:
- bundle approved → `review-output.json` criado
- bundle rejected → sem artefacto aprovado
- existente válido preservado
- bundle incompleto → `insufficient_evidence`
- commit após normalização (execute-only)
- repetição → `already_committed` (sem duplo commit)

---

## Riscos

- `collectExecutionForRun` depende de artefactos `execution/` no disco; bundle injetado em testes, produção usa leitura real.
- Testes de integração com enrich IA podem chamar LLM se `OPENAI_API_KEY` estiver definida (comportamento herdado da Fase 6).
- Subtask com `review_state: blocked` no JSON de execução mapeia para `none` no agregado — evidência estrita reduz risco de falso approved.

---

## Próximos passos

- Fase 8+ (fora de escopo): push, PR, merge, UI de estado `git.commit` / normalização.
- Opcional: emitir evento `review_output_normalized` na timeline operacional.

---

## Resultado final

O fluxo Mission Control execute-only passa a materializar `review-output.json` quando o daemon agrega review **approved** com evidência clara, permitindo enrich IA + commit automático da Fase 6 sem alterar as regras de commit nem duplicar commits.
