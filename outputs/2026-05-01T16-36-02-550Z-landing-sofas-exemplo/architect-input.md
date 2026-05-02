Atue como Arquiteto de Software Sênior.

Você está trabalhando em um projeto real, com contexto já existente.

## OBJETIVO

- entender a task
- identificar lacunas
- considerar contexto do projeto
- propor abordagem viável
- montar plano claro e executável

## REGRAS

- não gerar código
- não assumir stack diferente da existente
- não sugerir soluções genéricas sem validar contexto
- questionar inconsistências
- priorizar simplicidade

## FORMATO DA RESPOSTA

### Entendimento
Explique o que será feito considerando o projeto atual.

### Riscos
Liste riscos técnicos, de escopo e de execução.

### Plano
Passo a passo claro, focado em execução pelo Cursor.

## PROJECT SCAN

# Project Scan

## Summary
Projeto de landing page estática para venda/orçamento de sofás, com CTA para WhatsApp e rastreio básico via parâmetros UTM e evento customizado no navegador. Não há evidência de backend, build pipeline, banco de dados ou infraestrutura própria no conteúdo fornecido.

## Stack
- Frontend: HTML, CSS e JavaScript vanilla
- Backend: Não identificado / provavelmente inexistente no projeto atual
- Database: Não identificado
- Infra: Hospedagem estática inferida como opção viável, mas não confirmada
- Package manager: Não identificado
- Build tool: Não identificado

## Project Structure
Principais pastas e responsabilidades observadas:

- `index.html`
  - Página principal da landing
  - Estrutura semântica da interface
  - Configuração do número de WhatsApp via `data-whatsapp` no `<body>`

- `css/styles.css`
  - Estilos globais
  - Layout responsivo
  - Componentes visuais como header, hero, botões, cards e seções

- `js/main.js`
  - Lógica de montagem dos links do WhatsApp
  - Leitura de UTMs da URL
  - Enriquecimento da mensagem enviada ao WhatsApp
  - Disparo de evento customizado `whatsapp_cta_click`

- `.setup-boss/` e `setup-boss/`
  - Pastas de documentação/contexto de automação
  - Não fazem parte da aplicação runtime principal

## Available Commands
Não foram encontrados arquivos como `package.json`, `README`, `Dockerfile`, `docker-compose.yml`, scripts shell ou configs de ferramentas de build/teste.

Comandos encontrados para:
- instalar: não identificado
- rodar local: abrir `index.html` diretamente no navegador é possível; opcionalmente servir via servidor estático local
- build: não identificado
- testes: não identificado
- lint: não identificado
- migrations: não identificado

## Database
- Tipo: não identificado
- ORM/query builder: não identificado
- Migrations: não identificado
- Como conectar: não se aplica com base nas evidências atuais
- Observações:
  - O projeto analisado é estático no material fornecido
  - Não há consumo de API, persistência local estruturada ou integração visível com banco

## Environments
- Local:
  - Pode ser executado localmente abrindo `index.html` no navegador
  - O comportamento depende do atributo `data-whatsapp` no `<body>`
  - UTMs são lidas da query string da URL

- Homologação:
  - Não identificada
  - Inferência: facilmente publicável em ambiente estático

- Produção:
  - Não identificada
  - Inferência: compatível com hospedagem estática/CDN

- Variáveis relevantes:
  - `data-whatsapp` no `<body>`: número usado para gerar links `wa.me`
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
  - Inspeção dos links gerados em elementos com `data-wa-href`
  - Validação do evento customizado `whatsapp_cta_click` via listeners no `document`

- Pontos importantes de depuração:
  - Verificar se o `<body>` possui `data-whatsapp` com apenas dígitos
  - Verificar se os CTAs possuem `data-wa-msg` e `data-wa-placement`
  - Confirmar se a URL final do `href` está sendo montada como `https://wa.me/...`
  - Confirmar leitura das UTMs na URL da página

## Validation
Como validar mudanças com segurança:

- Abrir a landing no navegador e verificar renderização geral
- Validar responsividade em diferentes larguras
- Testar CTAs com `data-wa-href`
- Confirmar que:
  - sem `data-whatsapp`, ocorre aviso no console e bloqueio com `alert`
  - com `data-whatsapp`, links abrem nova aba com `wa.me`
  - UTMs presentes na URL são incorporadas ao texto enviado
  - o evento `whatsapp_cta_click` é disparado ao clicar nos CTAs
- Verificar acessibilidade básica:
  - `skip-link`
  - foco visível em botões
  - textos alternativos de imagem
  - estrutura semântica de seções

## Risks / Unknowns
Pontos não confirmados ou riscos:

- Não há evidência de pipeline de build, testes automatizados ou lint
- Não há README nem documentação operacional da aplicação
- Não há backend, analytics real ou integração GTM/GA implementada; apenas evento customizado preparado
- Dependência externa de imagens hospedadas no Unsplash
- O `index.html` fornecido aparenta estar truncado no trecho exibido, então a estrutura completa da página não foi totalmente confirmada
- O arquivo `css/styles.css` também aparenta estar truncado no final, então não foi possível confirmar o encerramento completo das regras
- O projeto depende de configuração manual no HTML (`data-whatsapp`), o que pode gerar erro operacional simples
- Não foi identificado mecanismo de minificação, cache busting ou versionamento de assets
- Não foi identificado ambiente de deploy ou servidor web

## Recommendations
Próximos passos recomendados para melhorar o contexto do projeto:

- Confirmar se existe documentação fora dos arquivos fornecidos
- Confirmar forma oficial de publicação/deploy da landing
- Confirmar se haverá integração com GTM/GA ou outra ferramenta analítica
- Confirmar se a landing será mantida como site estático puro ou incorporada em outro stack
- Validar o HTML e CSS completos, pois os trechos exibidos parecem parciais
- Mapear processo operacional para atualização de número, textos, produtos e imagens
- Se existir ambiente de hospedagem, registrar URL, fluxo de publicação e responsáveis técnicos

## Confirmed vs Inferred
### Confirmado
- Projeto contém `index.html`, `css/styles.css` e `js/main.js`
- Frontend é feito com HTML/CSS/JS vanilla
- Há geração dinâmica de links de WhatsApp
- Há leitura de parâmetros UTM da URL
- Há disparo de evento `whatsapp_cta_click`
- Não foram encontrados arquivos típicos de Node, Docker, banco ou backend

### Inferido
- Projeto é uma landing page estática
- Pode ser hospedado em infraestrutura estática
- Não há backend ativo associado a este repositório atual
- Execução local pode ser feita apenas abrindo o HTML ou usando servidor estático simples

## TASK

Criar uma landing page de sofás com:

- hero
- benefícios
- produtos
- CTA WhatsApp
