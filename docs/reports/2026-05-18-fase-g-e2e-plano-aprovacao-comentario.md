# Fase G — E2E real do fluxo de aprovação/comentário do plano

**Data:** 2026-05-18  
**Base:** Fases A–F + discovery browser  
**Execução:** `npm run smoke:plan-approval-comment-e2e` — **7/7 cenários OK**

---

## 1. Resumo executivo

Suite E2E **real** (sem mocks de geração): daemon isolado, intake skip-llm, clarify/approve/strategy, snapshot SSOT, POST comentário, validação API + disco + simulação sessionStorage (Fase F).

Playwright opcional documentado para validação visual com stack local (`SETUP_BOSS_E2E_BROWSER=1`).

---

## 2. Cenários testados

| # | Cenário | Assert principal |
|---|---------|------------------|
| 1 | Plano base v1 | tema, OOS ≥3, complexity medium, schema snapshot |
| 2 | POST comentário | botão no escopo, canonicalized, schemaVersion 2 |
| 3 | GET plan-comments | paridade com POST |
| 4 | Disco `updated-plan.json` | repair + polish no read |
| 5 | Reopen / idempotência | 2× GET → medium estável |
| 6 | sessionStorage merge | local stale (high, sem tema) → remoto vence |
| 7 | Repair automático | JSON stale em disco → GET repara |

**Task:** chat visual Integrações, tema claro/escuro, apenas visual.  
**Comentário:** botão abrir/fechar chat.

---

## 3. Asserts obrigatórios (implementados)

### Plano inicial (v1)
- `assertCanonicalChatPlan`: tema, outOfScope, medium, critérios com tema, sem meta/interno, sem duplicação complexity

### Plano atualizado (v2)
- `assertUpdatedPlanDoc` + `expectButton: true`
- botão em `whatWillBeDone`, tema/OOS/critérios preservados

### Refresh/reopen
- Dois GET consecutivos com mesmo `complexity.level === "medium"`

### SessionStorage
- `simulateBrowserTimelineMerge`: stale local → medium + OOS + tema nos critérios
- `simulatePersistUpdatedPlan`: não re-grava stale

### API / disco
- `schemaVersion: 2`, `canonicalized: true` após write/read

---

## 4. Arquivos criados

| Ficheiro | Papel |
|----------|--------|
| `scripts/smoke/plan-approval-comment-e2e.js` | Runner principal |
| `scripts/smoke/lib/plan-approval-e2e/fixtures.js` | Task + markdown chat |
| `scripts/smoke/lib/plan-approval-e2e/helpers.js` | Daemon, bootstrap run, API |
| `scripts/smoke/lib/plan-approval-e2e/assertions.js` | Asserts partilhados |
| `scripts/smoke/lib/plan-approval-e2e/session-storage-bridge*.js` | Merge Fase F (sem import .ts) |
| `e2e/playwright/plan-approval-comment.spec.mjs` | Browser opcional |
| `playwright.config.mjs` | Config Playwright |
| `frontend/.../OperationalPlanDocument.tsx` | `data-testid`, `data-plan-complexity` |
| `package.json` | `smoke:plan-approval-comment-e2e` |

**Relatório JSON:** `.setup-boss/reports/plan-approval-comment-e2e-last.json`

---

## 5. Como executar

```bash
# Suite completa (daemon efémero)
npm run smoke:plan-approval-comment-e2e

# Com daemon já a correr (dev:stack)
SETUP_BOSS_E2E_USE_EXISTING_DAEMON=1 npm run smoke:plan-approval-comment-e2e

# Browser opcional (após smoke + dev:stack)
SETUP_BOSS_E2E_BROWSER=1 SETUP_BOSS_E2E_RUN_ID=<runId> npx playwright test
```

---

## 6. Resultados da execução (2026-05-18)

```
✔ plano base (v1) canonicalizado no snapshot
✔ POST comentário gera updatedPlan canonicalizado
✔ GET plan-comments consistente com POST
✔ disco updated-plan.json canonicalizado
✔ reopen/idempotência — segundo GET mantém plano correto
✔ sessionStorage: remoto vence local stale
✔ repair automático: disco stale → GET repara

7/7 cenários OK (~4s)
```

---

## 7. Limitações conhecidas

| Limitação | Mitigação |
|-----------|-----------|
| Playwright não corre em CI por defeito | Opt-in `SETUP_BOSS_E2E_BROWSER=1`; smoke cobre runtime |
| Browser spec exige `SETUP_BOSS_E2E_RUN_ID` manual | Exportar runId do relatório ou env após smoke |
| Clarificação skip-llm + refine overwrite | Markdown rico injetado pós-refine (`writeChatPlanRefined`) |
| Não valida pixel-perfect UI | `data-testid` + texto; smoke valida presentation object |

---

## 8. Riscos residuais

- **Timing:** fetch remoto na UI real pode demorar >1s — utilizador pode ver v1 brevemente antes do merge (Fase F mitiga).
- **Projeto sem `.IA`:** intake exige projeto compliant (helper `createCompliantDemoProject`).
- **LLM desligado:** cenário não cobre classificação LLM de comentários (`skipLlm: true` no POST).

---

## 9. Próximos passos sugeridos

1. Integrar `smoke:plan-approval-comment-e2e` em CI (job dedicado ~30s).
2. Playwright com bootstrap automático de `SETUP_BOSS_E2E_RUN_ID` no `globalSetup`.
3. Screenshot golden do bloco `operational-plan-document` após comentário.
