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

Principais pastas e responsabilidades observados:

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

Pontos não confirmados ou riscos:

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