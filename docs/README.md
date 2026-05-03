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

### Status atual

Fase 3 — Executor local automático (estável)

✔ Pipeline completo funcionando (scan → architect → executor → review → knowledge)  
✔ Sistema de memória `.IA` implementado  
✔ Activity History inteligente com validação de leak (NONE / SOFT / HARD)  
✔ Fallback mínimo seguro para garantir qualidade da memória  

---

## Garantias do sistema

- Nenhuma execução polui a memória do projeto
- Conteúdo bruto (TASK / Review / Executor) nunca é persistido
- Memória prioriza qualidade sobre completude
- Sistema tolerante a erro com fallback determinístico

---

## Próximos passos

- Otimização de prompts
- Execução híbrida (local + API)
