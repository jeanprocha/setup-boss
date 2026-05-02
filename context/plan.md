# Setup Boss — Plano

## Pipeline atual

1. Project Scan
2. Architect
3. Cursor
4. Review
5. Correction (loop)
6. Knowledge

## Fluxo

task → scan → architect → cursor → review  
→ aprovado → knowledge  
→ não aprovado → correction → cursor → review (loop)

## Estado atual

- pipeline funcional
- loop de correção ativo
- knowledge persistente por projeto
- orquestração via run.js

## Próximas evoluções

- remover dependência manual do Cursor
- tornar reviewer determinístico
- melhorar detecção de status
- reduzir fragilidade de parsing
- padronizar critérios de aceite nas tasks

## Riscos

- dependência de formato textual
- ambiguidades de linguagem da IA
- tarefas mal definidas geram loops desnecessários