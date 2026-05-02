Você está trabalhando em um projeto real.

## PROJETO

{{PROJECT_CONTEXT}}

## OBJETIVO

Criar uma landing page de sofás com:

- hero
- benefícios
- produtos
- CTA WhatsApp

## PLANO

### Entendimento
A task, pelo contexto atual do projeto, é construir ou ajustar a landing page estática de sofás usando a stack já existente: `index.html`, `css/styles.css` e `js/main.js`, mantendo o fluxo principal de conversão via WhatsApp.

Como o scan já indica que o projeto é exatamente uma landing estática com CTA para WhatsApp, essa task parece estar muito mais no campo de **estruturação/completeza da página** do que de criar arquitetura nova. O escopo esperado é garantir que a landing tenha, no mínimo:

- **hero**
- **benefícios**
- **produtos**
- **CTA para WhatsApp**

Considerando o projeto atual, o ponto mais importante é **não reinventar a solução**:
- o CTA já tem uma lógica existente em `main.js`
- o número do WhatsApp já é configurado via `data-whatsapp` no `<body>`
- UTMs já são lidas da URL e anexadas à mensagem
- existe um evento customizado `whatsapp_cta_click`

Então a abordagem correta é montar a landing usando essa base já pronta, garantindo que os elementos visuais e os CTAs estejam corretamente conectados ao mecanismo existente.

Também há uma inconsistência importante no contexto: o scan sugere que a landing já possui blocos como `hero`, `benefícios`, `products` e `CTA final` no CSS. Isso indica que:
1. ou a task é completar algo parcialmente pronto,
2. ou revisar/reestruturar o HTML para refletir esses blocos,
3. ou o conteúdo atual está incompleto/truncado.

Antes de executar, vale confirmar se:
- a landing atual já existe parcialmente e deve ser **ajustada**
- ou se deve ser **reconstruída do zero dentro da estrutura existente**
- ou se há um layout/referência visual aprovado

Sem essa confirmação, há risco de retrabalho no conteúdo e na hierarquia das seções.

---

### Riscos
#### Técnicos
- **HTML atual possivelmente truncado/incompleto** no scan, então a estrutura real da página pode não estar totalmente visível.
- **Dependência do `main.js` existente**: se os CTAs novos não seguirem o padrão esperado (`data-wa-href` e afins), o WhatsApp pode não funcionar como previsto.
- **Configuração manual do número via `data-whatsapp`**: se estiver ausente ou inválida, os CTAs falham.
- **Sem build/testes automatizados**: toda validação será manual, aumentando risco de regressão visual e funcional.
- **Dependência de assets externos** (ex.: imagens remotas) pode causar instabilidade visual/performance.

#### De escopo
- A task fala em “criar uma landing page”, mas o projeto já aparenta ter essa landing parcialmente pronta. O escopo está ambíguo entre:
  - criar do zero,
  - completar,
  - refinar,
  - ou apenas reorganizar conteúdo.
- Não há definição sobre:
  - quantidade de produtos
  - conteúdo textual final
  - imagens finais
  - identidade visual aprovada
  - copy dos CTAs

#### De execução
- Sem referência visual clara, o Cursor pode produzir uma página funcional, porém desalinhada com expectativa de negócio.
- Como não há documentação operacional, pode haver dúvida sobre como validar e publicar.
- Se o HTML/CSS atual já tiver estilos definidos, mudanças estruturais podem gerar efeito colateral em responsividade e espaçamentos.

---

### Plano
1. **Inspecionar o estado real dos arquivos atuais**
   - Validar o conteúdo completo de `index.html`, `css/styles.css` e `js/main.js`.
   - Confirmar se já existem seções de hero, benefícios, produtos e CTA final implementadas ou parcialmente montadas.
   - Identificar o padrão exato usado pelos CTAs de WhatsApp no HTML.

2. **Fechar as lacunas de escopo antes de editar**
   - Confirmar se a expectativa é:
     - criar a landing do zero no HTML atual,
     - completar uma estrutura existente,
     - ou refinar uma landing já pronta.
   - Confirmar quantidade de produtos a exibir.
   - Confirmar se há textos e imagens definitivos ou se serão usados placeholders temporários.
   - Confirmar se existe referência visual/layout aprovado.

3. **Definir a estrutura mínima da landing dentro do projeto atual**
   - Organizar a página com seções claras e simples:
     - hero
     - benefícios
     - produtos
     - CTA final
   - Garantir que a hierarquia no HTML favoreça leitura e manutenção.
   - Evitar criar blocos extras sem necessidade, para manter simplicidade.

4. **Mapear os CTAs para a lógica já existente**
   - Garantir que todos os botões de contato usem o padrão já suportado pelo `main.js`.
   - Reaproveitar integralmente a montagem do link `wa.me`, leitura de UTMs e evento `whatsapp_cta_click`.
   - Validar se haverá um único tipo de mensagem ou se cada seção/produto precisa de variação de intenção.

5. **Ajustar o conteúdo visual no `index.html`**
   - Hero:
     - título principal claro
     - subtítulo com proposta de valor
     - CTA principal para WhatsApp
   - Benefícios:
     - blocos curtos com argumentos de confiança/valor
   - Produtos:
     - cards ou blocos com nome, imagem, descrição resumida e CTA
   - CTA final:
     - reforço de conversão com botão para WhatsApp

6. **Reaproveitar e ajustar o CSS existente**
   - Verificar se `styles.css` já possui blocos para essas seções.
   - Priorizar ajuste dos estilos existentes em vez de reestruturar tudo.
   - Garantir:
     - consistência visual
     - responsividade
     - contraste dos CTAs
     - espaçamento entre seções
   - Evitar complexidade desnecessária ou padrões novos fora do estilo atual.

7. **Validar integração funcional do WhatsApp**
   - Confirmar que o `<body>` possui `data-whatsapp` válido.
   - Verificar se os elementos com CTA recebem `href` final corretamente.
   - Testar com e sem UTMs na URL.
   - Confirmar se a mensagem enviada ao WhatsApp está coerente com a jornada da landing.

8. **Executar validação manual completa**
   - Abrir a página localmente no navegador.
   - Validar:
     - renderização das seções
     - comportamento responsivo
     - imagens
     - funcionamento de todos os CTAs
     - disparo do evento `whatsapp_cta_click`
     - fallback quando `data-whatsapp` estiver ausente

9. **Revisar simplicidade e manutenção**
   - Remover duplicações desnecessárias no HTML.
   - Garantir que os textos e CTAs estejam fáceis de editar.
   - Verificar se a landing continua operável sem dependência de tooling ou setup extra.

10. **Documentar o mínimo necessário no contexto da task**
   - Registrar:
     - onde alterar número do WhatsApp
     - quais elementos funcionam como CTA
     - como validar UTMs
     - checklist manual de conferência final

Se quiser, no próximo passo eu posso transformar isso em um **plano operacional para o Cursor**, com instruções objetivas do tipo “abrir arquivo X, validar Y, alterar Z, testar A/B”.

## REGRAS

- Não alterar partes não relacionadas
- Não adicionar dependências sem necessidade
- Seguir a estrutura existente do projeto
- Parar se houver divergência entre plano e código real

## FORMATO DE RESPOSTA

1. Resumo
2. Arquivos alterados
3. Como validar
4. Checks executados
5. Problemas
6. Próximo passo

## PROJECT TARGET

Projeto: landing-sofas
Caminho: C:\Users\pierr\Documents\automacao\landing-sofas

## PROJECT CONTEXT



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

## PROJECT DECISIONS



## PROJECT KNOWLEDGE



## IMPORTANT RULE

Antes de alterar qualquer arquivo, confirme mentalmente que está trabalhando no projeto alvo acima.
Se a estrutura real do projeto divergir do plano, PARE e explique a divergência.
