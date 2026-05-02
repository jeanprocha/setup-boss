
---

# `agents/project-scan.md`

```md
# Agent: Project Scan
# Version: 1.1.0
# Updated: 2026-05-01

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

```md
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

## SOURCE OF TRUTH HIERARCHY

setup-boss/context = verdade global do sistema
setup-boss/docs = documentação operacional
project/.setup-boss = verdade local do projeto
outputs/<run-id> = histórico da execução

## SOURCE OF TRUTH RULES

- Use setup-boss/context apenas como verdade global do sistema.
- Use setup-boss/docs apenas como documentação operacional.
- Use project/.setup-boss como verdade local do projeto.
- Não misture knowledge global com knowledge local do projeto.
- Não escreva informações locais do projeto em setup-boss/context.
- Não trate outputs antigos como fonte de verdade permanente.



## GLOBAL SYSTEM CONTEXT: decisions.md

# Setup Boss — Decisions

## Decisão: Pipeline estruturado

Adotado fluxo fixo:

scan → architect → cursor → review → knowledge

Motivo:
garante previsibilidade e controle

---

## Decisão: Separação sistema vs projeto

- setup-boss = sistema
- .setup-boss = contexto do projeto

Motivo:
evitar mistura de responsabilidades

---

## Decisão: Knowledge por projeto

Cada projeto mantém seu próprio:

.setup-boss/knowledge-base.md

Motivo:
aprendizado contextualizado

---

## Decisão: Loop de correção

Review reprova → gera correction → volta para Cursor

Motivo:
reduzir intervenção manual

---

## Decisão: Aprovação baseada em JSON estruturado

A decisão oficial do Review vem de:

review-output.json

Formato base:

{
  "status": "approved",
  "acceptance_level": "development",
  "blocking_issues": [],
  "warnings": [],
  "requires_correction": false,
  "summary": "Task validada com sucesso.",
  "markdown_report": "..."
}

Motivo:
evitar parsing frágil de Markdown e tornar o pipeline determinístico.

Regra:
Markdown pode existir como explicação humana, mas nunca como fonte de decisão.

## GLOBAL SYSTEM CONTEXT: knowledge.md

# Setup Boss — Knowledge Base (Global)

## Padrões do sistema

### 1. Sempre usar contexto antes de executar
Nenhuma task deve rodar sem:
- project scan
- leitura do projeto

---

### 2. Não reinventar solução existente
Sempre priorizar:
- padrões já implementados no projeto
- reaproveitamento de lógica

---

### 3. Validação precisa de evidência
Não aceitar:
- afirmações genéricas

Exigir:
- prova no código
- validação funcional

---

### 4. Separar claramente:

- funcionalmente correto
- pronto para produção

---

### 5. Tasks devem definir critério de aceite

Exemplo:

## Critério de aceite
- desenvolvimento
- homologação
- produção

---

### 6. Knowledge não é log

Registrar apenas:
- decisões
- padrões reutilizáveis

Nunca:
- passo a passo da execução

## GLOBAL SYSTEM CONTEXT: plan.md

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

## GLOBAL SYSTEM CONTEXT: spec.md

# Setup Boss — Spec

## Objetivo

Criar um sistema de execução de tarefas assistido por IA, com pipeline estruturado e iterativo.

O sistema deve:

- entender o projeto automaticamente
- planejar antes de executar
- validar antes de concluir
- aprender após cada execução

## Escopo

O Setup Boss cobre:

- análise de projeto (scan)
- planejamento (architect)
- execução assistida (cursor)
- validação (review)
- aprendizado (knowledge)
- iteração automática (correction loop)

## Fora de escopo

- execução automática de código sem validação humana
- substituição completa do desenvolvedor
- automação de deploy

## Princípios

- contexto antes de ação
- simplicidade antes de complexidade
- evidência antes de conclusão
- aprendizado contínuo



## OPERATIONAL DOC: agents-governance.md

# Setup Boss — Agents Governance

## Objetivo

Definir regras oficiais para criação, manutenção e desativação de agents no Setup Boss.

O objetivo é evitar crescimento desnecessário de agents, reduzir sobreposição de responsabilidades e manter o pipeline simples, previsível e auditável.

---

## Princípio central

Um novo agent só pode existir se ele melhorar claramente o pipeline.

Criar agent demais cedo aumenta complexidade, reduz qualidade e dificulta manutenção.

---

## Regra oficial para criação de agents

Um novo agent só pode ser criado se atender todos os critérios abaixo:

1. Ter responsabilidade única
2. Reduzir repetição real no pipeline
3. Possuir input claro
4. Possuir output claro
5. Possuir critério de sucesso objetivo
6. Não duplicar responsabilidade de agent existente
7. Não existir apenas para organizar texto
8. Não existir apenas por preferência estética

Se qualquer item falhar, o agent não deve ser criado.

---

## Checklist obrigatório antes de criar um novo agent

Antes de criar um novo agent, responder:

```text
1. Qual problema real esse agent resolve?
2. Esse problema já apareceu mais de uma vez?
3. Qual agent atual não consegue resolver isso?
4. Qual é a responsabilidade única do novo agent?
5. Qual input ele recebe?
6. Qual output ele entrega?
7. Como saberemos que ele funcionou?
8. O que acontece se ele não existir?
9. Ele reduz ou aumenta complexidade?
10. Ele pode ser apenas uma seção dentro de um agent existente?

## OPERATIONAL DOC: agents.md


---

# `docs/agents.md`

```md
# Setup Boss — Lista Oficial de Agents

## Objetivo

Registrar a lista oficial de agents do Setup Boss, suas responsabilidades, inputs, outputs e status.

Este arquivo é a fonte oficial para controle de expansão multi-agent.

---

## Agents ativos

| Agent | Arquivo | Status | Responsabilidade única |
|---|---|---|---|
| Project Scan | `agents/project-scan.md` | active | Analisar o projeto e gerar contexto técnico inicial |
| Architect | `agents/architect.md` | active | Planejar a execução da task antes de qualquer código |
| Cursor Template | `agents/cursor-template.md` | active | Orientar a execução técnica no Cursor conforme plano aprovado |
| Reviewer | `agents/reviewer.md` | active | Validar a entrega contra a task e critérios definidos |
| Correction | `agents/correction.md` | active | Gerar instruções de correção a partir do review |
| Knowledge | `agents/knowledge.md` | active | Registrar aprendizados reutilizáveis sem virar log |

---

## Pipeline oficial

```text
scan → architect → cursor → review → correction → knowledge

## OPERATIONAL DOC: observaboloty.md

# Setup Boss — Observabilidade

## Contexto

O Setup Boss possui um pipeline estruturado:

```text
scan → architect → cursor → review → correction → knowledge

## OPERATIONAL DOC: README.md


---

# `docs/README.md`

```md
# Setup Boss

Sistema de execução assistida por IA com pipeline estruturado.

---

## Como funciona

Pipeline oficial:

```text
scan → architect → cursor → review → correction → knowledge

## OPERATIONAL DOC: setup-boss-evolution.md

# Setup Boss — Evolução da Arquitetura

## Contexto

O Setup Boss evoluiu de um pipeline funcional para um sistema com:

- decisões determinísticas
- controle de execução
- observabilidade
- rastreabilidade de comportamento

Pipeline base:

```text
scan → architect → cursor → review → correction → knowledge



## PROJECT LOCAL TRUTH: knowledge-base.md



---

## Decision / Update

### Context
Foi solicitada a criação de uma landing page de sofás com hero, benefícios, produtos e CTA para WhatsApp no projeto `landing-sofas`.

### Decision
Passa a valer como padrão que, em landings estáticas deste projeto, o escopo deve ser atendido reaproveitando a infraestrutura já existente de CTA para WhatsApp, em vez de recriar lógica de conversão ou scripts paralelos.

### Reason
O projeto já possui integração funcional de WhatsApp baseada em:
- `data-whatsapp` no `<body>`
- CTAs com atributos como `data-wa-href`
- montagem de mensagem com suporte a UTMs
- evento `whatsapp_cta_click`

Isso reduz retrabalho e evita inconsistência entre botões, rastreamento e mensagem enviada.

### Impact
Próximas tasks de landing ou ajuste de seções devem:
- priorizar edição de conteúdo/estrutura visual
- manter CTAs ligados à lógica central existente
- evitar soluções duplicadas de link para WhatsApp
- validar sempre o número configurado em `data-whatsapp` antes de publicação

### Validation
Foi validado que a landing atual já atende ao escopo funcional pedido:
- hero
- benefícios
- produtos
- CTA WhatsApp

Também foi confirmado que a integração de WhatsApp já funciona com suporte a UTMs e evento de tracking.

### Date
2026-05-01

---

## Decision / Update

### Context
Durante a validação da task, foi identificado que o projeto está funcional, mas o número de WhatsApp configurado permanece como placeholder.

### Decision
Antes de qualquer publicação, o campo `data-whatsapp` deve ser tratado como item obrigatório de checklist operacional.

### Reason
Mesmo com a landing correta estruturalmente, o uso de placeholder impede conversão real e pode gerar falso positivo de conclusão técnica.

### Impact
Em futuras entregas semelhantes:
- a task pode ser considerada concluída em desenvolvimento/homologação
- mas publicação deve depender da troca do número real
- checklist final deve incluir validação explícita do `data-whatsapp`

### Validation
A revisão confirmou que o valor atual é um placeholder (`5511999999999`) e que esse é o único ponto operacional relevante antes de produção.

### Date
2026-05-01

---

## Decision / Update

### Context
Na validação da task da landing de sofás, foi confirmado que o escopo de desenvolvimento já estava atendido por implementação pré-existente no projeto, sem necessidade de nova codificação nesta rodada.

### Decision
Passa a valer que, quando a estrutura solicitada já existir no projeto e atender ao escopo, a entrega pode ser aprovada em desenvolvimento por validação técnica, sem obrigar reimplementação.

### Reason
Isso evita retrabalho, preserva código funcional já existente e mantém o foco da task no resultado entregue, não na quantidade de alterações feitas.

### Impact
Em próximas tasks semelhantes:
- deve-se verificar primeiro se o escopo já está atendido no código atual
- se estiver, a conclusão pode ser por auditoria/validação
- a documentação da entrega deve deixar explícito quando não houve alteração de arquivos

### Validation
Foi confirmado no projeto que a landing já contém:
- hero
- benefícios
- produtos
- CTA WhatsApp

Também foi validado que os CTAs seguem a infraestrutura existente integrada ao `main.js`.

### Date
2026-05-01

---

## Decision / Update

### Context
A aprovação desta task foi solicitada especificamente para ambiente de desenvolvimento, com critérios distintos para homologação e produção.

### Decision
Passa a valer como critério operacional que aprovação em desenvolvimento não implica aprovação automática para produção quando houver pendência operacional fora do layout/markup principal, como configuração real de contato.

### Reason
A estrutura da landing pode estar correta tecnicamente para desenvolvimento, mas ainda não estar pronta para uso real se depender de um dado obrigatório de operação, como o número final de WhatsApp.

### Impact
Próximas validações devem separar claramente:
- conformidade de desenvolvimento
- prontidão operacional para publicação

Isso reduz falso positivo de “task concluída” em ambientes posteriores.

### Validation
Foi validado que:
- a task está aprovada para desenvolvimento
- o campo `data-whatsapp` ainda usa placeholder
- por isso, a landing não deve ser considerada pronta para produção sem ajuste operacional

### Date
2026-05-01

## PROJECT LOCAL TRUTH: project-scan.md

# Project Scan

## Summary

Projeto de landing page estática em português para captação de leads de sofás, com CTA para WhatsApp. Pelas evidências fornecidas, o projeto roda no navegador e usa HTML/CSS/JavaScript vanilla. Há lógica para montar links `wa.me` dinamicamente a partir de `data-whatsapp` no `<body>`, com suporte a UTMs e disparo de evento customizado para tracking. Não há evidência de backend, banco de dados, package manager, build tool, testes automatizados ou infraestrutura declarada.

## Stack

- Frontend: HTML, CSS, JavaScript vanilla
- Backend: Não identificado
- Database: Não identificado
- Infra: Não identificada; parece compatível com hospedagem estática, mas isso é inferência
- Package manager: Não identificado
- Build tool: Não identificado

## Project Structure

Principais arquivos e responsabilidades observados:

- `index.html`
  - Página principal da landing
  - Contém estrutura de hero, benefícios, faixas de confiança, produtos e CTAs
  - Define o número de WhatsApp via `data-whatsapp` no `<body>`

- `css/styles.css`
  - Estilos globais
  - Layout responsivo, botões, hero, benefícios, trust strip, cards de produto e CTA final
  - Arquivo fornecido está truncado no final

- `js/main.js`
  - Lógica dos links de WhatsApp
  - Leitura de parâmetros UTM da URL
  - Geração do `href` para `https://wa.me/...`
  - Disparo do evento customizado `whatsapp_cta_click`

- `.setup-boss/`
  - Contexto local do projeto
  - Inclui `knowledge-base.md`, `project-scan.md` e insumos do scan
  - Não faz parte do runtime da aplicação

- `setup-boss/`
  - Contexto do sistema/orquestração
  - Não faz parte da aplicação runtime principal

## Available Commands

Não foram encontrados `package.json`, `README`, `Dockerfile`, `docker-compose`, scripts automatizados nem configuração de ferramentas de build/test/lint.

Comandos encontrados para:

- instalar:
  - não identificado

- rodar local:
  - abrir `index.html` no navegador
  - opcionalmente servir por servidor estático local, mas isso não está documentado no projeto

- build:
  - não identificado

- testes:
  - não identificado

- lint:
  - não identificado

- migrations:
  - não identificado

## Database

- Tipo: não identificado
- ORM/query builder: não identificado
- Migrations: não identificado
- Como conectar: não se aplica com base nas evidências
- Observações:
  - Não há evidência de banco de dados
  - O projeto analisado é estático e não mostra integração com API persistente

## Environments

- Local:
  - Executável diretamente no navegador via `index.html`
  - O comportamento dos CTAs depende de `data-whatsapp`
  - As UTMs são lidas da query string da URL

- Homologação:
  - Não identificada

- Produção:
  - Não identificada

- Variáveis relevantes:
  - `data-whatsapp` no `<body>`: número usado para gerar links do WhatsApp
  - Parâmetros suportados na URL:
    - `utm_source`
    - `utm_medium`
    - `utm_campaign`
    - `utm_content`
    - `utm_term`

## Logs & Debugging

Onde procurar logs e como debugar:

- Navegador / DevTools:
  - `console.warn` quando `data-whatsapp` não está configurado
  - inspeção dos `href` gerados em elementos com `data-wa-href`
  - inspeção de cliques e do evento `whatsapp_cta_click`

Pontos práticos:

- verificar se o `<body>` possui `data-whatsapp` com dígitos válidos
- verificar se os CTAs usam `data-wa-href`
- verificar atributos opcionais:
  - `data-wa-msg`
  - `data-wa-placement`
  - `data-product-id`
- confirmar se o `href` final aponta para `https://wa.me/...`
- confirmar se as UTMs presentes na URL são anexadas à mensagem
- quando `data-whatsapp` estiver ausente/inválido:
  - o script mantém `href="#"` e intercepta clique com `alert`

## Validation

Como validar mudanças com segurança:

- abrir a landing no navegador e verificar renderização geral
- validar responsividade em diferentes larguras
- testar CTAs com `data-wa-href`
- confirmar que:
  - com `data-whatsapp` válido, os links apontam para `wa.me` e abrem em nova aba
  - sem `data-whatsapp`, há aviso no console e bloqueio por `alert`
  - UTMs presentes na URL entram no texto enviado
  - o evento `whatsapp_cta_click` é disparado no clique
- validar acessibilidade básica observável:
  - presença de `skip-link`
  - foco visível nos botões
  - uso de seções semânticas
  - `alt` em imagens

## Risks / Unknowns

Pontos não confirmados ou riscos iniciais:

- não há evidência de testes automatizados
- não há evidência de lint
- não há README do projeto
- não há pipeline de build
- não há definição de deploy/hospedagem no material fornecido
- não há integração confirmada com GTM/GA; existe apenas evento customizado pronto para consumo
- dependência externa de imagens do Unsplash
- `index.html` fornecido está truncado, então a página completa não foi integralmente confirmada
- `css/styles.css` também está truncado no final
- o valor atual de `data-whatsapp` é placeholder (`5511999999999`), o que é risco operacional para publicação real
- há um risco forte de erro em runtime em `js/main.js`: a função `appendUtmToMessage(base)` usa `Object.entries(u)`, mas a variável visível fora dela é `utm`; se o arquivo estiver exatamente como fornecido, isso pode causar falha
- não foi identificado processo formal para atualização de conteúdo, imagens ou número de WhatsApp

## Recommendations

Próximos passos recomendados para melhorar o contexto do projeto:

- confirmar os arquivos completos de `index.html` e `css/styles.css`, pois o material fornecido está parcial
- confirmar se `js/main.js` está exatamente como enviado, especialmente o uso de `u` dentro de `appendUtmToMessage`
- documentar uma forma oficial de execução local e publicação
- registrar checklist operacional de publicação, incluindo validação obrigatória de `data-whatsapp`
- confirmar se o evento `whatsapp_cta_click` será consumido por GTM, GA ou outra ferramenta
- mapear responsável operacional por textos, imagens e número final de WhatsApp

## SOURCE OF TRUTH HIERARCHY

setup-boss/context = verdade global do sistema  
setup-boss/docs = documentação operacional  
project/.setup-boss = verdade local do projeto  
outputs/<run-id> = histórico da execução

## SOURCE OF TRUTH RULES

- Use setup-boss/context apenas como verdade global do sistema.
- Use setup-boss/docs apenas como documentação operacional.
- Use project/.setup-boss como verdade local do projeto.
- Não misture knowledge global com knowledge local do projeto.
- Não escreva informações locais do projeto em setup-boss/context.
- Não trate outputs antigos como fonte de verdade permanente.

## PROJECT TARGET
C:\Users\pierr\Documents\automacao\landing-sofas

## FILE TREE
.setup-boss/
.setup-boss\knowledge-base.md
.setup-boss\project-scan-input.md
.setup-boss\project-scan.md
css/
css\styles.css
index.html
js/
js\main.js
setup-boss/
setup-boss\knowledge-base.md
setup-boss\project-context.md

## IMPORTANT FILE CONTENT


## FILE: index.html

<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="description" content="Sofás com conforto, entrega ágil e atendimento pelo WhatsApp. Orçamento sem compromisso." />
  <title>Sofás que transformam sua sala | Peça pelo WhatsApp</title>
  <link rel="preconnect" href="https://images.unsplash.com" crossorigin />
  <link rel="stylesheet" href="css/styles.css" />
  <!-- Config: altere data-whatsapp no body (somente dígitos, com código do país), ex: 5541987654321 -->
</head>
<body data-whatsapp="5511999999999">
  <a class="skip-link" href="#conteudo">Ir para o conteúdo</a>

  <header class="site-header">
    <div class="container site-header__inner">
      <span class="logo" aria-hidden="true">Conforto<span class="logo__accent">Sofás</span></span>
      <a class="btn btn--ghost header-cta" data-wa-href data-wa-placement="header" data-wa-msg="Olá! Vim pela landing e quero um orçamento." href="#">Orçamento no WhatsApp</a>
    </div>
  </header>

  <main id="conteudo">
    <section class="hero" aria-labelledby="hero-title">
      <div class="container hero__grid">
        <div class="hero__copy">
          <p class="eyebrow">Atendimento direto · Entrega com agendamento</p>
          <h1 id="hero-title" class="hero__title">Sofás pensados para o seu dia a dia — sem surpresa no conforto</h1>
          <p class="hero__lead">
            Estofados com bom caimento, tecidos selecionados e montagem cuidadosa. Fale com a gente e receba sugestões sob medida para sua sala.
          </p>
          <div class="hero__actions">
            <a class="btn btn--primary btn--large" data-wa-href data-wa-placement="hero_primary" data-wa-msg="Olá! Vim pelo site e quero um orçamento de sofá." href="#">
              <span class="btn__icon" aria-hidden="true">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.881 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
              </span>
              Falar no WhatsApp
            </a>
            <a class="btn btn--outline btn--large" href="#produtos">Ver modelos</a>
          </div>
          <p class="hero__proof">Atendimento humano no WhatsApp · resposta no horário comercial</p>
        </div>
        <div class="hero__visual">
          <picture>
            <source type="image/webp" srcset="https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=800&h=900&fit=crop&q=80&fm=webp" />
            <img class="hero__img" src="https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=800&h=900&fit=crop&q=80" width="800" height="900" alt="Sofá moderno em sala iluminada" decoding="async" fetchpriority="high" />
          </picture>
        </div>
      </div>
    </section>

    <section class="section benefits" aria-labelledby="beneficios-title">
      <div class="container">
        <header class="section__head">
          <h2 id="beneficios-title" class="section__title">Por que escolher a gente</h2>
          <p class="section__subtitle">Menos dor de cabeça na compra, mais tempo aproveitando sua sala.</p>
        </header>
        <ul class="benefits__grid">
          <li class="benefit-card">
            <span class="benefit-card__icon" aria-hidden="true">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
            </span>
            <h3 class="benefit-card__title">Materiais e acabamento</h3>
            <p class="benefit-card__text">Estofados com espuma de boa densidade e costuras reforçadas para uso diário.</p>
          </li>
          <li class="benefit-card">
            <span class="benefit-card__icon" aria-hidden="true">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            </span>
            <h3 class="benefit-card__title">Prazos alinhados</h3>
            <p class="benefit-card__text">Combinamos produção e entrega com data que faça sentido para você.</p>
          </li>
          <li class="benefit-card">
            <span class="benefit-card__icon" aria-hidden="true">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>
            </span>
            <h3 class="benefit-card__title">Entrega e montagem</h3>
            <p class="benefit-card__text">Equipe cuida da instalação para você receber tudo nivelado e pronto.</p>
          </li>
          <li class="benefit-card">
            <span class="benefit-card__icon" aria-hidden="true">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"/></svg>
            </span>
            <h3 class="benefit-card__title">Personalização</h3>
            <p class="benefit-card__text">Cores e medidas sob consulta para casar com sua planta e iluminação.</p>
          </li>
          <li class="benefit-card">
            <span class="benefit-card__icon" aria-hidden="true">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z"/></svg>
            </span>
            <h3 class="benefit-card__title">Atendimento humano</h3>
            <p class="benefit-card__text">Tira-dúvidas no WhatsApp com quem entende de medidas e tecidos.</p>
          </li>
        </ul>
      </div>
    </section>

    <section class="trust-strip" aria-labelledby="confianca-title">
      <div class="container trust-strip__inner">
        <h2 id="confianca-title" class="trust-strip__title">Compra com clareza</h2>
        <ul class="trust-strip__grid">
          <li class="trust-strip__item">
            <strong class="trust-strip__lead">Prazo alinhado</strong>
            <p class="trust-strip__text">Combinamos produção e entrega antes do fechamento — você sabe o que es

## FILE: js/main.js

/**
 * Monta links wa.me a partir de data-whatsapp no <body>
 * e data-wa-msg em cada CTA (mensagem pré-preenchida).
 * Opções UTMs na URL são anexadas ao texto para o atendimento rastrear a origem.
 * Dispara evento document "whatsapp_cta_click" para integrar GTM/GA depois.
 */
(function () {
  const body = document.body;
  const raw = body.getAttribute("data-whatsapp") || "";
  const digits = raw.replace(/\D/g, "");

  if (!digits) {
    console.warn("[landing-sofas] Defina data-whatsapp no <body> (apenas números, com código do país).");
  }

  const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];

  /** @returns {Record<string, string>} */
  function getUtmFromUrl() {
    const params = new URLSearchParams(window.location.search);
    /** @type {Record<string, string>} */
    const out = {};
    UTM_KEYS.forEach((key) => {
      const val = params.get(key);
      if (val) out[key] = val;
    });
    return out;
  }

  const utm = getUtmFromUrl();

  /** @param {Record<string, string>} u */
  function appendUtmToMessage(base) {
    const parts = Object.entries(u);
    if (!parts.length) return base.trim();
    const suffix = parts
      .map(([k, v]) => `${k}=${String(v).replace(/\s+/g, " ").slice(0, 120)}`)
      .join(" · ");
    return `${base.trim()}\n\n[landing] ${suffix}`;
  }

  /** @param {string} msg */
  function buildUrl(msg) {
    const text = encodeURIComponent(msg.trim() || "Olá!");
    return digits ? `https://wa.me/${digits}?text=${text}` : "#";
  }

  document.querySelectorAll("[data-wa-href]").forEach((el) => {
    const anchor = /** @type {HTMLAnchorElement} */ (el);
    const rawMsg = anchor.getAttribute("data-wa-msg") || "";
    const fullMsg = appendUtmToMessage(rawMsg);
    anchor.setAttribute("href", buildUrl(fullMsg));
    const placement = anchor.getAttribute("data-wa-placement") || "unknown";
    const productId = anchor.getAttribute("data-product-id") || null;

    if (!digits) {
      anchor.addEventListener("click", (e) => {
        e.preventDefault();
        alert("Configure o número: atributo data-whatsapp no elemento <body>.");
      });
    } else {
      anchor.setAttribute("rel", "noopener noreferrer");
      anchor.setAttribute("target", "_blank");
      anchor.addEventListener("click", () => {
        document.dispatchEvent(
          new CustomEvent("whatsapp_cta_click", {
            detail: {
              placement,
              productId,
              utm,
              messagePreview: fullMsg.slice(0, 200),
            },
          }),
        );
      });
    }
  });
})();


## FILE: css/styles.css

:root {
  --color-bg: #faf7f2;
  --color-surface: #ffffff;
  --color-text: #2a2622;
  --color-muted: #5c564e;
  --color-border: #e8e1d6;
  --color-accent: #c45c26;
  --color-accent-hover: #a64d1f;
  --color-whatsapp: #25d366;
  --color-whatsapp-hover: #1ebe57;
  --font-sans: "Segoe UI", system-ui, -apple-system, sans-serif;
  --radius: 12px;
  --shadow-soft: 0 18px 40px rgba(42, 38, 34, 0.08);
  --container: min(1120px, calc(100% - 2rem));
}

*,
*::before,
*::after {
  box-sizing: border-box;
}

html {
  scroll-behavior: smooth;
}

@media (prefers-reduced-motion: reduce) {
  html {
    scroll-behavior: auto;
  }
}

body {
  margin: 0;
  font-family: var(--font-sans);
  font-size: 1rem;
  line-height: 1.6;
  color: var(--color-text);
  background: var(--color-bg);
}

img {
  max-width: 100%;
  height: auto;
  display: block;
}

a {
  color: inherit;
}

.skip-link {
  position: absolute;
  left: 1rem;
  top: -100px;
  background: var(--color-surface);
  padding: 0.5rem 1rem;
  border-radius: 6px;
  z-index: 100;
  box-shadow: var(--shadow-soft);
}

.skip-link:focus {
  top: 1rem;
}

.container {
  width: var(--container);
  margin-inline: auto;
}

/* Header */
.site-header {
  position: sticky;
  top: 0;
  z-index: 50;
  background: rgba(250, 247, 242, 0.92);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--color-border);
}

.site-header__inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.85rem 0;
}

.logo {
  font-weight: 700;
  font-size: 1.15rem;
  letter-spacing: -0.02em;
}

.logo__accent {
  color: var(--color-accent);
}

.header-cta {
  display: none;
}

@media (min-width: 640px) {
  .header-cta {
    display: inline-flex;
  }
}

/* Buttons */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.65rem 1.1rem;
  font-weight: 600;
  font-size: 0.95rem;
  text-decoration: none;
  border-radius: 999px;
  border: 2px solid transparent;
  cursor: pointer;
  transition: background 0.2s, color 0.2s, border-color 0.2s, transform 0.15s;
}

.btn:focus-visible {
  outline: 3px solid #2b6cb0;
  outline-offset: 2px;
}

.btn:active {
  transform: translateY(1px);
}

.btn--primary {
  background: var(--color-whatsapp);
  color: #fff;
  border-color: var(--color-whatsapp);
}

.btn--primary:hover {
  background: var(--color-whatsapp-hover);
  border-color: var(--color-whatsapp-hover);
}

.btn--outline {
  background: transparent;
  border-color: var(--color-text);
  color: var(--color-text);
}

.btn--outline:hover {
  background: var(--color-text);
  color: var(--color-surface);
}

.btn--ghost {
  background: transparent;
  border-color: var(--color-border);
  color: var(--color-text);
}

.btn--ghost:hover {
  border-color: var(--color-muted);
  background: var(--color-surface);
}

.btn--large {
  padding: 0.85rem 1.35rem;
  font-size: 1rem;
}

.btn--xlarge {
  padding: 1rem 1.75rem;
  font-size: 1.05rem;
}

.btn--block {
  width: 100%;
}

.btn__icon {
  display: inline-flex;
}

/* Hero */
.hero {
  padding: 2.5rem 0 3rem;
}

.hero__grid {
  display: grid;
  gap: 2rem;
  align-items: center;
}

@media (min-width: 900px) {
  .hero__grid {
    grid-template-columns: 1fr 1fr;
    gap: 3rem;
  }
}

.eyebrow {
  margin: 0 0 0.75rem;
  font-size: 0.8rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--color-muted);
}

.hero__title {
  margin: 0 0 1rem;
  font-size: clamp(1.85rem, 4vw, 2.6rem);
  line-height: 1.15;
  letter-spacing: -0.03em;
}

.hero__lead {
  margin: 0 0 1.5rem;
  font-size: 1.05rem;
  color: var(--color-muted);
  max-width: 36rem;
}

.hero__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-bottom: 1.25rem;
}

.hero__proof {
  margin: 0;
  font-size: 0.9rem;
  color: var(--color-muted);
}

.hero__proof strong {
  color: var(--color-text);
}

.hero__visual {
  position: relative;
}

.hero__visual::after {
  content: "";
  position: absolute;
  inset: 8% -4% -4% 8%;
  background: linear-gradient(135deg, rgba(196, 92, 38, 0.15), transparent);
  border-radius: calc(var(--radius) + 8px);
  z-index: -1;
}

.hero__img {
  width: 100%;
  border-radius: var(--radius);
  box-shadow: var(--shadow-soft);
  object-fit: cover;
  aspect-ratio: 8 / 9;
}

/* Sections */
.section {
  padding: 3.5rem 0;
}

.section__head {
  text-align: center;
  max-width: 36rem;
  margin: 0 auto 2.5rem;
}

.section__title {
  margin: 0 0 0.5rem;
  font-size: clamp(1.5rem, 3vw, 2rem);
  letter-spacing: -0.02em;
}

.section__subtitle {
  margin: 0;
  color: var(--color-muted);
}

.benefits {
  background: var(--color-surface);
  border-block: 1px solid var(--color-border);
}

.benefits__grid {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 1.25rem;
}

@media (min-width: 600px) {
  .benefits__grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (min-width: 960px) {
  .benefits__grid {
    grid-template-columns: repeat(5, 1fr);
    gap: 1rem;
  }
}

.benefit-card {
  padding: 1.25rem;
  border-radius: var(--radius);
  border: 1px solid var(--color-border);
  background: var(--color-bg);
}

.benefit-card__icon {
  display: flex;
  color: var(--color-accent);
  margin-bottom: 0.75rem;
}

.benefit-card__title {
  margin: 0 0 0.35rem;
  font-size: 1rem;
}

.benefit-card__text {
  margin: 0;
  font-size: 0.9rem;
  color: var(--color-muted);
}

/* Reforço de confiança (opcional no plano — síntese comercial sem números inventados) */
.trust-strip {
  padding: 2.25rem 0;
  background: linear-gradient(180deg, #f0ebe2 0%, var(--color-bg) 100%);
  border-bottom: 1px solid var(--color-border);
}

.trust-strip__inner {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

@media (min-width: 768px) {
  .trust-strip__inner {
    flex-direction: row;
    align-items: flex-start;
    gap: 2rem;
  }
}

.trust-strip__title {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  flex-shrink: 0;
  max-width: 14rem;
}

@media (min-width: 768px) {
  .trust-strip__title {
    padding-top: 0.15rem;
  }
}

.trust-strip__grid {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 1.25rem;
  flex: 1;
}

@media (min-width: 600px) {
  .trust-strip__grid {
    grid-template-columns: repeat(3, 1fr);
    gap: 1rem;
  }
}

.trust-strip__item {
  margin: 0;
}

.trust-strip__lead {
  display: block;
  font-size: 0.95rem;
  margin-bottom: 0.35rem;
  color: var(--color-text);
}

.trust-strip__text {
  margin: 0;
  font-size: 0.85rem;
  line-height: 1.5;
  color: var(--color-muted);
}

.products__grid {
  display: grid;
  gap: 1.5rem;
}

@media (min-width: 700px) {
  .products__grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (min-width: 1024px) {
  .products__grid {
    grid-template-columns: repeat(4, 1fr);
  }
}

.product-card {
  background: var(--color-surface);
  border-radius: var(--radius);
  overflow: hidden;
  border: 1px solid var(--color-border);
  box-shadow: 0 8px 24px rgba(42, 38, 34, 0.06);
  display: flex;
  flex-direction: column;
}

.product-card__img {
  width: 100%;
  aspect-ratio: 4 / 3;
  object-fit: cover;
}

.product-card__body {
  padding: 1.1rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  flex: 1;
}

.product-card__name {
  margin: 0;
  font-size: 1.05rem;
}

.product-card__price {
  margin: 0;
  font-size: 0.95rem;
  color: var(--color-muted);
}

.product-card__price strong {
  color: var(--color-text);
}

.product-card__desc {
  margin: 0;
  font-size: 0.875rem;
  line-height: 1.45;
  color: var(--color-muted);
  flex: 1;
}

.product-card .btn {
  margin-top: auto;
}

/* CTA final */
.cta-final {
  padding: 4rem 0;
}

.cta-final__inner {
  background: linear-gradient(145deg, #2a2622 0%, #3d3530 100%);
  color: #f5f0e8;
  border-radius: calc(var(--radius) + 4px);
  padding: 2.5rem 2rem;
  display: flex;
  flex-direction: column;
  gap: 1.75rem;
  align-items: flex-start;
  box-shadow: var(--s
