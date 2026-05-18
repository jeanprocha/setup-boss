# Correção — Plano v2 como merge completo do v1

**Data:** 2026-05-18

## Problema

O Plano v2 era gerado no servidor apenas a partir do comentário (ou de um extracto markdown não estruturado), porque:

1. `findPreviousPresentation` só lia planos v2 anteriores em `plan-comments/`, nunca o Plano v1 da UI.
2. `loadPlanExcerpt` devolvia `task-plan-refined.md` em formato `## Objetivo`, incompatível com `parsePlanExcerpt` (que esperava `Resumo:` / `O que será feito:`).
3. A API devolvia esse v2 incompleto e o cliente aceitava sem re-fundir com `basePlan`.

## Correção

| Área | Alteração |
|------|-----------|
| `core/load-base-plan-presentation.js` | Carrega v1: último v2 em cadeia, ou reconstrói a partir de markdown + `clarification-answers.json` + OES opcional |
| `core/parse-task-plan-markdown.js` | Parser partilhado para `##` do plano refinado |
| `core/parse-plan-excerpt.js` | Usa parser markdown quando o extracto tem `##` |
| `core/build-plan-excerpt-from-presentation.js` | Extracto estruturado para análise/classificação |
| `generate-updated-plan.js` | Usa `loadBasePlanPresentation` + `loadPlanExcerptForComment` |
| `plan-comment-actions.ts` | Re-gera v2 no cliente se a API devolver plano meta ou sem itens do v1 |
| `generate-full-updated-plan-presentation.js` | Mais padrões meta; botão sem referência ao comentário |

## Testes

```bash
node --test core/generate-full-updated-plan-presentation.test.js core/load-base-plan-presentation.test.js scripts/runtime/plan-comment/generate-updated-plan-heuristic.test.js
```

## Validação manual

Repetir cenário chat + botão com API ativa: o v2 deve listar chat, botão, responsividade, tema e fora do escopo do v1, sem frases «Plano atualizado após comentário» ou similares.
