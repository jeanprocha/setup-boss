# Setup Boss — Manutenção e atualização de documentos

## Objetivo

Garantir que a documentação em `docs/` acompanha o **código** e os **artefactos** reais do pipeline.

---

## Contexto

O Setup Boss muda por:

- scripts (`scripts/`, `core/`)
- agents (`agents/`)
- variáveis de ambiente (`.env.example`)

Qualquer mudança relevante no comportimento deve aparecer nos docs listados abaixo.

---

## Regra principal

```text
Se altera o funcionamento observável → atualizar o doc correspondente.
```

---

## Documentos e responsabilidades

### docs/README.md

Visão geral, pipeline oficial (incluindo **run-context** e **PATCH**), comandos reais, estado atual.

### docs/setup-boss-roadmap.md

Concluído vs próximos passos (STEP 4–6 ou equivalente).

### docs/setup-boss-vision.md

Fases e posicionamento do produto (orquestração + custo).

### docs/setup-boss-evolution.md

Histórico factual; Fase 3 com bullets alinhados ao código atual.

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
