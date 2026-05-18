# Fase 6 — Commit automático pós-review aprovado

**Data:** 2026-05-16  
**Tipo:** implementação (runtime Git — commit local pós APPROVED)  
**Relacionado:** `docs/reports/2026-05-16-git-branch-hitl-ui-phase5.md`

---

## Alterações realizadas

1. **`core/git-approved-run-commit.js`** — helpers e fluxo de commit automático
   - `collectCommitAllowedPaths` — `allowed_files`, prefixo `docs/.IA` / legado `.IA`, relatório append-only
   - `validateCommitScope` — bloqueia dirty fora do escopo; ignora `.setup-boss/` e pasta da corrida
   - `createApprovedRunCommit` — `git add` por path (sem `git add .`) + `git commit`
   - `persistGitCommitState` — grava `run-context.git.commit`
   - `tryGitCommitAfterApprovedRun` — gates + relatório `docs/executions/*-commit-summary.md`

2. **`scripts/runtime/orchestration.js`** — após `enrichIAAfterApprovedRun` em `finishKnowledge`, chama commit se review `approved`

3. **`scripts/daemon/lib/run-git-commit-after-review.js`** — enrich + commit para fluxo daemon

4. **`scripts/daemon/lib/run-orchestration-sync.js`** — em `review_completed`, agenda `runPostReviewApprovedGitCommit` (não bloqueante)

---

## Arquivos alterados

| Arquivo | Acção |
|---------|--------|
| `core/git-approved-run-commit.js` | **novo** |
| `core/git-approved-run-commit.test.js` | **novo** (8 testes) |
| `scripts/daemon/lib/run-git-commit-after-review.js` | **novo** |
| `scripts/runtime/orchestration.js` | hook pós-enrich |
| `scripts/daemon/lib/run-orchestration-sync.js` | hook `review_completed` |
| `docs/reports/2026-05-16-git-auto-commit-phase6.md` | **novo** |

---

## Decisões técnicas

| Decisão | Motivo |
|---------|--------|
| Commit só com `git.status === git_branch_ready` e `HEAD === activityBranch` | Alinhado às fases 3–5 |
| Nunca commitar em `main`/`master`/`develop`/`production`/`release` | Mesmo conjunto do execute gate |
| Ignorar dirty em `.setup-boss/` e `outputDir` da corrida | Artefactos de runtime não entram no commit |
| Relatório gerado **antes** do commit, mas validação de “sem mudanças” **antes** do relatório | Evita falso `NO_CHANGES` quando só o relatório existiria |
| `git add -- <paths>` explícitos | Sem `git add .`; escopo auditável |
| Idempotência via `git.commit.status === committed` | Sync + orchestration podem disparar o mesmo hook |
| Sem push | Fora de escopo da fase |

---

## Persistência `run-context.git.commit`

Sucesso:

```json
{
  "status": "committed",
  "sha": "<hash>",
  "message": "setup-boss: <título>",
  "body": "Run: …\nProject: …\nReview: APPROVED",
  "createdAt": "<iso>",
  "reportPath": "docs/executions/<stamp>-<slug>-commit-summary.md"
}
```

Erro:

```json
{
  "status": "failed",
  "errorCode": "git_commit_*",
  "errorMessage": "…"
}
```

Códigos: `git_commit_branch_required`, `git_commit_branch_mismatch`, `git_commit_protected_branch`, `git_commit_no_changes`, `git_commit_out_of_scope_changes`, `git_commit_failed`.

---

## Mensagem de commit

```
setup-boss: <run title>

Run: <runId>
Project: <projectId>
Review: APPROVED
```

---

## Testes executados

```bash
node --test core/git-approved-run-commit.test.js
```

**Resultado:** 8/8 passaram.

Cobertura: branch required, protegida, mismatch, review rejeitado/bloqueado, sem mudanças, out-of-scope, happy path com SHA, falha persistida.

---

## Riscos

- Fluxo **execute-only** sem `review-output.json` na raiz da corrida não dispara commit (review agregado no bundle não basta).
- `review_completed` no sync pode correr antes de `finishKnowledge` no pipeline clássico — idempotência mitiga duplo commit; enrich pode executar duas vezes (determinístico + LLM best-effort).
- Diretórios untracked no porcelain (ex.: `src` vs `src/app.js`) exigem expansão para ficheiros `allowed_files`.

---

## Próximos passos

- Fase 7+ (fora de escopo): push, PR, merge, worktree, squash, amend, rollback automático.
- UI: expor `git.commit` no resumo da corrida (opcional).
- Unificar review do execution-runtime com `review-output.json` para commit no fluxo Mission Control execute-only.

---

## Resultado final

Commit Git local automático após review **APPROVED** e enrich IA, com escopo restrito, relatório append-only por execução e estado persistido em `run-context.git.commit`, sem push.
