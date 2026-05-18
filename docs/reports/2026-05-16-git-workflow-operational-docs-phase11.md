# Fase 11 — Documentação operacional do fluxo Git completo

**Data:** 2026-05-16  
**Tipo:** documentação (runbook operacional)  
**Relacionado:** `docs/reports/2026-05-16-git-flow-e2e-smoke-phase10.md`, fases Git 1–10

---

## Alterações realizadas

1. **`docs/git-workflow-operational-runbook.md`** — runbook único para uso diário local (fluxo, estados, UI, API, flags, smoke, troubleshooting, checklist).
2. **Referências cruzadas** em `docs/README.md` e `docs/local-runtime-usage-guide.md`.
3. **Entrada no roadmap** (`docs/setup-boss-roadmap.md`) na secção «Concluído».

**Fora de escopo (confirmado):** código funcional, UI nova, `.env.example`, merge automático, E2E browser.

---

## Arquivos alterados

| Arquivo | Acção |
|---------|--------|
| `docs/git-workflow-operational-runbook.md` | **novo** |
| `docs/reports/2026-05-16-git-workflow-operational-docs-phase11.md` | **novo** |
| `docs/README.md` | link na tabela de documentação operacional |
| `docs/local-runtime-usage-guide.md` | referência no §5 |
| `docs/setup-boss-roadmap.md` | bullet Git workflow concluído |

---

## Decisões técnicas

| Decisão | Motivo |
|---------|--------|
| Um runbook em vez de 10 mini-guias | Operador segue um único índice no dia-a-dia |
| Fases 1–10 permanecem em `docs/reports/` | Histórico de implementação preservado |
| Reinício do daemon documentado para env Git | Workers não recarregam env a quente |
| Smoke como validação recomendada | Alinha doc à Fase 10 sem duplicar script |
| Roadmap actualizado com bullet curto | Visibilidade do entregável sem reescrever STEP 4–7 |

---

## Conteúdo do runbook (índice)

1. Visão geral do fluxo (diagrama)
2. Estados `run-context.git`
3. Card «Preparar branch» (condições UI)
4. Execução manual (UI + API + commit)
5. Habilitar push (`SETUP_BOSS_GIT_AUTO_PUSH`)
6. Habilitar PR Bitbucket (`SETUP_BOSS_GIT_AUTO_PR` + credenciais)
7. Comandos smoke e testes unitários
8. Erros comuns (6 obrigatórios + tabela extra)
9. Regras de segurança
10. Checklist uso diário

---

## Testes executados

Validação documental (sem alteração de código):

- Revisão de consistência com relatórios fases 2–10 e código em `core/git-approved-run-*.js`, `validate-git-execute-gate.js`, `run-git-branch-api.js`.
- Smoke E2E já validado na Fase 10 (`npm run smoke:git-flow-e2e`) — não reexecutado nesta fase de docs.

---

## Riscos

- Variáveis Git ainda não listadas em `.env.example` — operadores devem consultar o runbook ou relatórios fases 8–9.
- PR limitado a Bitbucket; outros providers exigem PR manual.
- Documentação pode divergir se novas fases alterarem códigos de erro sem actualizar o runbook.

---

## Próximos passos

- Adicionar bloco Git em `.env.example` (opcional, produto).
- CI: job opcional `npm run smoke:git-flow-e2e`.
- Timeline `git_*` no Mission Control (mencionado na Fase 4).
- GitHub/GitLab PR e merge automático — fora de escopo actual.

---

## Resultado final

Runbook operacional publicado em `docs/git-workflow-operational-runbook.md`, com referências no README local, guia de runtime e roadmap. Fluxo Git 1–11 considerado **documentado para adopção diária local**.
