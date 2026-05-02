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
A task, considerando o projeto atual, é montar ou ajustar uma **landing page estática de sofás** dentro da estrutura já existente, usando apenas o que o projeto já demonstra suportar:

- `index.html` para estrutura da página
- `css/styles.css` para layout e responsividade
- `js/main.js` para comportamento dos CTAs de WhatsApp e rastreio básico com UTM/evento customizado

Ou seja, **não estamos falando de criar aplicação nova**, nem de adicionar backend, CMS, framework ou analytics novo. A entrega precisa caber no contexto atual: uma página estática com foco comercial.

Pelo escopo informado, a landing deve conter ao menos:

- **hero**
- **benefícios**
- **produtos**
- **CTA para WhatsApp**

Além disso, como o projeto já possui lógica pronta para WhatsApp e UTMs, o ideal é **aproveitar esse mecanismo existente**, em vez de reinventar os links ou criar comportamento paralelo.

Também há um ponto importante: o scan indica que os arquivos exibidos parecem estar **truncados/parciais**. Então antes de executar, é necessário validar se:
- a landing atual já existe parcialmente
- a task é criar do zero dentro do `index.html`
- ou apenas completar/reestruturar o conteúdo existente

Isso muda o esforço e o risco de sobrescrever algo útil.

---

### Riscos

#### Técnicos
- **Arquivos possivelmente truncados** no contexto recebido: pode haver estrutura já existente no `index.html` e no CSS que não apareceu no scan.
- **Ausência de build/test/lint**: qualquer alteração é manual, então risco de regressão visual e de comportamento aumenta.
- **Dependência da configuração `data-whatsapp`**: se o número não estiver corretamente configurado no `<body>`, os CTAs podem falhar.
- **Comportamento de CTA já implementado**: se os novos botões não seguirem os atributos esperados (`data-wa-href`, `data-wa-msg`, `data-wa-placement`), o rastreio e a montagem do link podem quebrar.
- **Imagens externas**: se a landing usar imagens de terceiros sem controle, há risco de performance, indisponibilidade ou inconsistência visual.

#### De escopo
- O pedido “criar landing page de sofás” é **funcional, mas incompleto**. Faltam definições como:
  - quantidade de produtos
  - textos oficiais
  - identidade visual/marca
  - diferenciais reais do negócio
  - se haverá formulário além do WhatsApp
  - se existe conteúdo já aprovado
- “Produtos” pode significar:
  - cards simples com imagem, nome e CTA
  - catálogo maior
  - seções com preços
  - ou vitrine sem preço com foco em orçamento  
  Isso precisa ser alinhado.

#### De execução
- Sem guideline visual/documentação, o Cursor pode produzir algo “bonito”, mas desalinhado com a proposta comercial.
- Se o HTML atual já tiver blocos prontos, recriar tudo pode gerar retrabalho desnecessário.
- Como não há ambiente formal de homologação identificado, a validação ficará dependente de teste manual em navegador.

---

### Plano

#### 1. Validar o estado real do projeto
Antes de alterar qualquer coisa, o Cursor deve confirmar:
- se o `index.html` atual já contém uma landing parcial
- se a task é:
  - criar a página inteira
  - completar seções faltantes
  - ou refinar uma estrutura já pronta

Também precisa verificar:
- se o `css/styles.css` já possui padrões reutilizáveis de seção, botão, grid e cards
- se o `js/main.js` já atende totalmente os CTAs de WhatsApp sem necessidade de mudança estrutural

**Objetivo aqui:** evitar duplicação e manter simplicidade.

---

#### 2. Fechar as lacunas de conteúdo antes de montar
Há lacunas que precisam ser respondidas ou explicitamente assumidas com aprovação:

- Qual é o **nome da marca/empresa**?
- Qual é o **posicionamento**? Ex.: sofás sob medida, pronta entrega, premium, custo-benefício.
- Quantos **produtos** devem aparecer na seção?
- Os produtos terão:
  - nome
  - descrição curta
  - imagem
  - preço
  - ou apenas CTA de orçamento?
- Quais são os **benefícios reais** do negócio?
  - entrega rápida
  - fabricação própria
  - tecido impermeável
  - garantia
  - pagamento facilitado
- Há **copy comercial já definida**?
- Existe **paleta visual** ou referência de identidade?

Se essas respostas não vierem, o plano deve seguir com uma versão simples e comercialmente neutra, deixando claro que o conteúdo é provisório.

---

#### 3. Definir a estrutura mínima da landing
Com base no escopo e no projeto atual, a estrutura recomendada é:

1. **Header simples**
   - logo/nome
   - CTA principal para WhatsApp

2. **Hero**
   - título forte
   - subtítulo curto
   - CTA principal
   - imagem principal ou composição visual do sofá

3. **Benefícios**
   - 3 a 6 diferenciais
   - blocos curtos e escaneáveis

4. **Produtos**
   - grid de cards
   - imagem
   - nome
   - breve descrição
   - CTA de orçamento via WhatsApp por produto

5. **CTA de reforço**
   - bloco intermediário ou final
   - mensagem direta para falar no WhatsApp

6. **Rodapé simples**
   - contato
   - reforço da ação

Essa estrutura é suficiente para atender a task sem inflar o escopo.

---

#### 4. Reutilizar o mecanismo existente de WhatsApp
Os CTAs devem ser pensados para funcionar com o que já existe no `js/main.js`.

Então o Cursor deve:
- identificar como os botões atuais são reconhecidos
- manter o padrão de atributos exigido pelo script
- parametrizar mensagens por contexto:
  - hero
  - produto específico
  - CTA final

Exemplo conceitual de intenção, sem código:
- CTA do hero: mensagem genérica de interesse
- CTA do produto: mensagem mencionando o nome do sofá
- CTA final: mensagem de pedido de orçamento

Isso preserva:
- abertura do WhatsApp
- anexação de UTMs no texto
- evento `whatsapp_cta_click`

---

#### 5. Organizar o conteúdo com foco comercial
A página precisa ser objetiva. O Cursor deve priorizar:

- copy curta
- seções claras
- leitura rápida no mobile
- CTAs repetidos sem excesso
- consistência entre promessa e ação

Critérios práticos:
- hero com promessa principal
- benefícios respondendo “por que comprar aqui?”
- produtos respondendo “o que está disponível?”
- CTA respondendo “qual próximo passo?”

---

#### 6. Ajustar o CSS apenas no necessário
Sem inventar sistema novo de estilos.

O Cursor deve:
- reaproveitar classes e padrões existentes, se houver
- adicionar apenas o necessário para:
  - hero
  - grid de benefícios
  - cards de produtos
  - responsividade
  - destaque dos botões CTA

Prioridades:
- mobile first
- contraste adequado
- espaçamento consistente
- cards legíveis
- botão WhatsApp visualmente claro

Evitar:
- animações desnecessárias
- efeitos complexos
- excesso de variações visuais

---

#### 7. Validar a semântica e acessibilidade básica
Como é uma landing estática, a qualidade estrutural importa.

O Cursor deve checar:
- hierarquia correta de títulos
- uso de `section`, `header`, `main`, `footer`
- textos alternativos de imagem
- foco visível em links/botões
- boa legibilidade no mobile
- CTA não depender só de cor

Isso mantém o projeto simples e mais robusto.

---

#### 8. Testar manualmente o fluxo principal
Após montar a landing, validar no navegador:

- renderização geral da página
- comportamento responsivo
- presença de todos os CTAs
- funcionamento do WhatsApp com `data-whatsapp`
- passagem de UTMs na mensagem
- disparo do evento `whatsapp_cta_click`
- comportamento sem `data-whatsapp` configurado
- consistência visual entre hero, benefícios e produtos

---

#### 9. Revisar escopo final com checklist objetivo
Checklist de conclusão para o Cursor:

- hero presente e funcional
- benefícios presentes e legíveis
- produtos presentes em formato de vitrine
- todos os CTAs integrados ao fluxo existente de WhatsApp
- layout responsivo
- sem introduzir stack nova
- sem dependência de backend
- sem quebrar rastreio existente

---

#### 10. Ponto de decisão antes da execução
Antes de começar, eu questionaria explicitamente estas inconsistências/lacunas:

1. **A página deve ser criada do zero ou a atual deve ser adaptada?**
2. **Qual conteúdo comercial é oficial e qual pode ser placeholder?**
3. **Quantos produtos devem aparecer?**
4. **Os produtos terão preço ou apenas orçamento via WhatsApp?**
5. **Existe identidade visual definida ou seguimos a estética atual do projeto?**
6. **As imagens já existem no repositório ou precisarão ser provisórias?**

Se essas respostas não vierem, a abordagem mais viável é:
- entregar uma landing simples
- com copy genérica porém comercial
- sem preço
- com foco em orçamento via WhatsApp
- usando 3 a 6 produtos exemplificativos
- e reaproveitando integralmente a base atual

Se quiser, no próximo passo eu posso transformar isso em um **plano operacional ainda mais direto para o Cursor executar arquivo por arquivo**.

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

## PROJECT DECISIONS



## PROJECT KNOWLEDGE



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

## IMPORTANT RULE

Antes de alterar qualquer arquivo, confirme mentalmente que está trabalhando no projeto alvo acima.
Se a estrutura real do projeto divergir do plano, PARE e explique a divergência.
