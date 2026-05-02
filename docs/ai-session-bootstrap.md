# Setup Boss — AI Session Bootstrap

## Objetivo

Fornecer contexto suficiente para continuar o desenvolvimento do Setup Boss em um novo chat.

---

## O que é o Setup Boss

Sistema de execução assistida por IA que:

- lê contexto e task
- planeja (architect)
- executa (manual hoje)
- valida (review JSON)
- corrige automaticamente
- registra conhecimento

---

## Pipeline atual

```text
scan → architect → cursor → review → correction → knowledge
```

---

## Estado atual (IMPORTANTE)

- execução depende de etapa manual (Cursor)
- review estruturado (`review-output.json`)
- loop de correction ativo
- logs (`run-log.json`)
- limites (`MAX_CORRECTIONS`, `MAX_TOTAL_STEPS`)

---

## Próxima evolução

Implementar **local-executor** para remover etapa manual.

---

## Como trabalhar

- não assumir arquivos
- solicitar arquivos antes de alterar
- gerar código completo (sem pseudocódigo)

---

## Instrução

Após ler este documento, aguarde os próximos arquivos e instruções.