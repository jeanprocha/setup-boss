# Setup Boss — AI Session Bootstrap

## Objetivo

Fornecer contexto suficiente para uma IA entender o Setup Boss em um novo chat.

Este arquivo NÃO define uma tarefa a ser executada.  
Ele apenas carrega contexto.

---

## O que é o Setup Boss

Sistema de execução assistida por IA que:

- lê contexto e task
- planeja com Architect (`architect`)
- **`executor`** aplica alterações reais aos arquivos dentro do whitelist do run
- **review** avalia usando o código real já persistido (**`REAL FILE STATE`**) antes de só confiar nos trechos relatados textualmente pelo executor (**`executor-output`**)
- **correction** gera diretrizes curtas objetivas antes de novo **`executor`** na mesma corrida até `approved`/bloqueio/limite
- **knowledge** persiste decisões quando o ciclo bem-sucedido assim o permite

---

## Pipeline atual

```text
scan → architect → executor → review → correction → executor → knowledge
```

(Repetição de blocos **`executor`** / **`review`** conforme resultado do arquivo `review-output.json` e política do **`scripts/run.js`**.)

---

## Estado atual

- **v2.0.0 · Fase 3** — ciclo automatizado até knowledge sem depender mais de edição manual intermediária orquestrada pela mesma corrida automatizada dentro do projeto alvo
- **`executor`**: grava arquivo completo válido sempre que há `changes` bem formados vindos da API configurada pelo setup-boss próprio (**não** é um comando humano paralelo dentro do ciclo automatizado típico)
- **`review`**: sempre que possível, confere primeiro o que está realmente gravado sob `metadata.projectRoot` + paths listados (**executor-changes**) / fallback aos arquivos do architect para não validar apenas um snippet incompleto
- review estruturado em `review-output.json`
- correction acoplada ao rerun do executor até limite configurado
- auditoria longitudinal em **`run-log.json`**
- **Limites típicos** — `MAX_CORRECTIONS` e `MAX_TOTAL_STEPS`

---

## Próxima evolução planejada

**Fase 4** foca executor híbrido, parsing estruturado e validações automáticas (build/test onde existir infraestrutura). Só iniciar trabalho granular desta linha quando o usuário declarar uma atividade explícita assim.

---

## Como trabalhar

- não assumir arquivos
- não iniciar implementação sem atividade explícita
- solicitar arquivos somente quando necessário
- gerar código/documentos completos quando houver alteração

---

## Instrução ao novo chat

Após ler os arquivos iniciais, apenas confirme entendimento e pergunte qual atividade será executada.
