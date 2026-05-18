# Validação manual — Plano v2 completo após comentário

**Data:** 2026-05-17  
**Escopo:** Geração de Plano v2 autónomo (não delta) após comentário que altera escopo.

## Pré-requisitos

- Stack local: `npm run dev:stack`
- Run em fase de aprovação de plano com Plano v1 já visível

## Cenário principal (chat + botão)

1. Abrir run com Plano v1 semelhante a:
   - Objetivo: componente visual de chat na tela de integrações, responsivo, tema claro/escuro
   - Fora do escopo: backend, chat funcional, persistência
2. Comentar: `Criar também um botão para abrir/fechar o chat.`
3. Aguardar análise e geração do Plano v2.

### Resultado esperado

| Verificação | OK? |
|-------------|-----|
| Plano v1 permanece no histórico (versão anterior) | ☐ |
| Comentário visível entre v1 e v2 | ☐ |
| Plano v2 marcado como plano atual para aprovação | ☐ |
| Resumo/objetivo do v2 menciona chat **e** botão numa frase completa | ☐ |
| «O que será feito» lista itens do v1 **e** botão/integração | ☐ |
| «Fora do escopo» mantém exclusões do v1 | ☐ |
| Mini-tarefas cobrem chat, botão e integração (≥ 2 itens) | ☐ |
| Critério de conclusão operacional (não meta) | ☐ |
| **Ausência** de frases: «Plano atualizado após comentário», «Ajustar interface conforme comentário», «Plano v2 reflete», «complexidade recalculada após comentário» | ☐ |
| Aprovação possível usando só o Plano v2 (sem reler v1) | ☐ |

## Cenário anexos (regressão)

1. Comentar pedido de anexos com intenção estrutural vaga.
2. Responder perguntas adicionais com «apenas estrutura visual».

### Resultado esperado

- Plano v2 inclui preparação estrutural e exclui upload funcional na fase atual.
- Sem frases meta/delta.

## Testes automatizados

```bash
node --test core/generate-full-updated-plan-presentation.test.js scripts/runtime/plan-comment/generate-updated-plan-heuristic.test.js
```

Todos devem passar (7 testes).

## Notas

- Planos v2 já persistidos com texto legado são sanitizados ao ler (`normalizeUpdatedPlanPresentation` + `sanitizeUpdatedPlanPresentation`).
- OES em disco pode ser regravado com `planVersion` v2; mini-tarefas na UI vêm prioritariamente de `presentation.miniTasks` quando não há OES rico.
