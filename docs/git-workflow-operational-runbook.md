# Runbook operacional — fluxo Git (Setup Boss)

**Âmbito:** uso diário **local** com Mission Control + daemon (runtime API).  
**Projeto alvo:** repositório Git registado no daemon; corridas em `<projeto>/docs/.IA/outputs/<run-id>/`.

Documentação de implementação por fase: `docs/reports/2026-05-16-git-*-phase*.md` (fases 1–10).

---

## 1. Visão geral do fluxo

```text
strategy_ready + clarificação aprovada
        │
        ▼
┌───────────────────────┐
│  Preparar branch      │  POST /runs/:id/git-branch  (HITL na UI)
│  (activityBranch)     │  → run-context.git.status = git_branch_ready
└───────────┬───────────┘
            │
            ▼
┌───────────────────────┐
│  Execute gate         │  Bloqueia POST /execute em main/master/…
│                       │  sem branch preparada alinhada ao HEAD
└───────────┬───────────┘
            │
            ▼
┌───────────────────────┐
│  Execução da corrida  │  PATCH / alterações no projeto (allowed_files)
└───────────┬───────────┘
            │
            ▼
┌───────────────────────┐
│  Review APPROVED      │  review-output.json
└───────────┬───────────┘
            │
            ▼
┌───────────────────────┐
│  Commit automático    │  git add por path (sem git add .)
│  (local)              │  → run-context.git.commit.status = committed
└───────────┬───────────┘
            │
     ┌──────┴──────┐ (opt-in, desligado por omissão)
     ▼             ▼
┌─────────┐   ┌─────────┐
│  Push   │   │  PR      │  Bitbucket; exige push concluído
│  origin │   │  remoto  │
└─────────┘   └─────────┘
```

**Ordem obrigatória:** prepare branch → executar (com gate satisfeito) → review aprovado → commit. Push e PR só depois de commit bem-sucedido e apenas se as flags de ambiente estiverem activas.

---

## 2. Estados em `run-context.git`

| Campo | Valores / significado |
|-------|------------------------|
| `enabled` | `true` quando o fluxo Git está activo para a corrida |
| `status` | `git_branch_pending` → em preparação; `git_branch_ready` → pode executar/commitar; `git_branch_failed` → ver `errorCode` |
| `baseBranch` | Branch base usada no prepare (ex.: `main`) |
| `activityBranch` | Branch de trabalho da atividade (ex.: `setup-boss/20260516-minha-feature`) |
| `baseCommit` / `headCommitAfterCreate` | SHAs de referência após prepare |
| `pullBeforeCreate` | `true` se houve `git pull --ff-only` com `origin` antes de criar a branch |
| `errorCode` / `errorMessage` | Em `git_branch_failed` (mensagem sanitizada na UI) |
| `commit` | `{ status: committed\|failed, sha, message, … }` após review aprovado |
| `push` | `{ status: pushed\|failed, remote, branch, … }` se push automático correu |
| `pr` | `{ status: opened\|failed, url, id, sourceBranch, targetBranch, … }` se PR automático correu |

**Ficheiro:** `<projeto>/docs/.IA/outputs/<run-id>/run-context.json` → chave `git`.

---

## 3. Quando aparece o card «Preparar branch»

No Mission Control (`OrchestrationRunControls`), o card **«Preparar branch da atividade»** aparece quando:

- A disponibilidade de execução tem `reason === git_branch_required` (derivado de `validateExecuteReadiness` / `deriveExecuteAvailability`), **e**
- `run-context.git.status` **não** é `git_branch_ready`.

Tipicamente: o repositório do projeto está em **branch protegida** (`main`, `master`, `develop`, `production`, `release`) e ainda não foi preparada a `activityBranch`, ou o utilizador voltou para `main` após prepare.

Quando `git_branch_ready` e o `HEAD` coincide com `activityBranch`, o card **esconde-se** e o execute gate permite correr.

---

## 4. Como executar manualmente

### 4.1 Pré-requisitos

1. Daemon activo: `npm run setup-boss -- daemon start` (ver `docs/local-runtime-usage-guide.md`).
2. Projeto Git registado no Mission Control.
3. Corrida com **phase2** `ready_for_execution`, clarificação **aprovada** e **strategy** pronta (`strategy_ready` ou equivalente no bundle).

### 4.2 Preparar branch (UI)

1. Abrir a corrida no Mission Control.
2. No card **Preparar branch**, confirmar estado Git e clicar **Preparar branch**.
3. O backend chama `POST /runs/:runId/git-branch` com `{}` (nome automático `setup-boss/<data>-<slug>`) ou com `{ "activityBranch": "setup-boss/…" }` se a API for invocada directamente.

### 4.3 Preparar branch (API / curl)

```bash
curl -s -X POST "http://127.0.0.1:3210/runs/<runId>/git-branch" \
  -H "Content-Type: application/json" \
  -d "{}"
```

Com nome explícito:

```json
{ "activityBranch": "setup-boss/20260516-minha-feature" }
```

### 4.4 Executar a corrida

Só após `git_branch_ready` e `git checkout` na `activityBranch` (o prepare faz checkout automaticamente).

- **UI:** botão de execução quando `canExecute` é verdadeiro.
- **API:** `POST /runs/:runId/execute` — respostas **409** com `git_branch_required` ou `git_branch_mismatch` se o gate falhar.

### 4.5 Commit automático

Disparado **automaticamente** após review **`approved`**:

- Fluxo daemon: `run-orchestration-sync` → `runPostReviewApprovedGitCommit`
- Pipeline clássico: `scripts/runtime/orchestration.js` após enrich IA

Não há flag para desligar o commit local nesta versão; o commit respeita escopo (`allowed_files`, `docs/.IA`, relatórios em `docs/executions/`).

### 4.6 Inspecionar resultado

```bash
# No projeto alvo
cat docs/.IA/outputs/<runId>/run-context.json
git branch --show-current
git log -1 --oneline
```

Relatórios opcionais: `docs/executions/*-commit-summary.md`, `*-push-summary.md` (quando gerados).

---

## 5. Como habilitar push

| Variável | Valor | Efeito |
|----------|-------|--------|
| `SETUP_BOSS_GIT_AUTO_PUSH` | `true` | Após commit (ou `already_committed`), envia `activityBranch` para `origin` |

**Omissão:** qualquer outro valor ou variável ausente → push **não** corre (`git_push_disabled`).

**Requisitos:**

- `run-context.git.status === git_branch_ready`
- `run-context.git.commit.status === committed`
- `HEAD` === `activityBranch`
- Remote `origin` configurado no projeto alvo
- **Sem** `--force` (implementação usa `git push -u origin <branch>` ou `git push origin <branch>`)

**PowerShell (sessão do daemon):**

```powershell
$env:SETUP_BOSS_GIT_AUTO_PUSH = "true"
npm run setup-boss -- daemon stop
npm run setup-boss -- daemon start
```

Reinicie o daemon após alterar variáveis — o worker herda o ambiente do processo pai.

---

## 6. Como habilitar PR Bitbucket

| Variável | Valor |
|----------|-------|
| `SETUP_BOSS_GIT_AUTO_PR` | `true` |
| `SETUP_BOSS_GIT_AUTO_PUSH` | `true` (obrigatório) |
| `SETUP_BOSS_BITBUCKET_USERNAME` + `SETUP_BOSS_BITBUCKET_APP_PASSWORD` | Basic auth |
| **ou** `SETUP_BOSS_BITBUCKET_ACCESS_TOKEN` | Bearer |
| `BITBUCKET_*` | Fallback dos nomes acima |

**Pré-requisitos:**

- `git.push.status === pushed`
- `origin` aponta para repositório **Bitbucket** (GitHub/GitLab → `git_pr_provider_unknown` nesta versão)
- `baseBranch` e `activityBranch` em `run-context.git`

**Título do PR:** `setup-boss: <título da task>`  
**Destino:** `baseBranch` registado no prepare.

---

## 7. Comandos smoke e validação

### Smoke E2E Git (recomendado após alterações)

```bash
# Offline — valida prepare, gate, commit; push/PR skipped
npm run smoke:git-flow-e2e

# Com push para bare local (sem rede externa)
SETUP_BOSS_GIT_AUTO_PUSH=true npm run smoke:git-flow-e2e

# Push + PR mock Bitbucket
SETUP_BOSS_GIT_AUTO_PUSH=true SETUP_BOSS_GIT_AUTO_PR=true npm run smoke:git-flow-e2e
```

PowerShell:

```powershell
$env:SETUP_BOSS_GIT_AUTO_PUSH = "true"
$env:SETUP_BOSS_GIT_AUTO_PR = "true"
npm run smoke:git-flow-e2e
```

Registo append-only: `docs/reports/2026-05-16-git-flow-e2e-smoke-phase10.md`.

### Testes unitários Git (rápidos)

```bash
node --test core/validate-git-execute-gate.test.js
node --test scripts/daemon/lib/run-git-branch-api.test.js
node --test scripts/daemon/lib/run-execute-api.test.js
node --test core/git-approved-run-commit.test.js
node --test core/git-approved-run-push.test.js
node --test core/git-approved-run-pr.test.js
```

### Health runtime

```bash
curl http://127.0.0.1:3210/health
npm run setup-boss -- doctor
```

---

## 8. Erros comuns (troubleshooting)

### `git_dirty_worktree`

**Quando:** prepare branch (`POST …/git-branch`).  
**Causa:** alterações locais **fora** da pasta de output da corrida (`docs/.IA/outputs/<run-id>/`).  
**Acção:** `git status` no projeto alvo; commit, stash ou descartar ficheiros fora do output da corrida; repetir prepare.

---

### `git_branch_required`

**Quando:** tentativa de executar (`POST …/execute`) ou disponibilidade na UI.  
**Causa:** branch actual é protegida (`main`, …) e `run-context.git` não está `git_branch_ready`, ou falta `activityBranch`.  
**Acção:** usar o card **Preparar branch** ou API `git-branch`; confirmar `git branch --show-current` === `activityBranch` após prepare.

---

### `git_branch_mismatch`

**Quando:** execute gate ou commit/push.  
**Causa:** `activityBranch` preparada ≠ branch actual do `HEAD`.  
**Acção:** `git checkout <activityBranch>` no projeto alvo ou repetir prepare na branch correcta.

---

### `git_commit_out_of_scope_changes`

**Quando:** commit automático pós-review.  
**Causa:** ficheiros modificados fora de `allowed_files`, prefixos `docs/.IA` / `.IA`, `docs/executions/`, ou pastas ignoradas (`.setup-boss/`, output da corrida).  
**Acção:** reverter alterações fora de escopo; garantir que a execução só alterou paths autorizados; rever `execution_context.allowed_files` no `run-context.json`.

---

### `git_push_no_remote`

**Quando:** push automático com `SETUP_BOSS_GIT_AUTO_PUSH=true`.  
**Causa:** projeto sem remote `origin`.  
**Acção:** `git remote add origin <url>` no projeto alvo; ou desligar push automático se o fluxo for só local.

---

### `git_pr_credentials_missing`

**Quando:** PR automático com `SETUP_BOSS_GIT_AUTO_PR=true`.  
**Causa:** credenciais Bitbucket em falta no ambiente do **daemon**.  
**Acção:** definir `SETUP_BOSS_BITBUCKET_*` (ou token) e reiniciar o daemon; confirmar que `git.push.status === pushed` antes do PR.

---

### Outros códigos úteis

| Código | Fase | Acção resumida |
|--------|------|----------------|
| `git_branch_exists` | prepare | Escolher outro nome; apagar branch local antiga se seguro |
| `git_pull_failed` | prepare | Verificar rede/`origin`; corrigir remote; prepare offline sem `origin` evita pull |
| `git_commit_no_changes` | commit | Nada para commitar no escopo — confirmar que a execução alterou ficheiros permitidos |
| `git_commit_protected_branch` | commit | Nunca commitar em `main`/… — voltar à `activityBranch` |
| `git_pr_push_required` | PR | Activar push e garantir `git.push.status === pushed` |
| `git_pr_provider_unknown` | PR | Remote não é Bitbucket; criar PR manualmente |

Mensagens na UI: `frontend/lib/runtime/git/git-branch-error-messages.ts`.

---

## 9. Regras de segurança

| Regra | Detalhe |
|-------|---------|
| **Nunca executar em branch protegida** sem prepare | Gate server-side em `main`, `master`, `develop`, `production`, `release` |
| **Sem `git add .`** | Commit usa paths explícitos derivados do escopo da corrida |
| **Sem force push** | Push usa apenas `git push` / `git push -u` normais |
| **Push/PR desactivados por omissão** | Só `SETUP_BOSS_GIT_AUTO_PUSH=true` e `SETUP_BOSS_GIT_AUTO_PR=true` activam remoto |
| **Sem commit em branch protegida** | Mesmo conjunto de nomes que o execute gate |
| **Erros sanitizados** | URLs e credenciais não devem aparecer em `errorMessage` persistido |

---

## 10. Checklist — uso diário

- [ ] Daemon `running` (`daemon status` / indicador live na UI)
- [ ] Projeto Git registado; working tree limpa **fora** do output da corrida
- [ ] Corrida: clarificação aprovada + strategy pronta
- [ ] **Preparar branch** → `git.status === git_branch_ready`
- [ ] Confirmar `git branch --show-current` === `activityBranch`
- [ ] Executar corrida (sem 409 `git_branch_*`)
- [ ] Review **approved**
- [ ] Verificar `git.commit.status === committed` e SHA em `run-context.json`
- [ ] (Opcional) `SETUP_BOSS_GIT_AUTO_PUSH=true` no daemon + `origin` válido
- [ ] (Opcional) credenciais Bitbucket + `SETUP_BOSS_GIT_AUTO_PR=true`
- [ ] Smoke rápido se mexeu em código Git: `npm run smoke:git-flow-e2e`

---

## Referências

| Documento | Conteúdo |
|-----------|----------|
| `docs/local-runtime-usage-guide.md` | Subir daemon + frontend |
| `docs/reports/2026-05-16-git-flow-e2e-smoke-phase10.md` | Smoke E2E e execuções registadas |
| `core/validate-git-execute-gate.js` | Gate de execução |
| `scripts/daemon/lib/run-git-branch-api.js` | Prepare branch |
| `core/git-approved-run-commit.js` | Commit automático |
| `core/git-approved-run-push.js` | Push opcional |
| `core/git-approved-run-pr.js` | PR Bitbucket opcional |
