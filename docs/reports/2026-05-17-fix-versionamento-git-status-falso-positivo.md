# Relatório — Correção falso positivo “working tree suja” no Versionamento

**Data:** 2026-05-17  
**Tipo:** append-only  
**Escopo:** Bloqueio incorreto em `POST /runs/:id/git-branch` por alterações locais; mensagem de erro detalhada

---

## Resumo

O Versionamento bloqueava com “alterações fora de `docs/.IA`” mesmo quando o utilizador via `git status` “limpo” no `wiser-bot-front`. A causa não era `projectRoot` errado nem paths Windows mal normalizados: o Git real reportava ficheiros em `docs/.IA` (permitidos) e a pasta **`.setup-boss/`** na raiz do projeto (inbox Setup Boss), que **não** estava na lista de caminhos ignorados pela validação.

---

## Causa raiz

1. **`projectRoot` correto** — Resolvido a partir do índice da corrida (ex.: `C:\Users\pierr\setup-boss-projects\bitbucket-org-systemwiser-wiser-bot-front`), não o repo `setup-boss`.
2. **`git status --porcelain` não estava vazio** no projeto-alvo:
   - `M docs/.IA/...` — já permitido por `isAllowedDirtyPathForPrepare`.
   - `?? .setup-boss/` — **bloqueava**, porque a regra só aceitava `docs/.IA`, output da corrida e prefixos relacionados.
3. **Percepção de “working tree clean”** — `git status` sem `-u` ou foco só em tracked pode ocultar untracked; `git status -uno` ainda mostrava modificados em `docs/.IA`. O Setup Boss usa porcelain completo (inclui untracked).
4. **Bug secundário na mensagem** — `blockingEntries` guardava `filePath` mas o formatador lia `path`, listando ficheiros como `undefined` na UI.

---

## Correção aplicada

| Alteração | Detalhe |
|-----------|---------|
| Permitir `.setup-boss/` | Constante `SETUP_BOSS_PROJECT_DIR` e ramo em `isAllowedDirtyPathForPrepare` |
| Inspeção estruturada | `inspectWorkingTreeForGitPrepare` + `formatDirtyWorktreeBlockMessage` (projeto, `git -C`, output ignorado, regra, lista de ficheiros, sugestão) |
| Resposta API | `data.dirtyWorktree` em 409 `git_dirty_worktree` |
| Workspace | `workspace-run-git-api.js` usa a mesma inspeção/mensagem |
| UI | `whitespace-pre-wrap` no erro do `VersioningPhasePanel` para mensagens multilinha |
| Testes | `.setup-boss` + `docs/.IA` não bloqueiam; `src-dirty.txt` bloqueia com ficheiro na mensagem |

**Não alterado:** fluxos de Inicialização, plano, aprovação, execução, review, finalização; UI geral; sem mocks; alterações reais fora das pastas permitidas continuam a bloquear.

---

## Arquivos alterados

| Arquivo | Alteração |
|---------|-----------|
| `scripts/daemon/lib/run-git-branch-api.js` | `.setup-boss` permitido; inspeção/mensagem; fix `path` em `blockingEntries` |
| `scripts/daemon/lib/workspace-run-git-api.js` | Mesma inspeção no prepare workspace |
| `scripts/daemon/lib/run-git-branch-api.test.js` | Testes clean-ia e dirty com mensagem |
| `frontend/components/features/planning/VersioningPhasePanel.tsx` | `whitespace-pre-wrap` em erros |

---

## Evidência — git status usado

Comando equivalente ao daemon: `git -C <projectRoot> status --porcelain`

**Antes da correção** (projeto real da corrida `20260517-105727-...`):

```
 M docs/.IA/...
?? .setup-boss/
```

`inspectWorkingTreeForGitPrepare` → `blocked: true` (entrada `.setup-boss/`).

**Depois da correção** (mesmo `projectRoot` / `outputDir`):

```
blocked false entries 0
```

**Teste sintético dirty** (`src-dirty.txt` na raiz):

```
blocked true
Ficheiros: [?? ] src-dirty.txt
```

---

## Como validar

1. No projeto-alvo: `git -C "<projectRoot>" status --porcelain` — confirmar se há paths fora de `docs/.IA`, output da corrida e `.setup-boss`.
2. `node --test scripts/daemon/lib/run-git-branch-api.test.js` — 8 testes verdes.
3. Na UI, fase Versionamento na corrida afetada — confirmar que não bloqueia quando só há `docs/.IA` e `.setup-boss`.
4. Criar ficheiro de teste fora das pastas permitidas (ex. `touch src-test-dirty.txt`) — confirmar 409 com lista de ficheiros na mensagem.

---

## Critérios de aceite

| Critério | Estado |
|----------|--------|
| `git status` real limpo (só pastas permitidas) → não bloqueia | OK |
| Alterações reais fora das pastas → erro lista ficheiros | OK |
| Validação no `projectRoot` da corrida | OK (inalterado, confirmado) |
| Sem mocks novos | OK |

---

## Limitações

- **“Limpo” é relativo à regra do Setup Boss**, não idêntico a `git status` sem flags: untracked em `src/`, `package.json`, etc. continuam a bloquear.
- **Modificações em `docs/.IA` fora do output da corrida** são ignoradas de propósito (artefatos de planeamento); não equivalem a “só código da feature versionado”.
- **Workspace multi-projeto** — cada projeto é validado separadamente; um projeto sujo bloqueia só esse item na lista.
- **Daemon em execução** — reiniciar ou recarregar processo Node após deploy do patch para servir a nova lógica.
