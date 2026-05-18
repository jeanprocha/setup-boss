# Fix — Janelas Git no Windows (`KNOWLEDGE_BASE_UNTRACKED`)

**Timestamp:** 2026-05-16T22:45:00 (local)  
**Relacionado:** `docs/executions/untracked-governance-spawn-loop-discovery-20260516-223500.md`

---

## Objetivo

Eliminar rajada de janelas/terminais no Windows durante validação `.IA` (governance + intake) no ramo untracked/ignored, sem alterar códigos de erro nem UI.

---

## Alterações

### 1. `windowsHide: true` em todas as chamadas Git

Ficheiro: `core/validate-project-knowledge-base.js`

| Helper | Comando Git |
|--------|-------------|
| `gitExecFileSync` | wrapper único com `GIT_EXEC_FILE_OPTS = { windowsHide: true }` |
| `isGitRepository` | `git -C <root> rev-parse --git-dir` |
| `gitLsFilesDocsIa` | `git -C <root> ls-files -- docs/.IA` |
| `gitCheckIgnoredPathsSet` | `git -C <root> check-ignore -- <paths…>` |

**Antes:** 3 sites com `execFileSync("git", …)` sem `windowsHide`.  
**Depois:** todas passam por `gitExecFileSync`.

### 2. `check-ignore` em lote

| Antes | Depois |
|-------|--------|
| Até 24× `git check-ignore -q -- <file>` em `classifyDocsIaGitIgnoreState` | **1×** `git check-ignore -- <file1> <file2> …` |
| `isGitPathIgnored` | Delega para `gitCheckIgnoredPathsSet` com um path |

Função nova: `gitCheckIgnoredPathsSet(projectRootAbs, relPosixList)` → `Set` de paths ignorados (stdout do Git, normalizado POSIX).

Comportamento preservado:

- `KNOWLEDGE_BASE_UNTRACKED` — pasta local, não tracked, com ficheiros adicionáveis
- `KNOWLEDGE_BASE_IGNORED` — todos os ficheiros amostrados ignorados
- `KNOWLEDGE_BASE_MISSING` — sem `docs/.IA` (sem alteração no ramo Git)

**Processos Git por validação UNTRACKED (árvore populada):** ~26 → **3** (`rev-parse` + `ls-files` + 1× `check-ignore`).

---

## Ficheiros alterados

| Ficheiro | Alteração |
|----------|-----------|
| `core/validate-project-knowledge-base.js` | `gitExecFileSync`, `gitCheckIgnoredPathsSet`, batch ignore, `windowsHide` |
| `core/validate-project-knowledge-base.git-exec.test.js` | **Novo** — mock `execFileSync` + teste batch com Git real |
| `package.json` | Incluir `git-exec.test.js` no script `npm test` |

---

## Testes executados

```bash
node --test core/validate-project-knowledge-base.test.js core/validate-project-knowledge-base.git-exec.test.js
```

| Resultado | Detalhe |
|-----------|---------|
| **31/31 pass** | Inclui UNTRACKED, IGNORED, MISSING e testes de seed/structure existentes |
| Mock | Todas as chamadas `git` com `opts.windowsHide === true` |
| Mock | Exactamente **1** chamada `check-ignore` com ≥2 paths no cenário 2 ficheiros |
| Real | `gitCheckIgnoredPathsSet` distingue `index.md` em exclude vs `other.md` |

---

## Validação manual (checklist)

> O agente **não** observa a área de trabalho; executar localmente após reiniciar stack.

1. Parar e `npm run dev:stack` (ou reiniciar só o daemon/runtime-api).
2. Mission Control → projeto com `docs/.IA` **untracked** (ex.: `wiser-bot-front`).
3. **Nova Atividade** → card governance mostra erro *não versionada* / `KNOWLEDGE_BASE_UNTRACKED`.
4. Confirmar **nenhuma** janela `cmd`/Git a piscar ao abrir o painel.
5. Clicar **Revalidar** uma vez → erro mantém-se, **sem** rajada de janelas.
6. (Opcional) **Iniciar execução** → pre-run bloqueado com mesmo código, sem janelas.

---

## Fora de escopo (não feito)

- UI, polling, auto-fix Git, novas regras `.IA`, cache de governance, timeout extra no `execFileSync`.

---

## Exports novos (uso interno / testes)

- `gitExecFileSync`
- `gitCheckIgnoredPathsSet`
