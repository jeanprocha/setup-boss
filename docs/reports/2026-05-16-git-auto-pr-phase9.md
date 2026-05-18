# Fase 9 — PR automático opcional pós-push

**Data:** 2026-05-16  
**Tipo:** implementação (Pull Request Bitbucket após push)  
**Relacionado:** `docs/reports/2026-05-16-git-auto-push-phase8.md`

---

## Alterações realizadas

1. **`core/resolve-git-remote-context.js`** — lê `origin`, detecta provider/workspace/repo
2. **`core/bitbucket-pull-request-api.js`** — REST Bitbucket 2.0 (criar + procurar PR aberto)
3. **`core/git-approved-run-pr.js`** — `tryGitPrAfterApprovedPush` com gates e persistência
4. **Integração** em `run-git-commit-after-review.js` e `orchestration.js` após push bem-sucedido

---

## Arquivos alterados

| Arquivo | Acção |
|---------|--------|
| `core/resolve-git-remote-context.js` | **novo** |
| `core/bitbucket-pull-request-api.js` | **novo** |
| `core/git-approved-run-pr.js` | **novo** |
| `core/git-approved-run-pr.test.js` | **novo** (10 testes) |
| `scripts/daemon/lib/run-git-commit-after-review.js` | hook pós-push |
| `scripts/runtime/orchestration.js` | hook pós-push |
| `docs/reports/2026-05-16-git-auto-pr-phase9.md` | **novo** |

---

## Configuração

| Variável | Default | Efeito |
|----------|---------|--------|
| `SETUP_BOSS_GIT_AUTO_PR` | `false` | PR só com `"true"` |
| `SETUP_BOSS_BITBUCKET_USERNAME` | — | Basic auth (com APP_PASSWORD) |
| `SETUP_BOSS_BITBUCKET_APP_PASSWORD` | — | Basic auth |
| `SETUP_BOSS_BITBUCKET_ACCESS_TOKEN` | — | Bearer (alternativa) |
| `BITBUCKET_*` | — | Fallback dos nomes acima |

**Pré-requisitos:** `SETUP_BOSS_GIT_AUTO_PUSH=true` e push concluído (`git.push.status === pushed`).

---

## Decisões técnicas

| Decisão | Motivo |
|---------|--------|
| MVP Bitbucket apenas | Ambiente actual do projeto |
| `baseBranch` de `run-context.git` (Fase 2) | Destino do PR alinhado ao prepare-branch |
| Idempotência local + pesquisa PR OPEN remoto | Evita duplicados |
| Erros sanitizados | Sem tokens/URLs sensíveis em logs persistidos |
| Sem merge automático | Fora de escopo |

---

## Persistência `run-context.git.pr`

Sucesso:

```json
{
  "status": "opened",
  "provider": "bitbucket",
  "url": "https://bitbucket.org/.../pull-requests/42",
  "id": "42",
  "sourceBranch": "<activityBranch>",
  "targetBranch": "<baseBranch>",
  "openedAt": "<iso>"
}
```

Erro: `status: failed`, `errorCode`, `errorMessage` (sanitizado).

---

## Título e descrição do PR

**Título:** `setup-boss: <run title>`

**Descrição:**

```text
Run: <runId>
Project: <projectId>
Review: APPROVED
Commit: <sha>
```

---

## Testes executados

```bash
node --test core/git-approved-run-pr.test.js
```

**Resultado:** 10/10 passaram (API Bitbucket mockada em testes).

---

## Riscos

- Credenciais Bitbucket devem estar no ambiente do daemon/worker.
- GitHub/GitLab retornam `git_pr_provider_unknown` até fases futuras.
- PR remoto pré-existente regista `already_exists_remote` sem criar novo.

---

## Próximos passos

- Documentar variáveis no runbook operacional.
- Fases futuras: GitHub/GitLab PR, merge automático, UI com link do PR.

---

## Resultado final

PR Bitbucket opcional após push, desactivado por omissão, idempotente e persistido em `run-context.git.pr`, sem merge automático.
