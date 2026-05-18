# Fase 1 — Fundação Git compartilhada

**Data:** 2026-05-16  
**Tipo:** implementação (fundação only)  
**Relacionado:** `docs/reports/2026-05-16-git-branch-before-execution-discovery.md`

---

## Alterações realizadas

1. Criado módulo central `core/git-exec.js` com execução Git síncrona e assíncrona padronizada (`git -C`, `windowsHide`, timeout defensivo, erros estruturados).
2. Criado `core/suggest-activity-branch.js` com geração de nome `setup-boss/<yyyyMMdd>-<slug>` (sanitização, limite ~70 chars, colisão `-2`).
3. `core/validate-project-knowledge-base.js` passou a importar `gitExecFileSync` e `isGitRepository` do módulo partilhado (comportamento de validação `.IA` inalterado).
4. `scripts/daemon/lib/project-git-register.js` passou a usar `gitSpawn` de `core/git-exec.js` (clone/fetch/pull); export `runGitSpawn` mantido como alias.
5. Testes novos: `core/git-exec.test.js`, `core/suggest-activity-branch.test.js`.

**Fora de escopo (confirmado):** API, UI, gate de execução, `run-context`, checkout/create branch, commit, push, integração com pipeline de atividade.

---

## Arquivos alterados

| Arquivo | Acção |
|---------|--------|
| `core/git-exec.js` | **novo** |
| `core/git-exec.test.js` | **novo** |
| `core/suggest-activity-branch.js` | **novo** |
| `core/suggest-activity-branch.test.js` | **novo** |
| `core/validate-project-knowledge-base.js` | delegação para `git-exec` |
| `scripts/daemon/lib/project-git-register.js` | delegação para `gitSpawn` |

---

## Decisões técnicas

| Decisão | Motivo |
|---------|--------|
| Duas APIs sync: `gitExecFileSync(args)` e `gitExecInRepoSync(projectRoot, args)` | Compatibilidade com chamadas legadas (`-C` explícito) e conveniência para leituras de repo |
| `gitSpawn` preserva códigos `git_timeout` / `git_failed` | Não alterar contrato do registo de projetos no daemon |
| Opção `timeoutMessage` em `gitSpawn` | Manter mensagem humana `HUMAN.git_timeout` no register |
| Leituras novas usam códigos `GIT_*` | Diferenciar API nova (branch/HEAD) de erros legados do daemon |
| `getCurrentBranch` retorna `null` em detached HEAD | Evitar expor string ambígua `"HEAD"` como nome de branch |
| `suggest-activity-branch` separado de `git-exec` | Função pura, sem subprocesso; testável sem Git instalado no PATH para esses casos |
| Re-export `runGitSpawn: gitSpawn` em `project-git-register` | Compatibilidade de export público existente |

### Superfície `core/git-exec.js`

- `isGitRepository(projectRoot)` → boolean (não lança)
- `getCurrentBranch(projectRoot)` → string \| null
- `getHeadCommit(projectRoot)` → SHA completo
- `gitExecFileSync`, `gitExecInRepoSync`, `gitSpawn`
- `assertSafeProjectRootForGit`, `wrapGitError`
- Timeouts por defeito: sync 30s, async 120s

### Superfície `core/suggest-activity-branch.js`

- `suggestActivityBranchName(title, { date?, prefix?, existingBranches? })`
- Helpers exportados para testes: `slugifyActivityTitle`, `sanitizeBranchSegment`, etc.

---

## Testes executados

```bash
node --test core/git-exec.test.js core/suggest-activity-branch.test.js \
  core/validate-project-knowledge-base.git-exec.test.js \
  core/validate-project-knowledge-base.test.js
```

**Resultado:** 44 testes, 0 falhas (~17.7s).

Cobertura Fase 1:

- sanitização e colisão de nome de branch
- `isGitRepository` / branch / HEAD em repo temporário
- repo não-Git → `GIT_NOT_A_REPOSITORY`
- `windowsHide` e timeout em exec sync (mock)
- `gitSpawn` → `git_failed` em checkout inválido
- regressão completa de `validate-project-knowledge-base` + teste git-exec legado

---

## Riscos

| Risco | Mitigação |
|-------|-----------|
| Regressão silenciosa no register Git | Testes de register existentes não cobrem rede; smoke manual de Connections recomendado na Fase 2 |
| `\p{M}` em `removeAccents` requer Node com Unicode property escapes | Alinhado ao Node já usado no repo |
| `getCurrentBranch` em repo sem commits | Pode falhar com `GIT_BRANCH_READ_FAILED`; fases futuras devem exigir commit ou tratar |
| Duplicação residual de `execFileSync` em testes/smokes | Fora do escopo; migração gradual |

---

## Próximos passos (roadmap acordado)

1. **Fase 2 — Prepare Branch API** — `POST/GET /runs/:id/git-branch`, persistência `run-context.git`
2. **Fase 3 — Execute Gate server-side** — `validateExecuteReadiness` + branches protegidas
3. **Fase 4 — Persistência + `branchHint`** — adapters UI
4. **Fase 5 — Testes mínimos de integração** API + gate
5. **Fase 6 — UI/HITL** — cartão «Confirmar e preparar branch»
6. **Fase 7 — Commit automático pós-review**
7. **Fases 8–10** — isolamento multi-run, runtime longo, E2E browser

---

## Conclusão

Fase 1 entrega camada Git reutilizável e sugestão de nome de branch **sem alterar o fluxo approve → strategy → execute**. O runtime de atividades comporta-se como antes; apenas a implementação interna de Git foi centralizada.
