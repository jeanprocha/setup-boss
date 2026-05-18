# Fase 8 — Push opcional pós-commit aprovado

**Data:** 2026-05-16  
**Tipo:** implementação (Git push configurável após commit automático)  
**Relacionado:** `docs/reports/2026-05-16-git-auto-commit-phase6.md`, `docs/reports/2026-05-16-mission-control-review-normalization-phase7.md`

---

## Alterações realizadas

1. **`core/git-approved-run-push.js`**
   - `isGitAutoPushEnabled` — só activa com `SETUP_BOSS_GIT_AUTO_PUSH=true`
   - `tryGitPushAfterApprovedCommit` — gates + push + persistência
   - `pushActivityBranchToOrigin` — `git push -u origin <branch>` ou `git push origin <branch>`
   - `persistGitPushState` — `run-context.git.push`
   - `sanitizeGitPushErrorMessage` — redacção de URLs/credenciais em erros
   - `writeExecutionPushReport` — relatório append-only em `docs/executions/*-push-summary.md`

2. **`scripts/daemon/lib/run-git-commit-after-review.js`** — push após commit/`already_committed`

3. **`scripts/runtime/orchestration.js`** — mesmo hook no pipeline clássico

---

## Arquivos alterados

| Arquivo | Acção |
|---------|--------|
| `core/git-approved-run-push.js` | **novo** |
| `core/git-approved-run-push.test.js` | **novo** (10 testes) |
| `scripts/daemon/lib/run-git-commit-after-review.js` | push pós-commit |
| `scripts/runtime/orchestration.js` | push pós-commit |
| `docs/reports/2026-05-16-git-auto-push-phase8.md` | **novo** |

---

## Configuração

| Variável | Default | Efeito |
|----------|---------|--------|
| `SETUP_BOSS_GIT_AUTO_PUSH` | `false` (omitido) | Push só quando valor é exactamente `"true"` |

---

## Decisões técnicas

| Decisão | Motivo |
|---------|--------|
| Push desactivado por omissão | Segurança — opt-in explícito |
| Reutilizar gates da Fase 6 (branch ready, commit, mismatch, protegida) | Consistência operacional |
| Idempotência via `git.push.status === pushed` + mesma branch/remote | Evita push duplicado em re-sync |
| Sem force push | Regra de segurança do produto |
| Erros sanitizados nos logs persistidos | Não vazar token/URL remoto |
| Relatório só quando push é tentado (flag on + gates) | Rastreabilidade sem ruído quando disabled |

---

## Persistência `run-context.git.push`

Sucesso:

```json
{
  "status": "pushed",
  "remote": "origin",
  "branch": "<activityBranch>",
  "pushedAt": "<iso>",
  "setUpstream": true
}
```

Erro:

```json
{
  "status": "failed",
  "errorCode": "git_push_*",
  "errorMessage": "..."
}
```

Códigos: `git_push_disabled`, `git_push_commit_required`, `git_push_branch_required`, `git_push_branch_mismatch`, `git_push_protected_branch`, `git_push_no_remote`, `git_push_failed`.

---

## Testes executados

```bash
node --test core/git-approved-run-push.test.js
```

**Resultado:** 10/10 passaram.

Cobertura: flag off, sem commit, mismatch, protegida, sem origin, happy path `-u`, idempotência, erro persistido, `persistGitPushState`.

---

## Riscos

- Credenciais Git locais/CI devem estar configuradas fora do Setup-Boss.
- Push com flag activa em ambiente sem `origin` falha com `git_push_no_remote` (esperado).
- PR/merge continuam manuais ou fases futuras.

---

## Próximos passos

- Fase 9+ (fora de escopo): PR automático, merge, UI de estado `git.push`.
- Documentar `SETUP_BOSS_GIT_AUTO_PUSH` no README operacional do projeto.

---

## Resultado final

Push opcional da `activityBranch` para `origin` após commit aprovado, controlado por env, idempotente e persistido em `run-context.git.push`, sem alterar regras de commit nem criar PR.
