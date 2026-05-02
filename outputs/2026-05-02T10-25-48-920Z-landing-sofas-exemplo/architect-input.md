# Agent: Architect
# Version: 1.3.0
# Updated: 2026-05-01

Atue como Arquiteto de Software Sênior dentro do pipeline Setup Boss.

Seu papel é transformar uma task em um plano técnico seguro, limitado e executável.

---

## Objetivo

- entender a task
- identificar lacunas
- propor abordagem segura
- montar plano claro
- limitar escopo de execução
- declarar arquivos prováveis de atuação
- definir critérios de validação
- validar definição de aceite da task

Você NÃO deve gerar código final.

---

## Responsabilidade única

Planejar a execução técnica antes da implementação.

---

## Input esperado

Receba:

- task original
- Project Scan
- contexto global do Setup Boss
- contexto local do projeto
- critérios de aceite
- restrições técnicas conhecidas
- histórico relevante da execução quando existir

---

## Output esperado

Você DEVE retornar duas partes:

---

### 1. JSON estruturado (primeira parte da resposta)

```json
{
  "task_valid": true,
  "acceptance_level": "development | staging | production | null",
  "has_acceptance_criteria": true,
  "risks": [],
  "missing_definitions": [],
  "summary": "resumo objetivo"
}

## ENFORCEMENT REQUIREMENTS

Sua resposta DEVE conter obrigatoriamente estas seções:

## Entendimento
## Riscos
## Arquivos prováveis
## Plano
## Critério de parada

Regras invioláveis:

- Não proponha alteração arquitetural sem aprovação explícita.
- Não proponha troca de stack.
- Não proponha instalação de dependência sem justificativa explícita.
- Não proponha refatoração fora do escopo.
- Em "## Arquivos prováveis", liste caminhos relativos ao projeto, um por linha.
- Se houver divergência entre task, scan e código, pare e reporte em "## Critério de parada".

## PROJECT SCAN

# Project Scan

## Summary

Projeto de landing page estática em português para captação de leads de sofás, com CTA para WhatsApp. Pelas evidências fornecidas, o projeto roda apenas no navegador, usa HTML/CSS/JavaScript vanilla, lê UTMs da URL e monta links `wa.me` dinamicamente. Não há evidência de backend, banco de dados, package manager, build tool, testes automatizados ou infraestrutura declarada no repositório analisado.

## Stack

- Frontend: HTML, CSS, JavaScript vanilla
- Backend: Não identificado
- Database: Não identificado
- Infra: Não identificada; compatível com hospedagem estática, mas isso é inferência, não confirmação
- Package manager: Não identificado
- Build tool: Não identificado

## Project Structure

Principais arquivos e pastas observados:

- `index.html`
  - Página principal da landing
  - Contém estrutura de conteúdo, hero, benefícios e CTAs
  - Define o número do WhatsApp no atributo `data-whatsapp` do `<body>`

- `css/styles.css`
  - Estilos globais da landing
  - Responsividade e componentes visuais
  - Evidência de seções como header, hero, benefícios, produtos e CTA final

- `js/main.js`
  - Lógica de CTA do WhatsApp
  - Leitura de UTMs da URL
  - Montagem do link `https://wa.me/...`
  - Disparo de evento customizado `whatsapp_cta_click`

- `.setup-boss/`
  - Contexto local do projeto
  - Inclui `knowledge-base.md`, `project-scan.md` e input de scan
  - Não faz parte do runtime da landing

- `setup-boss/`
  - Pasta de contexto operacional/sistema
  - Não faz parte da aplicação runtime principal

## Available Commands

Não foram encontrados `package.json`, `README`, `Dockerfile`, `docker-compose.yml`, scripts automatizados ou configs de ferramentas de build/test/lint.

Comandos encontrados para:

- instalar:
  - não identificado

- rodar local:
  - abrir `index.html` no navegador
  - opcionalmente servir por servidor estático local, embora isso não esteja documentado no projeto

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
- Como conectar: não se aplica com base nas evidências atuais
- Observações:
  - O projeto analisado é estático
  - Não há evidência de persistência local, API ou banco de dados

## Environments

- Local:
  - Aparentemente executável diretamente no navegador via `index.html`
  - O comportamento dos CTAs depende de `data-whatsapp` no `<body>`
  - As UTMs são capturadas da query string da URL

- Homologação:
  - Não identificada

- Produção:
  - Não identificada

- Variáveis relevantes:
  - `data-whatsapp` no `<body>`: número usado para gerar os links de WhatsApp
  - Parâmetros de URL suportados:
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
  - inspeção do evento customizado `whatsapp_cta_click` via listener no `document`

Pontos práticos de depuração:

- verificar se o `<body>` possui `data-whatsapp` com dígitos válidos
- verificar se os CTAs possuem `data-wa-href`
- verificar atributos opcionais:
  - `data-wa-msg`
  - `data-wa-placement`
  - `data-product-id`
- confirmar se o `href` final foi montado como `https://wa.me/...`
- confirmar se as UTMs da URL foram anexadas à mensagem
- quando `data-whatsapp` estiver ausente/inválido:
  - o script mantém `href="#"` e intercepta clique com `alert`

## Validation

Como validar mudanças com segurança:

- abrir a landing no navegador e verificar renderização geral
- validar comportamento responsivo em larguras diferentes
- testar CTAs com `data-wa-href`
- confirmar que:
  - com `data-whatsapp` válido, os links apontam para `wa.me` e abrem em nova aba
  - sem `data-whatsapp`, existe aviso no console e bloqueio por `alert`
  - UTMs presentes na URL entram no texto enviado
  - o evento `whatsapp_cta_click` é disparado no clique
- validar acessibilidade básica observável:
  - presença de `skip-link`
  - foco visível nos botões
  - estrutura semântica por seções
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
- `css/styles.css` fornecido também está truncado no final
- o valor atual de `data-whatsapp` é placeholder (`5511999999999`), o que representa risco operacional para publicação real
- há um risco forte de erro em runtime em `js/main.js`: a função `appendUtmToMessage(base)` usa `Object.entries(u)`, mas a variável disponível fora da função é `utm`; se o arquivo estiver exatamente como fornecido, isso pode causar falha
- não foi identificado processo formal para atualização de conteúdo, imagens ou número de WhatsApp

## Recommendations

Próximos passos recomendados para melhorar o contexto do projeto:

- confirmar os arquivos completos de `index.html` e `css/styles.css`, pois os trechos fornecidos parecem parciais
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

## TASK

# TASK

## Descrição

Criar uma landing page de sofás com:

- hero
- benefícios
- produtos
- CTA WhatsApp

---

## Acceptance Level (OBRIGATÓRIO)

Escolha apenas um:

- [x] development
- [ ] staging
- [ ] production

---

## Acceptance Criteria (OBRIGATÓRIO)

- [ ] estrutura da página contém:
  - hero
  - benefícios
  - produtos
  - CTA WhatsApp
- [ ] CTA WhatsApp utiliza padrão do projeto (`data-wa-href` e `data-whatsapp`)
- [ ] integração com `js/main.js` preservada
- [ ] nenhum arquivo fora do escopo foi alterado

---

## Observações (opcional)

- Landing pode reutilizar estrutura existente (`index.html`)
- Conteúdo textual pode ser placeholder
- Imagens podem ser mockadas
