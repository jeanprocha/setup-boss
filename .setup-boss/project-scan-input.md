# Agent: Project Scan
# Version: 1.2.0
# Updated: 2026-05-02

Atue como Project Scan Agent dentro do pipeline Setup Boss.

Seu papel é analisar um projeto real e gerar um relatório técnico objetivo para alimentar as próximas etapas.

---

## Objetivo

Identificar:

- stack principal
- estrutura do projeto
- comandos disponíveis
- formas de execução
- formas de validação
- banco de dados
- infraestrutura
- padrões relevantes
- riscos iniciais
- pontos desconhecidos

---

## Responsabilidade única

Gerar contexto técnico inicial do projeto com base em evidências.

---

## Input esperado

Receba acesso ou conteúdo de:

- estrutura de pastas
- `package.json`
- `README`
- `docker-compose`
- `Dockerfile`
- arquivos de configuração
- migrations
- `.env.example`
- scripts disponíveis
- nomes de diretórios e arquivos relevantes

---

## Output esperado

Entregue um relatório contendo:

- resumo do projeto
- stack identificada
- estrutura principal
- comandos disponíveis
- banco de dados
- ambientes
- logs e debugging
- formas de validação
- riscos e desconhecidos
- recomendações

---

## Regras invioláveis

- NÃO propor implementação de feature.
- NÃO gerar código.
- NÃO alterar arquivos.
- NÃO assumir stack sem evidência.
- NÃO tratar inferência como fato confirmado.
- NÃO ignorar arquivos de configuração relevantes.
- NÃO misturar contexto global do Setup Boss com contexto local do projeto.
- NÃO substituir o Architect.
- NÃO decidir escopo da task.

---

## Fontes esperadas

Considere informações vindas de:

- `package.json`
- `README`
- `docker-compose.yml`
- `docker-compose.yaml`
- `Dockerfile`
- arquivos `.env.example`
- arquivos de configuração
- migrations
- estrutura de pastas
- scripts disponíveis
- nomes de diretórios e arquivos

---

## Formato obrigatório

Siga esta estrutura (substituir conteúdo analítico real):

```markdown
# Project Scan

## Summary

Resumo curto do projeto.

## Stack

- Frontend:
- Backend:
- Database:
- Infra:
- Package manager:
- Build tool:

## Project Structure

Principais pastas e responsabilidades.

## Available Commands

Comandos encontrados para:

- instalar
- rodar local
- build
- testes
- lint
- migrations

## Database

- Tipo:
- ORM/query builder:
- Migrations:
- Como conectar:
- Observações:

## Environments

- Local:
- Homologação:
- Produção:
- Variáveis relevantes:

## Logs & Debugging

Onde procurar logs e como debugar.

## Validation

Como validar mudanças com segurança.

## Risks / Unknowns

Pontos não confirmados ou riscos.

## Recommendations

Próximos passos recomendados para melhorar o contexto do projeto.
```


## SOURCE OF TRUTH HIERARCHY

setup-boss/context = verdade global do sistema
setup-boss/docs = documentação operacional
project/.setup-boss = verdade técnica local do pipeline
project/.IA = verdade semântica local do projeto
project/.IA/outputs/<run-id> = histórico da execução

## SOURCE OF TRUTH RULES

- Use setup-boss/context apenas como verdade global do sistema.
- Use setup-boss/docs apenas como documentação operacional.
- Use project/.setup-boss como verdade técnica local do pipeline.
- Use project/.IA como base semântica persistente do projeto.
- Não misture knowledge global com knowledge local do projeto.
- Não escreva informações locais do projeto em setup-boss/context.
- Não trate outputs antigos como fonte de verdade permanente.



## GLOBAL SYSTEM CONTEXT: decisions.md

# Setup Boss — Decisions

## Decisão: Pipeline estruturado (v2.0.0)

Ordem oficial das etapas:

```text
scan → architect → run-context.json
→ executor (PATCH)
→ review
→ [correction → executor → review]*
→ knowledge
```

- **correction** não corre em toda a execução: entra quando o **review** indica ciclo corretivo (**`rejected`** com **`requires_correction`**, conforme consumo em **`scripts/run.js`**).
- A decisão oficial do **review** para automação é sempre **`review-output.json`** (ver decisão “Review JSON-first”).

Ramificações a partir do **review**:

- **`status: approved`** → **knowledge** → fim do fluxo feliz.
- **`status: rejected`** com caminho de correção → **correction** → **executor** → novo **review** — até **`approved`**, **`blocked`**, ou limites (**`MAX_CORRECTIONS`**, **`MAX_TOTAL_STEPS`**).
- **`status: blocked`** → parar; não seguir o loop típico de correction até o bloqueio ser resolvido fora do pipeline ou a task/definição mudar.

**Motivo:** previsibilidade, auditoria em artefactos e redução de ambiguidade vs. texto livre.

---

## Decisão: run-context como base do sistema

- **`run-context.json`** é gerado pelo **architect** e persiste **`allowed_files`**, resumo da task, critérios, foco de review e metadados de execução (**`scripts/architect.js`**, função `buildRunContext`).
- Etapas posteriores (**executor**, **review**, **correction**, **knowledge**) **preferem** este ficheiro para reduzir tokens e evitar colar prompts completos legados quando o ficheiro é válido.

**Motivo:** custo, consistência e substituição de “prompts gigantes” por contrato estável.

---

## Decisão: Executor por PATCH (validação em código)

- Resposta estruturada com **`changes[]`** onde cada item tem **`operation: "patch"`**, **`path`**, **`search`**, **`replace`**, **`reason`**.
- **`search`** deve ser **único** no ficheiro alvo; caso contrário a aplicação falha com erro explícito (**`scripts/executor.js`**).
- Escopo limitado a **`allowed_files`** derivados do **`run-context`** (ou fallback legado a partir da secção “Arquivos prováveis” do architect se não houver lista utilizável).
- Não é o modo atual do sistema tratar “reescrever ficheiro inteiro” como operação válida do executor.

**Motivo:** alterações em disco controladas e auditáveis.

---

## Decisão: Separação sistema vs projeto

- **setup-boss** (este repositório) = sistema e scripts.
- **`.setup-boss/`** no projeto alvo = contexto técnico local (scan, knowledge).
- **`.IA/`** no projeto alvo = memória semântica e **`outputs/<run-id>/`** por corrida.

**Motivo:** separação de responsabilidades e histórico por projeto.

---

## Decisão: Knowledge por projeto

Cada projeto mantém o seu **`.setup-boss/knowledge-base.md`** (append na etapa **knowledge** quando aplicável).

**Motivo:** aprendizado contextualizado ao stack e convenções do repo alvo.

---

## Decisão: Loop de correção

**correction** gera **`correcti

[truncated global_context: original_chars=10280 max_chars=6000]

 conhecimento local do projeto.

---

## Estado atual

- **Fase 3 concluída**: executor automático, **sem** dependência de edição manual como passo oficial do pipeline.
- **`run-context.json`** reduz contexto entre etapas em relação a prompts monolíticos.
- Loop de correction integrado em **`scripts/run.js`** (`MAX_CORRECTIONS`, `MAX_TOTAL_STEPS`).

---

## Próximas evoluções (roadmap STEP 4–6)

- Optimização mais agressiva de tokens entre etapas.
- Fallback inteligente (local vs API) onde couber.
- Executor híbrico (mais determinístico + PATCH onde necessário).

---

## Riscos conhecidos

- Task mal definida → mais voltas no ciclo correction/executor/review.
- PATCH com **`search`** ambíguo ou inexistente → falha de aplicação registada nos artefactos do executor.
- Métricas **`llm_usage`** dependem da API devolver `usage` por chamada.


## GLOBAL SYSTEM CONTEXT: spec.md

# Setup Boss — Spec

## Objetivo

Sistema de execução de tarefas assistido por IA, com pipeline estruturado, **artefactos persistidos** e **executor automático** por **PATCH** no projeto alvo (v2.0.0).

O sistema deve:

- compreender o projeto automaticamente (**scan**)
- planear antes de executar (**architect**) e fixar contexto compacto (**`run-context.json`**)
- aplicar alterações no disco via **executor** (**PATCH** validado, **`allowed_files`**)
- validar com **review** estruturado (**`review-output.json`**)
- iterar com **correction** quando o review exigir
- aprender após execução bem-sucedida (**knowledge**)

---

## Escopo

O Setup Boss cobre:

- análise de projeto (**scan**)
- planeamento e geração de **`run-context.json`** (**architect**)
- **execução automática** no disco (**executor** — não reescrita integral de ficheiro pela resposta; schema **`operation: patch`**)
- validação (**review**)
- iteração (**correction** → **executor** → **review**)
- aprendizado (**knowledge**)

---

## Fora de escopo

- substituição do **review** por meras afirmações em texto livre (a decisão operacional do review é **`review-output.json`**, conforme `scripts/review.js`)
- automação de deploy ou CI sem integração explicitamente acrescentada
- garantia de build/test automático sem infraestrutura no projeto alvo (fase futura no roadmap)

---

## Princípios

- **`run-context.json`** como base de contexto reduzido entre **architect**, **executor**, **review**, **correction** e **knowledge** quando válido
- simplicidade de contrato: **PATCH** com **`search`** único no ficheiro
- evidência em disco (**executor-changes.json**, ficheiros alterados) antes de conclusões do review
- aprendizado persistente separado de logs de corrida (**knowledge** vs **run-log**)

---

## Invariantes do executor (código)

- Operação suportada no schema atual: **`patch`**.
- Cada **`search`** deve ocorrer **exactamente uma vez** no conteúdo atual do ficheiro.
- Paths de alteração limitados a **`allowed_files`** (e validações de segurança de caminho em **`scripts/executor.js`**).




## OPERATIONAL DOC: agents-governance.md

# Setup Boss — Agents governance

## Objetivo

Regras para criar, manter e desativar **agents** (ficheiros Markdown em `agents/` consumidos pelos scripts).

Objetivo: evitar proliferação, sobreposição de papéis e pipeline imprevisível.

---

## Princípio central

Um agent novo só entra se **melhorar** o pipeline de forma clara.

Agents demais aumentam custo (tokens), ambiguidade e superfície de manutenção.

---

## Distinção importante

- **Agent** — texto de sistema/papel carregado por um script (`loadAgent`, etc.).
- **Artefacto de pipeline** — JSON gerado por código (ex.: **`run-context.json`**). Não é um agent; não deve ser confundido com um novo ficheiro em `agents/` sem necessidade.

---

## Regra oficial para criação de agents

Um novo agent só é aceitável se:

1. Responsabilidade **única**
2. Reduz repetição **real** no pipeline (ou custo mensurável)
3. Input bem definido (ficheiros, secções, JSON)
4. Output bem definido (Markdown e/ou schema JSON quando aplicável)
5. Critério de sucesso objetivo
6. Não duplica um agent existente
7. Não existe só para “organizar texto”
8. Não existe só por preferência estética

Se falhar qualquer ponto → não criar.

---

## Checklist antes de criar um novo agent

```text
1. Qual problema real resolve?
2. Esse problema já apareceu mais de uma vez?
3. Qual agent atual não cobre isso?
4. Qual é a responsabilidade única?
5. Qual input exato?
6. Qual output exato?
7. Como saber que funcionou?
8. O que acontece se não existir?
9. Reduz ou aumenta complexidade?
10. Poderia ser só uma secção num agent existente?
```

---

## Alinhamento com o código atual

- O pipeline oficial passa por **run-context**, **executor PATCH**, review JSON e correction; prompts dos agents devem permanecer **compatíveis** com os schemas e validações dos scripts (alterações exigem mudança coordenada em código + doc).
- Mudanças que só “empurrem mais contexto” para o modelo sem ganho verificável tendem a **aumentar custo** — preferir evolução em **artefactos** (`run-context`) e **código**, não só texto novo em `agents/`.


## OPERATIONAL DOC: agents.md

# Setup Boss — Lista oficial de agents

## Objetivo

Registrar agents do Setup Boss, responsabilidades e relação com o pipeline e os artefatos em disco.

---

## Agents ativos (prompts em `agents/`)

| Agent | Ficheiro | Responsabilidade única |
|-------|----------|-------------------------|
| Project Scan | `project-scan.md` | Relatório técnico inicial do projeto (stack, estrutura, riscos). Usado pelo fluxo de scan. |
| Architect | `architect.md` | Plano antes de tocar em ficheiros; saída validada em Markdown com secções obrigatórias; alimenta **run-context.json**. |
| Executor | `executor.md` | Aplicar alterações autorizadas via **PATCH** (`search`/`replace`) só em paths permitidos. |
| Reviewer | `reviewer.md` | Validar entrega contra task/nível de aceite; saída JSON + relatório Markdown. |
| Correction | `correction.md` | Instruções objetivas para o próximo executor após review reprovado. |
| Knowledge | `knowledge.md` | Atualização concisa de knowledge reutilizável (não é log da corrida). |

---

## Agent auxiliar (fora do ciclo `run` principal)

| Uso | Ficheiro | Nota |
|-----|----------|------|
| Bootstrap / `.IA` por IA | `project-profile.md` | Usado por `ensure-ia.js` em modos que chamam LLM (ex.: `--full`, enriquecimento semântico após run aprovado). Não é uma etapa nomeada igual às do `run.js`. |

---

## Legado

| Ficheiro | Nota |
|----------|------|
| `cursor-template.md` | **Legado** — não entra no `npm run run`. Usado por `scripts/cursor.js` (compatibilidade). O fluxo oficial é **executor** + PATCH. |

---

## Pipeline oficial e artefatos

```text
scan → architect → run-context.json
→ executor (PATCH)
→ review
→ [correction → executor → review]*
→ knowledge
```

- **run-context.json** não é um agent; é **JSON** gerado pelo script **architect** a partir da task e do output do architect.
- Cada agent acima corresponde a um script que monta o prompt e chama o modelo via `core/llm-client.js` (modelo por etapa).


## OPERATIONAL DOC: ai-session-bootstrap.md

# Setup Boss — AI Session Bootstrap

## Objetivo

Dar contexto mínimo para uma IA trabalhar num novo chat sobre o Setup Boss.

Este ficheiro **não** é uma task. Não ordena implementação.

---

## O que é

Orquestrador de execução sobre um **projeto alvo** com:

- **Scan** — contexto técnico do projeto; pode usar cache (**`ENABLE_SCAN_CACHE`**).
- **Architect** — plano, enforcement e geração de **`run-context.json`** (resumo da task, critérios de aceite, **`allowed_files`**, foco de review).
- **Executor** — alterações por **PATCH** no schema atual: **`operation: patch`**, **`search`** (uma ocorrência no ficheiro), **`replace`**; apenas paths em **`allowed_files`**; validação em **`scripts/executor.js`** (não reescreve ficheiro inteiro pela resposta do modelo).
- **Review** — **`review-output.json`**; quando **`run-context.json`** é válido e utilizado, os prompts evitam colar task/scan/architect completos.
- **Correction** — instruções curtas para a próxima volta do **executor**.
- **Knowledge** — apenas após **`approved`**; atualiza knowledge local e pode acionar enriquecimento **`.IA`**.

**Telemetria**: cada corrida pode registar em **`<projeto>/.IA/outputs/<run-id>/metadata.json`** os campos **`llm_usage`** e **`llm_usage_total`** (ver **`core/llm-usage.js`**). Modelos por variáveis **`_*_MODEL`**, fallback **`OPENAI_MODEL`**. O índice **`setup-boss/.setup-boss/runs/<run-id>.json`** liga o run id à pasta de output no projeto alvo.

---

## Pipeline atual

```text
scan → architect → run-context.json
→ executor (PATCH)
→ review
→ [correction → executor → review]*
→ knowledge (se approved)
```

O loop e os limites vêm de **`scripts/run.js`** (`MAX_CORRECTIONS`, `MAX_TOTAL_STEPS`). **`blocked`** no review não segue o mesmo caminho que **`rejected`** com **`requires_correction`**.

---

#

[truncated operational_docs: original_chars=28774 max_chars=12000]

factual; Fase 3 com bullets alinhados ao código atual.

### docs/ai-session-bootstrap.md

Resumo para novo chat; pipeline e conceitos atuais (**run-context**, PATCH, `llm_usage`).

### docs/padrao-novo-chat.md

Como iniciar conversa sem assumir contexto gigante.

### docs/agents.md

Lista de agents e pipeline.

### docs/agents-governance.md

Regras para criar novos agents.

### docs/observability.md

Artefactos de corrida, `run-log.json`, `metadata.json`, `llm_usage`, limitações.

---

## O que atualizar

- Mudança de pipeline ou de artefactos obrigatórios
- Nova etapa ou novo instrumento (ex.: métricas, novo JSON)
- Alteração de segurança ou limites (`MAX_*`, cache de scan)
- Mudança de contrato dos agents (quando refletida nos scripts)

---

## O que não fazer

- Reescrever docs sem mudança de sistema
- Documentar planeamento como se já estivesse implementado

---

## Como atualizar

1. Ler o doc atual e o código afetado
2. Substituir por versão completa coerente com o resto de `docs/`
3. Manter tom técnico e direto

---

## Critério

```text
Um desenvolvedor só com docs + repo consegue prever o comportamento do npm run run.
```

---

## Regra final

```text
Documentação = estado real do sistema.
```


## OPERATIONAL DOC: setup-boss-roadmap.md

# Setup Boss — Roadmap

## Pipeline em produção

```text
scan → architect → run-context.json
→ executor (PATCH)
→ review
→ [correction → executor → review]*
→ knowledge
```

O comando **`npm run run`** automatiza até **knowledge** quando o review fica **`approved`**. Se o review pedir correção, o ciclo **correction → executor → review** repete até aprovação, **`blocked`**, ou limites (**`MAX_CORRECTIONS`**, **`MAX_TOTAL_STEPS`**) em **`scripts/run.js`**.

---

## Concluído (estado atual do código)

- **`run-context.json`** — gerado pelo architect; inclui task resumida, **`allowed_files`**, critérios de aceite, **`review_focus`**, estado do architect (**`scripts/architect.js`**).
- **Executor por PATCH** — schema com **`operation: patch`**; **`search`** deve ocorrer **exactamente uma vez** no ficheiro alvo; escopo limitado a **`allowed_files`** (**`scripts/executor.js`**).
- **Review JSON-first** — **`review-output.json`**; uso de **run-context** quando válido para prompts mais curtos (**scripts/review.js** e leitura de artefactos).
- **Modelos por etapa** — **`core/llm-client.js`**, variáveis **`ARCHITECT_MODEL`**, **`EXECUTOR_MODEL`**, etc., fallback **`OPENAI_MODEL`**.
- **Tracking** — **`core/llm-usage.js`**; **`metadata.json`** com **`llm_usage`** (por chave de etapa) e **`llm_usage_total`** em **`<projeto>/.IA/outputs/<run>/`**; inclui **`scan`**, **`ensure_ia`**, **`semantic_ia`** quando aplicável ao fluxo.

---

## Próximos passos declarados

### STEP 4 — Optimização agressiva de tokens

- Reduzir texto redundante entre etapas dentro do que o contrato dos artefactos permitir.
- Políticas de truncagem e resumos alinhadas aos consumidores existentes.

### STEP 5 — Fallback inteligente (local/API)

- Caminhos locais determinísticos onde fizer sentido.
- API só onde o ganho compensar custo e complexidade.

### STEP 6 — Executor híbrido (mais determinístico)

- Mais edições guiadas por estrutura (marcadores, slots), mantendo PATCH onde for necessário.
- Parsing mais rígido quando o stack do projeto permitir.

---

## Regras de evolução

- Manter invariantes dos consumidores de artefactos (**`review-output.json`**, **`executor-changes.json`**, etc.) salvo migração explícita.
- Review continua no caminho padrão antes de knowledge com aceitação.
- Não expandir escrita automática para fora do whitelist da corrida (**`allowed_files`**).

---

## Critério de sucesso (contínuo)

- Execução end-to-end até knowledge **sem passo manual de edição** no mesmo run quando não há bloqueio.
- Custos e tokens observáveis por etapa nos artefactos da corrida.
- Menos tokens por run mantendo critérios de aceite atendidos em tasks válidas.


## OPERATIONAL DOC: setup-boss-vision.md

# Setup Boss — Visão de evolução

## Objetivo

Descrição por fases da maturidade do produto, alinhada ao estado do repositório **v2.0.0**.

---

## Fase 1 — MVP

- Plano (**architect**)
- Task e critérios como entrada explícita
- **Alterações no disco feitas fora do pipeline automático** (sem executor integrado)

---

## Fase 2 — Semi-automação

- **Review** orientado a JSON (**`review-output.json`**)
- Loop **correction**
- Logs de corrida e limites configuráveis
- Transição preparada para execução automática no disco (**ainda sem executor PATCH como está hoje**)

---

## Fase 3 — Executor local (**concluída · v2.0.0**)

- **Executor automático**: alterações no disco via **PATCH** (`operation: patch`, **`search`** único, **`replace`**), só **`allowed_files`**, validação em código
- **`run-context.json`** como fonte de verdade compacta entre etapas (**redução de contexto**, menos prompts gigantes)
- **Review** alinhado ao estado persistido e a artefactos compactos quando **`run-context`** é válido
- **Knowledge** persistente no projeto alvo
- **Orquestração com controlo de custo**: modelos por etapa (`core/llm-client.js`) e **`llm_usage`** / **`llm_usage_total`** em **`metadata.json`**
- Histórico por corrida em **`<projeto>/.IA/outputs/<run-id>/`**

---

## Fase 4 — Assistência estrutural maior

- Executor **híbrido** (mais determinístico onde couber + IA onde falta estrutura)
- Parsing mais rígido (HTML/outros) quando o stack permitir
- Validação opcional por build/teste quando existir infraestrutura

---

## Fase 5 — Autonomia aspiracional

- Propostas da IA com gates humanos claros

---

## Estado atual

```text
Fase 3 — Executor por PATCH, run-context, métricas LLM (v2.0.0).
```

O sistema posiciona-se como **orquestrador com controlo de custo e escopo**, não como uma cadeia genérica de prompts sem artefactos nem limites.

---

## Próximo foco documentado

```text
Roadmap STEP 4–6 — optimização de tokens, fallback local/API, executor híbrido.
```




## PROJECT LOCAL TRUTH: knowledge-base.md

## Decision / Update

### Context

A run exigiu pré-criação do stub em `tmp/setup-boss-diagnostic.md` antes do patch, com escopo estritamente limitado a esse ficheiro.

### Decision

A alteração válida deve ficar confinada a `tmp/setup-boss-diagnostic.md`, sem tocar `scripts/`, `core/`, `agents/` ou `docs/`.

### Reason

O executor bloqueia patches fora de ficheiros já existentes e a task depende dessa pré-condição para evitar `blocked`.

### Impact

O fluxo passa a ser previsível e auditável, com risco reduzido de alterações laterais fora do ficheiro-alvo.

### Validation

Verifica-se confirmando que só `tmp/setup-boss-diagnostic.md` foi alterado e que o conteúdo inclui `prompt-sizes` ou `diagnostic` com timestamp ISO.

### Date

2026-05-05

## Decision / Update

### Context

O fluxo de diagnóstico deve manter a alteração do projeto alvo estritamente em `tmp/setup-boss-diagnostic.md`.

### Decision

A run fica limitada a um único ficheiro de diagnóstico com uma linha curta contendo marcador e timestamp ISO.

### Reason

Isso cumpre o objetivo de gerar o artefacto mínimo sem tocar em `scripts/`, `core/`, `agents/` ou `docs/`.

### Impact

Reduz o risco de alterações colaterais e facilita a validação por comparação direta do ficheiro alvo.

### Validation

Verifica-se pela presença de `tmp/setup-boss-diagnostic.md` com timestamp ISO e pela ausência de alterações fora desse caminho.

### Date

2026-05-05

## Decision / Update

### Context
A run de diagnóstico depende de pré-criar `tmp/setup-boss-diagnostic.md` porque o executor aplica patch apenas em ficheiros já existentes.

### Decision
A alteração relevante deve ficar limitada a `tmp/setup-boss-diagnostic.md`, com conteúdo curto contendo `prompt-sizes` ou `diagnostic` e timestamp ISO 8601.

### Reason
Isso evita bloqueio por caminho inexistente e mantém o escopo limpo, sem tocar em `scripts/`, `core/`, `agents/` ou `docs/`.

### Impact
O fluxo passa a ser validável por presença do ficheiro alvo e pela ausência de alterações fora de `tmp/`, reduzindo risco de false positives no review.

### Validation
Verifica-se por inspeção do diff e do conteúdo final de `tmp/setup-boss-diagnostic.md`, confirmando que não houve alterações fora do caminho permitido.

### Date
2026-05-05

## PROJECT LOCAL TRUTH: project-scan.md

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

## PROJECT IA CONTEXT


## PROJECT IA: 00-project-profile.md

# Project Profile

## Nome

setup-boss

## Objetivo do projeto

Não confirmado ainda.

## Tipo de sistema

Não confirmado ainda.

## Status atual

Baseline inicial criado automaticamente pela Setup Boss.

## Principais módulos

A confirmar conforme análise do projeto.

## Como rodar

Ver `06-runbook.md`.

## Como validar

Ver `06-runbook.md`.

## Observações importantes

Este documento deve ser mantido atualizado ao fim das atividades relevantes.


## PROJECT IA: 01-architecture.md

# Architecture

## Visão geral

A confirmar com base no código real.

## Fluxo principal

A confirmar.

## Camadas

A confirmar.

## Integrações

A confirmar.

## Banco de dados

A confirmar.

## Autenticação

A confirmar.

## Jobs / Workers

A confirmar.

## Pontos críticos

A confirmar.


## PROJECT IA: 02-stack.md

# Stack

## Frontend

A confirmar.

## Backend

A confirmar.

## Database

A confirmar.

## Infra

A confirmar.

## Libs principais

A confirmar.

## Versões relevantes

A confirmar.

## Comandos úteis

A confirmar.


## PROJECT IA: 03-coding-standards.md

# Coding Standards

## Nomenclatura

A confirmar.

## Estrutura de arquivos

A confirmar.

## Padrões de componentes

A confirmar.

## Padrões de API

A confirmar.

## Padrões de erro

A confirmar.

## O que evitar

A confirmar.


## PROJECT IA: 04-domain-context.md

# Domain Context

## O que o sistema resolve

A confirmar.

## Entidades principais

A confirmar.

## Fluxos de negócio

A confirmar.

## Regras importantes

A confirmar.

## Termos usados no projeto

A confirmar.


## PROJECT IA: 05-folder-map.md

# Folder Map

## Pastas principais

A confirmar.

## Responsabilidade de cada pasta

A confirmar.

## Arquivos sensíveis

A confirmar.

## Arquivos que normalmente não devem ser alterados

A confirmar.


## PROJECT IA: 06-runbook.md

# Runbook

## Como instalar

A confirmar.

## Como rodar local

A confirmar.

## Como rodar testes

A confirmar.

## Como rodar build

A confirmar.

## Como debugar

A confirmar.

## Docker

A confirmar.

## Variáveis de ambiente

A confirmar.


## PROJECT IA: 07-decisions.md

# Technical Decisions

Este arquivo registra decisões técnicas permanentes do projeto.

Não usar como log operacional.

---

## ADR-0001 — Baseline de documentação IA

### Contexto

O projeto passou a usar a pasta `.IA` como base local de conhecimento para execução assistida.

### Decisão

Manter documentação persistente do projeto dentro de `.IA`.

### Motivo

Evitar reinvestigar o projeto do zero a cada atividade.

### Impacto

Architect, Executor, Review e Knowledge passam a ter contexto local mais estável.

### Data

2026-05-05


## PROJECT IA: 08-activity-history.md

# Activity History

Este arquivo registra o histórico objetivo das atividades executadas no projeto.

Formato esperado:

```md
## YYYY-MM-DD — Nome da atividade

### Objetivo

### Arquivos alterados

### O que foi feito

### Validação

### Pendências

### Observações
```


## PROJECT IA: 09-known-issues.md

# Known Issues

Este arquivo registra problemas conhecidos que podem impactar próximas atividades.

Formato esperado:

```md
## Problema

### Sintoma

### Causa provável

### Status

### Workaround

### Próximo passo
```


## PROJECT IA: 10-ai-rules.md

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

Projeto Node.js para orquestração de um pipeline de IA sobre projetos-alvo, com etapas de scan, architect, executor, review, correction e knowledge. O repositório também mantém artefactos de execução e docum

[truncated 10-ai-rules.md: original_chars=4721 max_chars=2000]

ntext.json` — contexto compacto da corrida.
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


## PROJECT TARGET
C:\Users\pierr\Documents\automacao\setup-boss

## FILE TREE
.env
.env.example
.gitignore
.IA/
.IA\00-project-profile.md
.IA\01-architecture.md
.IA\02-stack.md
.IA\03-coding-standards.md
.IA\04-domain-context.md
.IA\05-folder-map.md
.IA\06-runbook.md
.IA\07-decisions.md
.IA\08-activity-history.md
.IA\09-known-issues.md
.IA\09-problem-history.jsonl
.IA\10-ai-rules.md
.IA\outputs/
.IA\outputs\20260505-104618-diagnostico-prompt-sizes/
.IA\outputs\20260505-104618-diagnostico-prompt-sizes\architect-input.md
.IA\outputs\20260505-104618-diagnostico-prompt-sizes\architect-output.md
.IA\outputs\20260505-104618-diagnostico-prompt-sizes\architect-validation.json
.IA\outputs\20260505-104618-diagnostico-prompt-sizes\executor-changes.json
.IA\outputs\20260505-104618-diagnostico-prompt-sizes\executor-input.md
.IA\outputs\20260505-104618-diagnostico-prompt-sizes\executor-output.md
.IA\outputs\20260505-104618-diagnostico-prompt-sizes\executor-result.json
.IA\outputs\20260505-104618-diagnostico-prompt-sizes\ia-diagnostics.json
.IA\outputs\20260505-104618-diagnostico-prompt-sizes\metadata.json
.IA\outputs\20260505-104618-diagnostico-prompt-sizes\prompt-sizes.json
.IA\outputs\20260505-104618-diagnostico-prompt-sizes\run-context.json
.IA\outputs\20260505-104618-diagnostico-prompt-sizes\run-log.json
.IA\outputs\20260505-104618-diagnostico-prompt-sizes\scan-input.md
.IA\outputs\20260505-104618-diagnostico-prompt-sizes\scan-output.md
.IA\outputs\20260505-104618-diagnostico-prompt-sizes\task.md
.IA\outputs\20260505-105104-diagnostico-prompt-sizes/
.IA\outputs\20260505-105104-diagnostico-prompt-sizes\architect-input.md
.IA\outputs\20260505-105104-diagnostico-prompt-sizes\architect-output.md
.IA\outputs\20260505-105104-diagnostico-prompt-sizes\architect-validation.json
.IA\outputs\20260505-105104-diagnostico-prompt-sizes\executor-changes.json
.IA\outputs\20260505-105104-diagnostico-prompt-sizes\executor-input.md
.IA\outputs\20260505-105104-diagnostico-prompt-sizes\executor-output.md
.IA\outputs\20260505-105104-diagnostico-prompt-sizes\executor-result.json
.IA\outputs\20260505-105104-diagnostico-prompt-sizes\ia-diagnostics.json
.IA\outputs\20260505-105104-diagnostico-prompt-sizes\metadata.json
.IA\outputs\20260505-105104-diagnostico-prompt-sizes\prompt-sizes.json
.IA\outputs\20260505-105104-diagnostico-prompt-sizes\review-output.json
.IA\outputs\20260505-105104-diagnostico-prompt-sizes\review-output.md
.IA\outputs\20260505-105104-diagnostico-prompt-sizes\run-context.json
.IA\outputs\20260505-105104-diagnostico-prompt-sizes\run-log.json
.IA\outputs\20260505-105104-diagnostico-prompt-sizes\scan-output.md
.IA\outputs\20260505-105104-diagnostico-prompt-sizes\task.md
.IA\outputs\20260505-105322-diagnostico-prompt-sizes/
.IA\outputs\20260505-105322-diagnostico-prompt-sizes\architect-input.md
.IA\outputs\20260505-105322-diagnostico-prompt-sizes\architect-output.md
.IA\outputs\20260505-105322-diagnostico-prompt-sizes\architect-validation.json
.IA\outputs\20260505-105322-diagnostico-prompt-sizes\executor-changes.json
.IA\outputs\20260505-105322-diagnostico-prompt-sizes\executor-input.md
.IA\outputs\20260505-105322-diagnostico-prompt-sizes\executor-output.md
.IA\outputs\20260505-105322-diagnostico-prompt-sizes\executor-result.json
.IA\outputs\20260505-105322-diagnostico-prompt-sizes\ia-diagnostics.json
.IA\outputs\20260505-105322-diagnostico-prompt-sizes\metadata.json
.IA\outputs\20260505-105322-diagnostico-prompt-sizes\prompt-sizes.json
.IA\outputs\20260505-105322-diagnostico-prompt-sizes\review-output.json
.IA\outputs\20260505-105322-diagnostico-prompt-sizes\review-output.md
.IA\outputs\20260505-105322-diagnostico-prompt-sizes\run-context.json
.IA\outputs\20260505-105322-diagnostico-prompt-sizes\run-log.json
.IA\outputs\20260505-105322-diagnostico-prompt-sizes\scan-output.md
.IA\outputs\20260505-105322-diagnostico-prompt-sizes\task.md
.IA\outputs\20260505-105350-diagnostico-prompt-sizes/
.IA\outputs\20260505-105350-diagnostico-prompt-sizes\architect-input.md
.IA\outputs\20260505-105350-diagnostico-prompt-sizes\architect-output.md
.IA\outputs\20260505-105350-diagnostico-prompt-sizes\architect-validation.json
.IA\outputs\20260505-105350-diagnostico-prompt-sizes\executor-changes.json
.IA\outputs\20260505-105350-diagnostico-prompt-sizes\executor-input.md
.IA\outputs\20260505-105350-diagnostico-prompt-sizes\executor-output.md
.IA\outputs\20260505-105350-diagnostico-prompt-sizes\executor-result.json
.IA\outputs\20260505-105350-diagnostico-prompt-sizes\ia-diagnostics.json
.IA\outputs\20260505-105350-diagnostico-prompt-sizes\metadata.json
.IA\outputs\20260505-105350-diagnostico-prompt-sizes\prompt-sizes.json
.IA\outputs\20260505-105350-diagnostico-prompt-sizes\review-output.json
.IA\outputs\20260505-105350-diagnostico-prompt-sizes\review-output.md
.IA\outputs\20260505-105350-diagnostico-prompt-sizes\run-context.json
.IA\outputs\20260505-105350-diagnostico-prompt-sizes\run-log.json
.IA\outputs\20260505-105350-diagnostico-prompt-sizes\scan-output.md
.IA\outputs\20260505-105350-diagnostico-prompt-sizes\task.md
.IA\outputs\20260505-105442-diagnostico-prompt-sizes/
.IA\outputs\20260505-105442-diagnostico-prompt-sizes\architect-input.md
.IA\outputs\20260505-105442-diagnostico-prompt-sizes\architect-output.md
.IA\outputs\20260505-105442-diagnostico-prompt-sizes\architect-validation.json
.IA\outputs\20260505-105442-diagnostico-prompt-sizes\executor-changes.json
.IA\outputs\20260505-105442-diagnostico-prompt-sizes\executor-input.md
.IA\outputs\20260505-105442-diagnostico-prompt-sizes\executor-output.md
.IA\outputs\20260505-105442-diagnostico-prompt-sizes\executor-result.json
.IA\outputs\20260505-105442-diagnostico-prompt-sizes\ia-diagnostics.json
.IA\outputs\20260505-105442-diagnostico-prompt-sizes\metadata.json
.IA\outputs\20260505-105442-diagnostico-prompt-sizes\prompt-sizes.json
.IA\outputs\20260505-105442-diagnostico-prompt-sizes\review-output.json
.IA\outputs\20260505-105442-diagnostico-prompt-sizes\review-output.md
.IA\outputs\20260505-105442-diagnostico-prompt-

[truncated file tree: original_chars=30892 max_chars=12000]

nding-sofas-exemplo\architect-input.md
outputs\2026-05-02T15-58-59-561Z-landing-sofas-exemplo\architect-output.md
outputs\2026-05-02T15-58-59-561Z-landing-sofas-exemplo\architect-validation.json
outputs\2026-05-02T15-58-59-561Z-landing-sofas-exemplo\executor-changes.json
outputs\2026-05-02T15-58-59-561Z-landing-sofas-exemplo\executor-input.md
outputs\2026-05-02T15-58-59-561Z-landing-sofas-exemplo\executor-output.md
outputs\2026-05-02T15-58-59-561Z-landing-sofas-exemplo\executor-result.json
outputs\2026-05-02T15-58-59-561Z-landing-sofas-exemplo\metadata.json
outputs\2026-05-02T15-58-59-561Z-landing-sofas-exemplo\run-log.json
outputs\2026-05-02T15-58-59-561Z-landing-sofas-exemplo\scan-input.md
outputs\2026-05-02T15-58-59-561Z-landing-sofas-exemplo\scan-output.md
outputs\2026-05-02T15-58-59-561Z-landing-sofas-exemplo\task.md
outputs\2026-05-02T16-06-11-400Z-landing-sofas-exemplo/
outputs\2026-05-02T16-06-11-400Z-landing-sofas-exemplo\architect-input.md
outputs\2026-05-02T16-06-11-400Z-landing-sofas-exemplo\run-log.json
outputs\2026-05-02T16-12-11-844Z-landing-sofas-exemplo/
outputs\2026-05-02T16-12-11-844Z-landing-sofas-exemplo\architect-input.md
outputs\2026-05-02T16-12-11-844Z-landing-sofas-exemplo\run-log.json
outputs\2026-05-02T16-12-11-844Z-landing-sofas-exemplo\scan-input.md
outputs\2026-05-02T16-12-11-844Z-landing-sofas-exemplo\scan-output.md
outputs\2026-05-02T16-16-08-830Z-landing-sofas-exemplo/
outputs\2026-05-02T16-16-08-830Z-landing-sofas-exemplo\architect-input.md
outputs\2026-05-02T16-16-08-830Z-landing-sofas-exemplo\architect-output.md
outputs\2026-05-02T16-16-08-830Z-landing-sofas-exemplo\architect-validation.json
outputs\2026-05-02T16-16-08-830Z-landing-sofas-exemplo\correction-instructions.md
outputs\2026-05-02T16-16-08-830Z-landing-sofas-exemplo\executor-changes.json
outputs\2026-05-02T16-16-08-830Z-landing-sofas-exemplo\executor-input.md
outputs\2026-05-02T16-16-08-830Z-landing-sofas-exemplo\executor-output.md
outputs\2026-05-02T16-16-08-830Z-landing-sofas-exemplo\executor-result.json
outputs\2026-05-02T16-16-08-830Z-landing-sofas-exemplo\metadata.json
outputs\2026-05-02T16-16-08-830Z-landing-sofas-exemplo\review-output.json
outputs\2026-05-02T16-16-08-830Z-landing-sofas-exemplo\review-output.md
outputs\2026-05-02T16-16-08-830Z-landing-sofas-exemplo\run-log.json
outputs\2026-05-02T16-16-08-830Z-landing-sofas-exemplo\scan-input.md
outputs\2026-05-02T16-16-08-830Z-landing-sofas-exemplo\scan-output.md
outputs\2026-05-02T16-16-08-830Z-landing-sofas-exemplo\task.md
outputs\2026-05-02T16-26-19-096Z-landing-sofas-exemplo/
outputs\2026-05-02T16-26-19-096Z-landing-sofas-exemplo\architect-input.md
outputs\2026-05-02T16-26-19-096Z-landing-sofas-exemplo\run-log.json
outputs\2026-05-02T16-26-19-096Z-landing-sofas-exemplo\scan-input.md
outputs\2026-05-02T16-26-19-096Z-landing-sofas-exemplo\scan-output.md
outputs\2026-05-02T16-38-17-978Z-landing-sofas-exemplo/
outputs\2026-05-02T16-38-17-978Z-landing-sofas-exemplo\architect-input.md
outputs\2026-05-02T16-38-17-978Z-landing-sofas-exemplo\architect-output.md
outputs\2026-05-02T16-38-17-978Z-landing-sofas-exemplo\architect-validation.json
outputs\2026-05-02T16-38-17-978Z-landing-sofas-exemplo\correction-instructions.md
outputs\2026-05-02T16-38-17-978Z-landing-sofas-exemplo\executor-changes.json
outputs\2026-05-02T16-38-17-978Z-landing-sofas-exemplo\executor-input.md
outputs\2026-05-02T16-38-17-978Z-landing-sofas-exemplo\executor-output.md
outputs\2026-05-02T16-38-17-978Z-landing-sofas-exemplo\executor-result.json
outputs\2026-05-02T16-38-17-978Z-landing-sofas-exemplo\metadata.json
outputs\2026-05-02T16-38-17-978Z-landing-sofas-exemplo\review-output.json
outputs\2026-05-02T16-38-17-978Z-landing-sofas-exemplo\review-output.md
outputs\2026-05-02T16-38-17-978Z-landing-sofas-exemplo\run-log.json
outputs\2026-05-02T16-38-17-978Z-landing-sofas-exemplo\scan-input.md
outputs\2026-05-02T16-38-17-978Z-landing-sofas-exemplo\scan-output.md
outputs\2026-05-02T16-38-17-978Z-landing-sofas-exemplo\task.md
outputs\2026-05-02T16-44-41-006Z-landing-sofas-exemplo/
outputs\2026-05-02T16-44-41-006Z-landing-sofas-exemplo\architect-input.md
outputs\2026-05-02T16-44-41-006Z-landing-sofas-exemplo\run-log.json
outputs\2026-05-02T16-44-41-006Z-landing-sofas-exemplo\scan-input.md
outputs\2026-05-02T16-44-41-006Z-landing-sofas-exemplo\scan-output.md
outputs\2026-05-02T17-04-50-011Z-landing-sofas-exemplo/
outputs\2026-05-02T17-04-50-011Z-landing-sofas-exemplo\architect-input.md
outputs\2026-05-02T17-04-50-011Z-landing-sofas-exemplo\run-log.json
outputs\2026-05-02T17-04-50-011Z-landing-sofas-exemplo\scan-input.md
outputs\2026-05-02T17-04-50-011Z-landing-sofas-exemplo\scan-output.md
outputs\2026-05-02T17-13-40-563Z-landing-sofas-exemplo/
outputs\2026-05-02T17-13-40-563Z-landing-sofas-exemplo\architect-input.md
outputs\2026-05-02T17-13-40-563Z-landing-sofas-exemplo\architect-output.md
outputs\2026-05-02T17-13-40-563Z-landing-sofas-exemplo\architect-validation.json
outputs\2026-05-02T17-13-40-563Z-landing-sofas-exemplo\correction-instructions.md
outputs\2026-05-02T17-13-40-563Z-landing-sofas-exemplo\executor-changes.json
outputs\2026-05-02T17-13-40-563Z-landing-sofas-exemplo\executor-input.md
outputs\2026-05-02T17-13-40-563Z-landing-sofas-exemplo\executor-output.md
outputs\2026-05-02T17-13-40-563Z-landing-sofas-exemplo\executor-result.json
outputs\2026-05-02T17-13-40-563Z-landing-sofas-exemplo\knowledge-update.md
outputs\2026-05-02T17-13-40-563Z-landing-sofas-exemplo\metadata.json
outputs\2026-05-02T17-13-40-563Z-landing-sofas-exemplo\review-output.json
outputs\2026-05-02T17-13-40-563Z-landing-sofas-exemplo\review-output.md
outputs\2026-05-02T17-13-40-563Z-landing-sofas-exemplo\run-log.json
outputs\2026-05-02T17-13-40-563Z-landing-sofas-exemplo\scan-input.md
outputs\2026-05-02T17-13-40-563Z-landing-sofas-exemplo\scan-output.md
outputs\2026-05-02T17-13-40-563Z-landing-sofas-exemplo\task.md
outputs\2026-05-02T17-27-23-620Z-landing-sofas-exemplo/

## IMPORTANT FILE CONTENT


## FILE: package.json

{
  "name": "setup-boss",
  "version": "2.0.0",
  "scripts": {
    "architect": "node scripts/architect.js",
    "executor": "node scripts/executor.js",
    "review": "node scripts/review.js",
    "knowledge": "node scripts/knowledge.js",
    "run": "node scripts/run.js",
    "scan": "node scripts/scan.js",
    "correction": "node scripts/correction.js",
    "ensure-ia": "node scripts/ensure-ia.js"
  },
  "dependencies": {
    "dotenv": "^17.2.3",
    "openai": "^6.10.0"
  }
}

## FILE: .env.example

OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.4-mini

ARCHITECT_MODEL=gpt-5.4-mini
EXECUTOR_MODEL=gpt-5.4-mini
REVIEW_MODEL=gpt-5.4-mini
CORRECTION_MODEL=gpt-5.4-mini
KNOWLEDGE_MODEL=gpt-5.4-mini
SCAN_MODEL=gpt-5.4-mini
ENSURE_IA_MODEL=gpt-5.4-mini
SEMANTIC_IA_MODEL=gpt-5.4-mini

GPT_5_4_INPUT_USD_PER_1M=
GPT_5_4_OUTPUT_USD_PER_1M=
GPT_5_4_MINI_INPUT_USD_PER_1M=
GPT_5_4_MINI_OUTPUT_USD_PER_1M=

MAX_CORRECTIONS=3
MAX_TOTAL_STEPS=20
ENABLE_SCAN_CACHE=true

FORCE_SCAN=
# Se definido (ex.: 1 ou true), força scan na corrida ignorando cache do run.js (alternativa a passar --force-scan ao node scripts/run.js).

SCAN_FILE_TREE_MAX_CHARS=12000
# Teto de caracteres da árvore de ficheiros no prompt do scan; <= 0 desativa truncagem.

SCAN_OPERATIONAL_DOCS_MAX_CHARS=12000
# Teto de caracteres dos docs operacionais (setup-boss/docs) no prompt do scan; <= 0 desativa.

SCAN_GLOBAL_CONTEXT_MAX_CHARS=6000
# Teto de caracteres do contexto global (setup-boss/context) no prompt do scan; <= 0 desativa.

ARCHITECT_PROJECT_SCAN_MAX_CHARS=8000
# Teto do texto PROJECT SCAN (project-scan.md) no prompt do architect; <= 0 sem truncagem.

IA_CONTEXT_AI_RULES_MAX_CHARS=2000
# Teto só para .IA/10-ai-rules.md ao montar PROJECT IA CONTEXT (collectIAContext); <= 0 sem truncagem.

