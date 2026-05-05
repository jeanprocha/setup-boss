# AI Rules

## Regras obrigatórias

- Não alterar arquitetura sem aprovação explícita.
- Não alterar arquivos fora do escopo definido pelo Architect.
- Não inventar contexto.
- Consultar esta pasta antes de planejar alterações.
- Atualizar `08-activity-history.md` ao fim de atividades executadas.
- Registrar decisões permanentes em `07-decisions.md` quando necessário.
- Registrar problemas recorrentes em `09-known-issues.md` quando necessário.

## Restrições

- Não tratar output temporário como fonte de verdade permanente.
- Não misturar documentação do Setup Boss com documentação local do projeto.

## Fonte local de verdade

A pasta `.IA` representa a base semântica local do projeto.

## Project Scan Inicial

```markdown
# Project Scan

## Summary

Projeto Node.js para orquestração de um pipeline de IA sobre projetos-alvo, com etapas de scan, architect, executor, review, correction e knowledge. O repositório também mantém artefactos de execução e documentação operacional do próprio Setup Boss.

## Stack

- Frontend: Não identificado neste repositório.
- Backend: Node.js
- Database: Não identificado
- Infra: Scripts locais de pipeline; artefactos em `.setup-boss/`, `.IA/` e `outputs/`
- Package manager: Não confirmado pelo conteúdo fornecido; há `package.json` e scripts npm.
- Build tool: Não identificado

## Project Structure

Principais áreas observadas:

- `agents/` — prompts dos agents do pipeline (`architect`, `executor`, `reviewer`, `correction`, `knowledge`, `project-scan`).
- `context/` — documentação global do sistema Setup Boss.
- `core/` — utilitários centrais do orquestrador:
  - `llm-client.js`
  - `llm-usage.js`
  - `agent-metadata.js`
  - `problem-history.js`
  - `prompt-sizes.js`
  - `run-resolver.js`
- `docs/` — documentação operacional e de evolução.
- `.setup-boss/` — cache e metadados globais do sistema.
- `.IA/` — memória/outputs da execução no projeto.
- `outputs/` — histórico local de corridas e artefactos gerados.
- `scripts/` — referidos indiretamente nos scripts npm, mas não listados no tree fornecido.

## Available Commands

Comandos encontrados em `package.json`:

- instalar
  - Não há script dedicado. A instalação depende do gestor de pacotes do ambiente.
- rodar local
  - `npm run run <task.md> <caminho-projeto>`
  - `npm run scan <caminho-projeto>`
  - `npm run architect <task.md> <caminho-projeto>`
  - `npm run executor <runId>`
  - `npm run review <runId>`
  - `npm run correction <runId>`
  - `npm run knowledge <runId>`
  - `npm run ensure-ia <caminho-projeto>`
- build
  - Não identificado
- testes
  - Não identificado
- lint
  - Não identificado
- migrations
  - Não identificado

## Database

- Tipo: Não identificado
- ORM/query builder: Não identificado
- Migrations: Não identificadas
- Como conectar: Não aplicável com base no conteúdo visto
- Observações:
  - O repositório analisado parece ser uma ferramenta de orquestração, não uma aplicação com persistência própria evidente.

## Environments

- Local: configurado via `.env` / `.env.example`
- Homologação: Não identificado
- Produção: Não identificado
- Variáveis relevantes:
  - `OPENAI_API_KEY`
  - `OPENAI_MODEL`
  - `ARCHITECT_MODEL`
  - `EXECUTOR_MODEL`
  - `REVIEW_MODEL`
  - `CORRECTION_MODEL`
  - `KNOWLEDGE_MODEL`
  - `SCAN_MODEL`
  - `ENSURE_IA_MODEL`
  - `SEMANTIC_IA_MODEL`
  - variáveis de preço por modelo (`*_INPUT_USD_PER_1M`, `*_OUTPUT_USD_PER_1M`)
  - `MAX_CORRECTIONS`
  - `MAX_TOTAL_STEPS`
  - `ENABLE_SCAN_CACHE`

## Logs & Debugging

Fontes de observabilidade identificadas nos docs e tree:

- `outputs/<run-id>/run-log.json` — passos da corrida, durações e avisos/erros.
- `outputs/<run-id>/metadata.json` — uso de LLM por etapa (`llm_usage`, `llm_usage_total`).
- `outputs/<run-id>/run-context.json` — contexto compacto da corrida.
- `outputs/<run-id>/review-output.json` — decisão oficial do review.
- `outputs/<run-id>/executor-changes.json` / `executor-result.json` — evidência de patches aplicados.
- `console`/terminal — scripts parecem emitir logs por etapa (`[SCAN]`, `[ARCHITECT]`, `[EXECUTOR]`, etc.).

## Validation

Formas de validação com evidência no material fornecido:

- `review-output.json` como decisão operacional do fluxo.
- `executor-changes.json` e `executor-result.json` para confirmar alterações aplicadas.
- Limites e gates do pipeline:
  - `MAX_CORRECTIONS`
  - `MAX_TOTAL_STEPS`
- Quando disponível, comparação entre artefactos de `outputs/<run-id>/` e o estado real dos ficheiros alterados.
- Não há evidência de testes automatizados, lint ou build neste recorte.

## Risks / Unknowns

- Falta evidência de:
  - `README` do projeto alvo além do próprio Setup Boss
  - `docker-compose`
  - `Dockerfile`
  - framework de execuçã
