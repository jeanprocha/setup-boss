# Fase 10 — Smoke E2E fluxo Git completo

**Data:** 2026-05-16  
**Tipo:** smoke automatizado local (ponta a ponta)  
**Relacionado:** `docs/reports/2026-05-16-git-auto-pr-phase9.md`

---

## Alterações realizadas

1. **`scripts/smoke/git-flow-e2e-smoke.js`** — smoke offline com repo Git temporário
2. **`package.json`** — script `smoke:git-flow-e2e` (fora do `npm test`)
3. Relatório append-only neste ficheiro (secções `## Execução` por corrida)

---

## Arquivos alterados

| Arquivo | Acção |
|---------|--------|
| `scripts/smoke/git-flow-e2e-smoke.js` | **novo** |
| `package.json` | script smoke |
| `docs/reports/2026-05-16-git-flow-e2e-smoke-phase10.md` | **novo** |

---

## Decisões técnicas

| Decisão | Motivo |
|---------|--------|
| Repo temporário + índice `writeRunIndex` real | Exercita `prepareRunGitBranch` e resolvers sem tocar projetos do utilizador |
| `daemonSnapshot: { running: true }` | `validateExecuteReadiness` exige runtime activo |
| Push só com bare `origin` local | Sem rede; espelha testes da Fase 8 |
| PR com `deps` mockados | Sem credenciais Bitbucket reais |
| Flags `SETUP_BOSS_GIT_AUTO_*` respeitadas | Push/PR opcionais como em produção |
| Limpeza de `tmpdir` + entrada em `.setup-boss/runs/` | Evita lixo após smoke |

---

## Cenários cobertos

1. Repo temporário em `main`
2. Run `strategy_ready` + clarificação aprovada
3. `prepareRunGitBranch` → `git_branch_ready` + `activityBranch`
4. Execute gate bloqueia em `main`; liberta após prepare
5. `review-output.json` approved + commit automático com SHA
6. `main` HEAD inalterado (sem commit em branch protegida)
7. Push skipped (`SETUP_BOSS_GIT_AUTO_PUSH` ≠ `true`) ou push para bare local
8. PR skipped ou mock Bitbucket (`SETUP_BOSS_GIT_AUTO_PR`)

---

## Comandos

```bash
# Offline (omissão) — push e PR skipped
npm run smoke:git-flow-e2e

# Com push local (bare, sem rede)
SETUP_BOSS_GIT_AUTO_PUSH=true npm run smoke:git-flow-e2e

# Push + PR mock
SETUP_BOSS_GIT_AUTO_PUSH=true SETUP_BOSS_GIT_AUTO_PR=true npm run smoke:git-flow-e2e
```

PowerShell:

```powershell
$env:SETUP_BOSS_GIT_AUTO_PUSH="true"; $env:SETUP_BOSS_GIT_AUTO_PR="true"; npm run smoke:git-flow-e2e
```

---

## Testes executados

```bash
npm run smoke:git-flow-e2e
# OK — push/PR skipped (flags off)

$env:SETUP_BOSS_GIT_AUTO_PUSH="true"; $env:SETUP_BOSS_GIT_AUTO_PR="true"; npm run smoke:git-flow-e2e
# OK — push bare local + PR mock Bitbucket
```

Resultados detalhados nas secções append-only abaixo.

---

## Riscos

- Smoke depende de `git` no PATH.
- `writeRunIndex` regista corrida em `.setup-boss/runs/` durante a execução (removida no `finally`).
- Push/PR com flags ligadas exigem commit bem-sucedido e remote bare quando aplicável.

---

## Próximos passos

- Integrar smoke em CI opcional (job separado, não no `npm test`).
- UI E2E browser, merge automático e worktree permanecem fora de escopo.

---

## Registo de execuções (append-only)

Registo append-only de execuções do smoke `scripts/smoke/git-flow-e2e-smoke.js`.

## Execução 2026-05-17T01:19:09.682Z

| Etapa | Resultado |
|-------|-----------|
| execute gate bloqueia em main sem branch preparada | ok |
| prepare branch cria activityBranch | ok |
| execute gate permite após prepare | ok |
| review approved + commit gera SHA | ok |
| branch protegida main não recebeu commit direto | fail |

- **runId:** `20260516-747143-git-flow-e2e-smoke`
- **push:** false
- **PR:** false
- **Resultado:** falha
- **Erro:** Command failed: git checkout main
error: Your local changes to the following files would be overwritten by checkout:
	docs/.IA/outputs/20260516-747143-git-flow-e2e-smoke/run-context.json
Please commit your changes or stash them before you switch branches.
Aborting


## Execução 2026-05-17T01:19:19.192Z

| Etapa | Resultado |
|-------|-----------|
| execute gate bloqueia em main sem branch preparada | ok |
| prepare branch cria activityBranch | ok |
| execute gate permite após prepare | ok |
| review approved + commit gera SHA | ok |
| branch protegida main não recebeu commit direto | ok |
| push skipped com flag off | ok |
| PR skipped com flag off | ok |

- **runId:** `20260516-756491-git-flow-e2e-smoke`
- **push:** desligado
- **PR:** desligado
- **Resultado:** sucesso

## Execução 2026-05-17T01:19:38.347Z

| Etapa | Resultado |
|-------|-----------|
| execute gate bloqueia em main sem branch preparada | ok |
| prepare branch cria activityBranch | fail |

- **runId:** `20260516-776867-git-flow-e2e-smoke`
- **push:** true
- **PR:** true
- **Resultado:** falha
- **Erro:** fatal: couldn't find remote ref main

false !== true


## Execução 2026-05-17T01:20:12.255Z

| Etapa | Resultado |
|-------|-----------|
| execute gate bloqueia em main sem branch preparada | ok |
| prepare branch cria activityBranch | ok |
| execute gate permite após prepare | ok |
| review approved + commit gera SHA | ok |
| branch protegida main não recebeu commit direto | ok |
| push para bare local com flag on | ok |
| PR via mock Bitbucket com flag on | ok |

- **runId:** `20260516-809125-git-flow-e2e-smoke`
- **push:** habilitado
- **PR:** habilitado (mock)
- **Resultado:** sucesso
