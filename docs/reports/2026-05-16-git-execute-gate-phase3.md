# Fase 3 — Execute Gate server-side

**Data:** 2026-05-16  
**Tipo:** implementação (runtime only)  
**Relacionado:** `docs/reports/2026-05-16-git-prepare-branch-phase2.md`, `docs/reports/2026-05-16-git-branch-before-execution-discovery.md`

---

## Alterações realizadas

1. **`core/validate-git-execute-gate.js`** (novo)
   - `validateGitExecuteGate({ projectRoot, gitState })`
   - `isProtectedBranch`, constantes `PROTECTED_BRANCHES`, `GIT_BRANCH_READY`, mensagens PT
   - Em branch protegida (`main`, `master`, `develop`, `production`, `release`): exige `git.status === git_branch_ready`, `activityBranch` preenchida e `currentBranch === activityBranch`
   - Fora de branch protegida: permite execução; se `git_branch_ready` com `activityBranch`, ainda valida mismatch
   - Sempre bloqueia repositório inválido ou branch indetectável

2. **`scripts/daemon/lib/run-execute-api.js`**
   - Gate Git integrado em `validateExecuteReadiness` **antes** de `return { ok: true }` (após guards de clarificação/strategy/execução activa)
   - Lê `run-context.git` via `readRunGitState` e `projectRoot` via `resolveProjectRootForRun`
   - `deriveExecuteAvailability` server-side (mapeia resultado de `validateExecuteReadiness` para `{ canExecute, reason, message, degraded }`)

3. **`scripts/daemon/runtime-api.js`**
   - `POST /runs/:id/execute`: códigos `git_branch_required` e `git_branch_mismatch` → HTTP **409**

4. **Testes**
   - `core/validate-git-execute-gate.test.js`
   - `scripts/daemon/lib/run-execute-api.test.js` (cenários Git + ajuste de fixtures com `git init`)

**Fora de escopo (confirmado):** UI, `branchHint`, commit automático, push, PR, worktree, strategy, prepare-branch API, checkout/criação automática de branch no execute.

---

## Arquivos alterados

| Arquivo | Acção |
|---------|--------|
| `core/validate-git-execute-gate.js` | **novo** |
| `core/validate-git-execute-gate.test.js` | **novo** |
| `scripts/daemon/lib/run-execute-api.js` | gate + `deriveExecuteAvailability` |
| `scripts/daemon/lib/run-execute-api.test.js` | testes Git + fixtures |
| `scripts/daemon/runtime-api.js` | HTTP 409 para códigos Git |
| `docs/reports/2026-05-16-git-execute-gate-phase3.md` | **novo** |

---

## Decisões técnicas

| Decisão | Motivo |
|---------|--------|
| Módulo `core/` partilhável | Lógica pura, testável sem daemon; reutilizável em futuros endpoints |
| Gate só quando `projectRoot` resolvido | Sem root não há contexto Git; `triggerRunExecution` já falha com `project_not_found` depois |
| Branches protegidas case-insensitive | `MASTER` e `master` tratados igual |
| Match `activityBranch` exacto | Alinhado com nomes Git reais |
| Mismatch também fora de protegida se `git_branch_ready` | Evita executar na branch errada após preparação |
| `deriveExecuteAvailability` no backend | Paridade para testes/consumo futuro sem alterar UI |
| Sem fallback silencioso | Qualquer violação devolve `{ ok: false, code, message }` e não enfileira |
| `git_not_repository` / `git_branch_unknown` sempre bloqueiam | Segurança independente de branch protegida |

### Erros estruturados (`validateExecuteReadiness` / `triggerRunExecution`)

| Código | Mensagem |
|--------|----------|
| `git_branch_required` | Prepare a branch da atividade antes de executar. |
| `git_branch_mismatch` | A branch actual não coincide com a branch preparada para esta atividade. |
| `git_not_repository` | O projeto não é um repositório Git válido. |
| `git_branch_unknown` | Não foi possível detectar a branch actual do repositório. |

HTTP via `errorPayload`: `{ ok: false, error: { code, message } }`.

---

## Testes executados

```text
node --test core/validate-git-execute-gate.test.js scripts/daemon/lib/run-execute-api.test.js
```

| Cenário | Resultado |
|---------|-----------|
| main sem `git_branch_ready` | bloqueia `git_branch_required` |
| main com ready mas HEAD ≠ `activityBranch` | bloqueia `git_branch_mismatch` |
| HEAD === `activityBranch` + ready | permite |
| repo não-Git | bloqueia `git_not_repository` |
| `triggerRunExecution` bloqueado | fila vazia (0 jobs) |
| `deriveExecuteAvailability` em main | `reason: git_branch_required` |
| Regressão: run pronta em branch não protegida | passa |
| Regressão: enfileirar `run_execute` | passa |

**16 testes, 0 falhas** (~3,4s).

---

## Riscos

| Risco | Mitigação |
|-------|-----------|
| Projetos legados sem Git passam a falhar no execute | Esperado; intake já valida Git — operadores devem usar repo válido |
| Detached HEAD / branch vazia com `git branch --show-current` | `getCurrentBranch` usa fallback `rev-parse`; código `git_branch_unknown` |
| Operador em `develop` sem preparar branch | Bloqueado por design |
| UI ainda não mostra mensagem Git | Fase UI futura; API já devolve código/mensagem |

---

## Próximos passos

1. **Fase UI** — `deriveExecuteAvailability` no frontend + CTA «Preparar branch» + mensagens `git_*`
2. **`branchHint`** no `RunSummaryDto`
3. **Commit pós-review** (Fase discovery)
4. **Push / PR** (fora do MVP)

---

## Resumo

A Fase 3 bloqueia `POST /runs/:id/execute` no servidor quando o `projectRoot` está em branch protegida sem `run-context.git` em `git_branch_ready` com `activityBranch` alinhada ao `HEAD` actual. Não enfileira `run_execute` em bloqueio; não altera prepare-branch, strategy nem UI.
