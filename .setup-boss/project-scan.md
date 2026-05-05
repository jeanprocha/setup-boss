```markdown
# Project Scan

## Summary

Repositório Node.js do Setup Boss, um orquestrador de pipeline assistido por IA para scan, planeamento, execução por patches, revisão e consolidação de conhecimento local. O foco observado é infraestrutura de automação e operação do pipeline, não uma aplicação de negócio tradicional.

## Stack

- Frontend: Não identificado.
- Backend: Node.js.
- Database: Não identificado.
- Infra: Scripts Node.js; uso de OpenAI via API; artefactos locais em `.setup-boss/`, `.IA/` e `outputs/`.
- Package manager: npm.
- Build tool: Não identificado.

## Project Structure

Principais áreas observadas:

- `agents/` — prompts dos agents do pipeline:
  - `project-scan.md`
  - `architect.md`
  - `executor.md`
  - `reviewer.md`
  - `correction.md`
  - `knowledge.md`
  - `project-profile.md`
- `context/` — contexto global e documentação do sistema Setup Boss.
- `core/` — utilitários centrais:
  - `llm-client.js`
  - `llm-usage.js`
  - `agent-metadata.js`
  - `problem-history.js`
  - `prompt-sizes.js`
  - `run-resolver.js`
- `docs/` — documentação operacional, visão e roadmap.
- `.setup-boss/` — cache, runs e conhecimento local do sistema.
- `.IA/` — memória semântica local do projeto e outputs por corrida.
- `outputs/` — histórico de corridas e artefactos antigos.
- `scripts/` — scripts do pipeline referidos pelos comandos npm.

## Available Commands

Comandos encontrados em `package.json`:

- instalar
  - Não há script dedicado; instalação via `npm install`.
- rodar local
  - `npm run run`
  - `npm run scan`
  - `npm run architect`
  - `npm run executor`
  - `npm run review`
  - `npm run correction`
  - `npm run knowledge`
  - `npm run ensure-ia`
- build
  - Não identificado.
- testes
  - Não identificado.
- lint
  - Não identificado.
- migrations
  - Não identificado.

Observação: o `package.json` confirma os scripts, mas não explicita os argumentos esperados por cada um.

## Database

- Tipo: Não identificado.
- ORM/query builder: Não identificado.
- Migrations: Não identificadas.
- Como conectar: Não aplicável com base nas evidências recebidas.
- Observações:
  - O repositório parece ser uma ferramenta de orquestração, sem persistência de negócio evidente.
  - Não há sinais claros de banco de dados de aplicação no material fornecido.

## Environments

- Local: configurado via `.env` e `.env.example`.
- Homologação: Não identificado.
- Produção: Não identificado.
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
  - `GPT_5_4_INPUT_USD_PER_1M`
  - `GPT_5_4_OUTPUT_USD_PER_1M`
  - `GPT_5_4_MINI_INPUT_USD_PER_1M`
  - `GPT_5_4_MINI_OUTPUT_USD_PER_1M`
  - `MAX_CORRECTIONS`
  - `MAX_TOTAL_STEPS`
  - `ENABLE_SCAN_CACHE`

## Logs & Debugging

Fontes de observabilidade identificadas:

- `.setup-boss/executor-error.log` — erros do executor.
- `.setup-boss/runs/<run-id>.json` — índice de corridas.
- `.IA/outputs/<run-id>/` — artefactos de execução.
- `outputs/<run-id>/` — histórico de corridas anteriores.
- Artefactos úteis:
  - `run-log.json`
  - `run-context.json`
  - `metadata.json`
  - `review-output.json`
  - `executor-changes.json`
  - `executor-result.json`
  - `architect-input.md`
  - `architect-output.md`
  - `scan-input.md`
  - `scan-output.md`

## Validation

Formas de validação com base nas evidências disponíveis:

- `review-output.json` como decisão operacional do pipeline.
- `executor-changes.json` e `executor-result.json` para confirmar alterações aplicadas.
- `run-log.json` para rastrear etapas, duração e erros.
- `metadata.json` para uso de LLM por etapa.
- `run-context.json` para validar escopo e contexto compactado entre etapas.
- Limites do fluxo:
  - `MAX_CORRECTIONS`
  - `MAX_TOTAL_STEPS`

Não foi identificado, neste recorte, um conjunto de testes automatizados, lint ou build para validação de código-fonte da própria ferramenta.

## Risks / Unknowns

- Não foi confirmado:
  - existência de `README.md` principal;
  - existência de `docker-compose.yml` / `docker-compose.yaml`;
  - existência de `Dockerfile`;
  - framework ou runtime adicional além de Node.js;
  - scripts reais de teste, lint ou build;
  - presença de banco de dados e migrations;
  - infraestrutura de deploy.
- O conteúdo completo de `scripts/` não foi fornecido, então os parâmetros e o comportamento exato dos comandos ainda têm lacunas.
- Muitos artefactos históricos existem em `outputs/`; são úteis como evidência, mas não devem ser tratados como fonte permanente.

## Recommendations

- Confirmar o conteúdo de:
  - `README.md`
  - `scripts/`
  - `docker-compose.yml` / `docker-compose.yaml`
  - `Dockerfile`
  - arquivos de configuração adicionais
  - migrations, se existirem
- Validar os scripts npm diretamente para confirmar:
  - parâmetros esperados
  - fluxos de execução
  - artefactos gerados
- Para ampliar a precisão do scan, fornecer árvore completa ou arquivos de configuração/fonte relevantes.
- Em próximos scans, priorizar arquivos de configuração e scripts antes de concluir stack, validação e infraestrutura.
```