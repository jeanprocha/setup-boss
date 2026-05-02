# Setup Boss

> Estado atual: Fase 2 — Semi-automação (Cursor manual)  
> Próximo passo: Fase 3 — Local Executor

---

## O que é

O Setup Boss é um orquestrador de execução assistida por IA.

Ele:

- lê contexto e task
- gera plano (architect)
- executa (manual hoje)
- valida com JSON
- corrige automaticamente
- registra knowledge

---

## Pipeline

```text
scan → architect → cursor → review → correction → knowledge
```

---

## Ramificações

- approved → knowledge → fim
- rejected → correction → cursor → review
- blocked → parar

Fonte: `review-output.json`

---

## Estrutura

```
setup-boss/
  agents/
  context/
  core/
  docs/
  outputs/
  scripts/
```

---

## Comandos

- `npm run run <task> <projeto>`
- `npm run run continue <run-id>`
- `npm run scan`
- `npm run review`
- `npm run correction`
- `npm run knowledge`

---

## Estado atual

Execução ainda manual:

- gerar prompt
- rodar no Cursor
- colar resultado em `cursor-output.md`

---

## Próxima evolução

Implementar **local-executor** para automação completa.