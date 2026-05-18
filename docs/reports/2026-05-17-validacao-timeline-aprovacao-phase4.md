# Validação manual — Timeline de aprovação (Fase 4)

Data: 2026-05-17  
Ambiente: `npm run dev:stack` + run em fase de aprovação com plano operacional disponível.

## Pré-requisitos

- Runtime/daemon activo (comentários persistem em `plan-comments/`).
- Run com `task-plan-refined.md` e bundle de clarificação carregado na UI.
- Painel **Aprovação do plano** visível.

## Checklist dos 4 fluxos

### 1. Comentário que é apenas dúvida

| Passo | Acção | Resultado esperado | OK |
|-------|--------|-------------------|-----|
| 1 | Comentar: `Por que o backend não está no plano?` | Comentário na timeline | |
| 2 | Aguardar análise | Resumo: *Este comentário é uma dúvida.* + resposta Setup Boss | |
| 3 | Verificar plano | Plano v1 mantém badge **Plano atual para aprovação**; aprovar/comentar activos | |
| 4 | Histórico | Nenhum plano v2; nada apagado | |

### 2. Comentário sem impacto

| Passo | Acção | Resultado esperado | OK |
|-------|--------|-------------------|-----|
| 1 | Comentar: `Ok, entendi.` | Thread cumulativa abaixo do plano | |
| 2 | Análise | *Observação registada — o plano atual mantém-se.* | |
| 3 | Plano activo | Continua v1; acções no rodapé do plano actual | |

### 3. Comentário que altera plano directamente

| Passo | Acção | Resultado esperado | OK |
|-------|--------|-------------------|-----|
| 1 | Comentar: `Incluir suporte a upload de anexos no chat.` | Scroll para comentário/resposta | |
| 2 | Análise | *Este comentário altera o plano.* | |
| 3 | Plano v2 | Bloco **Plano atualizado** abaixo; estado *A gerar…* se demorar | |
| 4 | Plano v1 | Histórico: tracejado, *Substituído por plano atualizado*, sem acções | |
| 5 | Plano v2 activo | Badge **Plano atual para aprovação**; Aprovar / Comentário / nível execução | |
| 6 | Scroll | Foco no plano v2 após geração | |

### 4. Comentário que exige perguntas

| Passo | Acção | Resultado esperado | OK |
|-------|--------|-------------------|-----|
| 1 | Comentar: `Talvez preparar para anexos futuramente.` | Análise + resposta Setup Boss | |
| 2 | Perguntas | Formulário **Perguntas adicionais** (sem repetir lista na resposta) | |
| 3 | Responder e enviar | Inputs desaparecem; **Respostas adicionais** compactas | |
| 4 | Plano v2 | Aparece abaixo; só v2 aprovável | |
| 5 | Persistência | Recarregar página mantém thread (runtime ou sessionStorage) | |

## Critérios de aceite (Fase 4)

- [ ] Os 4 fluxos passam na UI
- [ ] Histórico nunca desaparece
- [ ] Só o plano mais recente é aprovável
- [ ] Planos antigos claramente históricos (compactos, sem acções)
- [ ] Sem JSON/cru na interface
- [ ] Estados de loading legíveis (analisando / a gerar plano / a preparar após respostas)
- [ ] Erros com mensagem amigável (sem stack trace)

## Notas de polimento aplicados (código)

- Resumos de classificação humanos (`plan-comment-classification-ui.ts`).
- Plano activo com destaque e badge; histórico compacto e tracejado.
- Scroll automático: comentário → perguntas / resposta / plano v2 (`plan-timeline-scroll.ts`).
- Mensagens de erro amigáveis na timeline.
- CSS dedicado em `frontend/styles/plan-approval-timeline.css`.

## Testes automáticos

```bash
node --test scripts/runtime/plan-comment/*.test.js
node --test frontend/lib/runtime/operational/plan-comment-classification-ui.test.ts
node --test frontend/lib/runtime/operational/plan-timeline-scroll.test.ts
node --test frontend/lib/runtime/operational/plan-active-version.test.ts
node --test frontend/lib/runtime/operational/plan-approval-timeline-storage.test.ts
```
