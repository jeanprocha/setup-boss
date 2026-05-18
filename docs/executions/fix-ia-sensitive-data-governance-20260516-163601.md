# Fix — Content Policy `KNOWLEDGE_BASE_SENSITIVE_DATA` (wiser-bot-front)

**Execução:** 2026-05-16T16:36:01 (local)  
**Projeto:** `wiser-bot-front`  
**Root:** `C:\Users\pierr\setup-boss-projects\bitbucket-org-systemwiser-wiser-bot-front`  
**Âmbito:** sanitização de conteúdo em `docs/.IA` apenas (sem alteração de validators/runtime).

---

## Causa raiz

O check **Content Policy** (`validate-ia-content-policy.js`) aplica a regra `password_assignment`:

```regex
/(?:password|passwd|pwd)\s*[:=]\s*['"]?[^\s'"]{8,}/i
```

As linhas operacionais usavam o formato:

```text
Password: **REQUIRES HUMAN INPUT** ...
```

Após `Password: `, o trecho `**REQUIRES` tem ≥8 caracteres não-brancos, disparando falso positivo de credencial (`ruleIds: ["password_assignment"]`), com `code: KNOWLEDGE_BASE_SENSITIVE_DATA` e `governance: BLOCKED`.

Não havia segredos reais — apenas placeholders documentais incompatíveis com o padrão do scanner.

---

## Arquivos alterados

| Arquivo | Alteração |
|---------|-----------|
| `docs/.IA/environment/access.md` | 2 linhas (secções DB local e DEV/prod) |
| `docs/.IA/runbooks/local-dev.md` | 1 linha (secção Database Access local) |

**Relatório (setup-boss):** `docs/executions/fix-ia-sensitive-data-governance-20260516-163601.md`

---

## Exemplos removidos

| Antes (disparava scanner) | Contexto |
|---------------------------|----------|
| `Password: **REQUIRES HUMAN INPUT** (obtain from team credential store)` | `access.md` — DB local |
| `Password: **REQUIRES HUMAN INPUT**` | `access.md` — DB DEV/prod |
| `Password: **REQUIRES HUMAN INPUT** (default is postgres in local compose …)` | `local-dev.md` — DB local |

---

## Placeholders adotados

| Uso | Placeholder / formato |
|-----|------------------------|
| Credencial de equipa / prod | `` `<CONFIGURE_LOCALLY>` `` |
| Valor local (compose / env) | `` `<SET_IN_LOCAL_ENV>` `` |
| Formato seguro | `**Database password** — …` (sem `Password:` + valor longo) |

Mantidos sem alteração (não disparam `password_assignment`):

- `**REQUIRES HUMAN INPUT:**` em Bitbucket/SSH/Evolution (sem padrão `password := valor`)
- `Bearer <accessToken>`, `--build-arg VITE_*=...` (valores `...` &lt; limiar das outras regras)
- Menções genéricas a “passwords” em `standards/security.md`, `system/*.md`

---

## Varredura adicional `.IA`

Comando: `validateIaContentPolicy` sobre todos os ficheiros `.md`/`.txt`/`.json`/`.yaml` em `docs/.IA` (**excl.** `outputs/`).

| Resultado | Detalhe |
|-----------|---------|
| Antes | `policyValid: false`, `matchedFiles`: `access.md`, `local-dev.md` |
| Depois | `policyValid: true`, `secretScan.ok: true`, `ruleIds: []` |

Nenhum outro ficheiro da KB estruturada (fora `outputs/`) apresentou match de secrets.

---

## Resultado esperado da governance

| Campo | Esperado após “Revalidar” |
|-------|-------------------------|
| `governance.readiness` | `READY` ou `WARNING` (não `BLOCKED`) |
| Check Content Policy | OK |
| `policy.secretScan.ok` | `true` |
| `code` | ausente de `KNOWLEDGE_BASE_SENSITIVE_DATA` |

---

## Comandos executados

```powershell
# Scan pré/pós-fix (setup-boss core)
Set-Location "C:\Users\pierr\setup-boss-projects\bitbucket-org-systemwiser-wiser-bot-front"
node -e "… validateIaContentPolicy(process.cwd(), files) …"

# Git no projeto-alvo
git status
git diff
```

**Pós-fix (scan):** `policyValid: true`, `secretScan.ok: true`.

---

## Observações importantes

1. **Não alterar validators** — a regra `password_assignment` está correta; o fix é só no texto da `.IA`.
2. **`docs/.IA/outputs/`** — artefactos de runs; excluídos da varredura manual; podem conter dados de sessão — não versionar como KB.
3. **Commit** — alterações estão no repo `wiser-bot-front`; commit/push fica a cargo do utilizador quando a governance estiver verde na UI.
4. Referência à password local `postgres` foi removida do runbook de propósito (evitar valor hardcoded na KB); a fonte de verdade passa a ser `docker-compose-local.yaml`.
