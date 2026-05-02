# Project Scan

## Summary

Projeto de landing page estática para captação de leads de sofás, com CTA para WhatsApp, leitura de UTMs na URL e disparo de evento customizado no navegador. Pelas evidências fornecidas, não há backend, banco de dados, pipeline de build, package manager ou infraestrutura definida no repositório analisado.

## Stack

- Frontend: HTML, CSS e JavaScript vanilla
- Backend: Não identificado
- Database: Não identificado
- Infra: Não identificada; hospedagem estática é compatível, mas não confirmada
- Package manager: Não identificado
- Build tool: Não identificado

## Project Structure

Principais pastas e responsabilidades observadas:

- `index.html`
  - Página principal da landing
  - Define conteúdo, seções e CTAs
  - Configura o número de WhatsApp via `data-whatsapp` no `<body>`

- `css/styles.css`
  - Estilos globais
  - Layout responsivo
  - Componentes visuais como header, hero, benefícios, produtos e CTA final

- `js/main.js`
  - Gera links `wa.me`
  - Lê UTMs da query string
  - Enriquecimento da mensagem enviada ao WhatsApp
  - Dispara evento customizado `whatsapp_cta_click`

- `.setup-boss/`
  - Contexto local do projeto
  - Inclui `knowledge-base.md` e scan anterior
  - Não faz parte do runtime da aplicação

- `setup-boss/`
  - Contexto global/operacional do sistema Setup Boss
  - Não faz parte da aplicação runtime principal

## Available Commands

Não foram encontrados `package.json`, `README`, `Dockerfile`, `docker-compose.yml`, scripts de automação ou arquivos de configuração de ferramentas.

Comandos encontrados para:

- instalar:
  - não identificado

- rodar local:
  - abrir `index.html` no navegador
  - opcionalmente servir via servidor estático local

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
  - O projeto fornecido é estático
  - Não há evidência de persistência, API ou integração com banco

## Environments

- Local:
  - Executável abrindo `index.html` no navegador
  - O comportamento dos CTAs depende de `data-whatsapp` no `<body>`
  - UTMs são lidas diretamente da URL da página

- Homologação:
  - Não identificada

- Produção:
  - Não identificada

- Variáveis relevantes:
  - `data-whatsapp` no `<body>`: número usado para gerar links do WhatsApp
  - Parâmetros de URL:
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
  - validação do evento `whatsapp_cta_click` via listener no `document`

Pontos importantes de depuração:

- verificar se o `<body>` possui `data-whatsapp` com apenas dígitos
- verificar se os CTAs possuem `data-wa-href`
- verificar se `data-wa-msg` e `data-wa-placement` estão presentes quando esperado
- confirmar se o `href` final foi montado como `https://wa.me/...`
- confirmar se as UTMs da URL foram incorporadas à mensagem
- quando `data-whatsapp` estiver ausente/inválido:
  - o script mantém `href="#"` e intercepta clique com `alert`

## Validation

Como validar mudanças com segurança:

- abrir a landing no navegador e verificar renderização geral
- validar responsividade em larguras diferentes
- testar CTAs com `data-wa-href`
- confirmar que:
  - com `data-whatsapp` válido, os links abrem em nova aba para `wa.me`
  - sem `data-whatsapp`, há aviso no console e bloqueio por `alert`
  - UTMs presentes na URL entram no texto da mensagem
  - o evento `whatsapp_cta_click` é disparado ao clicar
- validar acessibilidade básica observável:
  - `skip-link`
  - foco visível em botões
  - estrutura semântica por seções
  - `alt` em imagens

## Risks / Unknowns

Pontos não confirmados ou riscos:

- não há evidência de testes automatizados
- não há evidência de lint
- não há README do projeto
- não há pipeline de build ou empacotamento
- não há definição de deploy/hospedagem no material fornecido
- não há integração confirmada com GTM/GA; existe apenas evento customizado pronto para consumo
- dependência externa de imagens do Unsplash
- o `index.html` fornecido está truncado no trecho exibido, então a página completa não foi totalmente confirmada
- o `css/styles.css` também está truncado no final, então não foi possível confirmar o arquivo completo
- o valor atual de `data-whatsapp` é placeholder (`5511999999999`), o que é risco operacional para publicação
- há um problema visível em `js/main.js`: a função `appendUtmToMessage(base)` usa `Object.entries(u)`, mas a variável definida anteriormente é `utm`; isso indica risco real de erro em runtime se o arquivo estiver exatamente como fornecido
- não foi identificado processo formal de atualização de conteúdo, imagens ou número de contato

## Recommendations

Próximos passos recomendados para melhorar o contexto do projeto:

- confirmar o conteúdo completo de `index.html` e `css/styles.css`, pois os trechos fornecidos parecem parciais
- confirmar se `js/main.js` está exatamente como enviado, especialmente o uso de `u` em vez de `utm`
- documentar forma oficial de execução e publicação
- registrar checklist operacional de publicação, incluindo validação obrigatória de `data-whatsapp`
- confirmar se haverá consumo do evento `whatsapp_cta_click` por GTM/GA ou outra ferramenta
- mapear responsável pela troca de textos, imagens e número de WhatsApp
- registrar ambiente real de hospedagem, URL e fluxo de deploy, se existirem

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