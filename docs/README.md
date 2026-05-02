# Setup Boss

> **v2.0.0** — Estado atual: Fase 3 — Executor local automático  
> Próximo passo: Fase 4 — Executor híbrido e validação estrutural

---

## O que é

O Setup Boss é um orquestrador de execução assistida por IA.

Ele:

- lê contexto e task
- gera plano (architect)
- executa automaticamente no projeto (`executor`)
- valida com base no estado real dos arquivos (`review`)
- corrige automaticamente (`correction` + reexecução do `executor`)
- registra knowledge persistente (`knowledge`)

---

## Pipeline

```text
scan → architect → executor → review → correction → executor → knowledge
```

(Repetição de executor/review até aprovação ou limite do loop.)

---

## Ramificações

- approved → knowledge → fim
- rejected → correction → executor → review
- blocked → parar

Fonte: `review-output.json`

---

## Estrutura

setup-boss/
  agents/
  context/
  core/
  docs/
  outputs/
  scripts/

---

## Comandos

- `npm run run <task> <projeto>`
- `npm run run continue <run-id>`
- `npm run scan`
- `npm run review`
- `npm run correction`
- `npm run knowledge`

---

## Estado atual (Fase 3)

Execução totalmente automática no repositório alvo:

- `executor` aplica alterações reais aos arquivos permitidos pelo architect
- `review` usa o estado real dos arquivos no disco como fonte de verdade (`REAL FILE STATE`), complementado pelo `executor-output`
- loop de correction operacional quando o review rejeita
- knowledge persistido no projeto (e contexto global preservado)

---

## Limitações atuais

- edição estrutural global ainda limitada (principalmente texto/gestão de arquivos completos pelo LLM)
- ausência de validação por build ou suíte de testes automatizada no pipeline
- dependência do LLM para decisões finas de código e marcação

---

## Próxima evolução (Fase 4)

Executor híbrido:

- parsing estruturado (HTML / AST onde couber)
- inserções e patches mais determinísticos onde possível
- validação via build ou testes onde o projeto permitir

