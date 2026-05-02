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
Projeto de landing page estática para venda/orçamento de sofás com CTA para WhatsApp. A aplicação é composta por HTML, CSS e JavaScript vanilla, sem evidência de backend, build pipeline, banco de dados ou infraestrutura definida no repositório analisado.

## Stack
- Frontend: HTML5, CSS3, JavaScript vanilla
- Backend: Não identificado
- Database: Não identificado
- Infra: Não identificada
- Package manager: Não identificado
- Build tool: Não identificado

## Project Structure
Principais pastas e responsabilidades:

- `index.html`
  - Página principal da landing
  - Conteúdo, CTAs, SEO básico (`meta description`), configuração do número do WhatsApp via `data-whatsapp`
- `css/styles.css`
  - Estilos globais da landing
  - Organização por blocos visuais: header, botões, hero, benefícios, trust strip, products, CTA final
  - Uso de CSS custom properties em `:root`
- `js/main.js`
  - Lógica client-side para:
    - montar links `wa.me`
    - ler UTMs da URL
    - anexar UTMs à mensagem enviada ao WhatsApp
    - disparar evento customizado `whatsapp_cta_click`
- `.setup-boss/`
  - Arquivos internos de contexto/scan
- `setup-boss/`
  - Base de conhecimento/contexto do processo de setup
- Não há evidência de:
  - `package.json`
  - `README`
  - `Dockerfile`
  - `docker-compose.yml`
  - `.env.example`
  - pasta `src/`
  - testes automatizados
  - configs de lint/formatter

## Available Commands
Comandos encontrados para:

- instalar
  - Nenhum comando encontrado
- rodar local
  - Não há scripts declarados
  - Confirmado apenas que é possível abrir `index.html` diretamente no navegador
  - Inferência: pode ser servido por qualquer servidor estático simples
- build
  - Nenhum comando encontrado
- testes
  - Nenhum comando encontrado
- lint
  - Nenhum comando encontrado
- migrations
  - Nenhum comando encontrado

## Database
- Tipo: Não identificado
- ORM/query builder: Não identificado
- Migrations: Não identificadas
- Como conectar: Não aplicável com base na evidência atual
- Observações:
  - Não há sinais de persistência de dados no projeto
  - O fluxo principal direciona o usuário para WhatsApp, sem formulário com backend

## Environments
- Local:
  - Confirmado: pode funcionar como site estático local
  - Requer configurar `data-whatsapp` no `<body>` para comportamento final correto dos CTAs
- Homologação:
  - Não identificada
- Produção:
  - Não identificada
- Variáveis relevantes:
  - Confirmado:
    - `data-whatsapp` no elemento `<body>`: número do WhatsApp em formato numérico com código do país
  - Confirmado via URL:
    - `utm_source`
    - `utm_medium`
    - `utm_campaign`
    - `utm_content`
    - `utm_term`
  - Essas UTMs são lidas da query string e anexadas ao texto enviado ao WhatsApp

## Logs & Debugging
Onde procurar logs e como debugar:

- Console do navegador
  - `main.js` usa `console.warn` quando `data-whatsapp` não está configurado
- Eventos customizados no documento
  - `whatsapp_cta_click` é disparado ao clicar em CTAs válidos
  - Pode ser inspecionado no DevTools ou integrado futuramente com GTM/GA
- Validação manual dos links
  - Inspecionar os elementos com `data-wa-href` e verificar o `href` final gerado
- Debug funcional
  - Testar com e sem `data-whatsapp`
  - Testar URLs com parâmetros UTM para confirmar que são incorporados à mensagem

## Validation
Como validar mudanças com segurança:

- Validar visualmente no navegador:
  - responsividade da landing
  - carregamento de imagens
  - comportamento de header, hero, cards e CTAs
- Validar links de WhatsApp:
  - confirmar se os anchors com `data-wa-href` recebem `href` no formato `https://wa.me/...`
  - confirmar `target="_blank"` e `rel="noopener noreferrer"`
- Validar UTMs:
  - abrir a página com query params `utm_*`
  - clicar nos CTAs e verificar se a mensagem final contém o bloco `[landing] ...`
- Validar fallback:
  - remover ou invalidar `data-whatsapp`
  - confirmar alerta e bloqueio da navegação
- Validar evento customizado:
  - observar disparo de `whatsapp_cta_click` no clique dos botões

## Risks / Unknowns
Pontos não confirmados ou riscos:

- Confirmado:
  - Não há stack de backend no material fornecido
  - Não há automação de testes
  - Não há documentação operacional no repositório analisado
  - Não há pipeline de build/deploy visível
- Inferência:
  - Projeto pode depender de publicação manual em hospedagem estática
  - Mudanças podem ser validadas apenas manualmente, aumentando risco de regressão visual
- Riscos iniciais:
  - Dependência de configuração manual do número via `data-whatsapp`
  - Ausência de ambiente/config padronizado
  - Dependência externa de imagens hospedadas no Unsplash
  - Dependência do canal WhatsApp como único fluxo de conversão
  - HTML fornecido parece truncado no trecho exibido, então a estrutura completa da página não está 100% confirmada
  - Sem README, não há instrução oficial de execução/publicação
  - Sem analytics configurado no repositório; apenas hook de evento pronto para integração

## Recommendations
Próximos passos recomendados para melhorar o contexto do projeto:

- Confirmar como a landing é publicada hoje:
  - abertura direta do HTML
  - hospedagem estática
  - CDN/plataforma específica
- Confirmar se existe versionamento externo ou arquivos não incluídos no scan:
  - README
  - package.json
  - instruções de deploy
- Mapear a estrutura completa do `index.html`, já que o conteúdo fornecido está parcial
- Verificar se há requisito de integração com:
  - Google Tag Manager
  - Google Analytics
  - Meta Pixel
- Documentar explicitamente:
  - número/configuração do WhatsApp
  - processo de edição de textos/imagens
  - checklist de validação manual
- Se o objetivo for operação recorrente, registrar um padrão mínimo de execução local e publicação, mesmo sendo projeto estático

## TASK

Criar uma landing page de sofás com:

- hero
- benefícios
- produtos
- CTA WhatsApp
