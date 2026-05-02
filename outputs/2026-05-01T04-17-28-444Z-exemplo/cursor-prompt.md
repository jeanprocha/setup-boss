Você está trabalhando em um projeto real.

## OBJETIVO

Criar uma landing page de sofás com:

- hero
- benefícios
- produtos
- CTA WhatsApp

## DECISÃO / PLANO

## entendimento

A task é criar a estrutura de uma **landing page de sofás** com foco comercial, contendo obrigatoriamente:

- **hero**
- **benefícios**
- **produtos**
- **CTA para WhatsApp**

Como Arquiteto de Software Sênior, interpreto que o objetivo neste momento não é implementar, mas sim:

1. **entender o escopo funcional**
2. **identificar lacunas de definição**
3. **propor a abordagem de construção**
4. **organizar um plano claro de execução**

### Leitura do escopo atual

A landing page parece ser uma página única, orientada à conversão, para apresentação de sofás e geração de contato via WhatsApp.

### Estrutura mínima esperada

- **Hero**
  - proposta de valor principal
  - imagem/banner de destaque
  - chamada para ação
- **Benefícios**
  - diferenciais da marca/produto
  - argumentos de venda
- **Produtos**
  - listagem ou vitrine dos sofás
  - nome, imagem, preço ou condição, breve descrição
- **CTA WhatsApp**
  - botão fixo ou seção dedicada
  - direcionamento para conversa comercial

### Lacunas identificadas

O contexto está muito enxuto. Ainda faltam definições importantes para desenhar a solução corretamente:

#### Negócio / conteúdo
- Qual é o **nome da marca/loja**?
- Qual é a **proposta de valor** principal?
- Há uma **campanha específica**? Ex.: promoção, linha premium, pronta entrega.
- Quais são os **benefícios reais** que devem aparecer? Ex.: entrega rápida, fabricação própria, parcelamento.
- Quantos **produtos** devem ser exibidos?
- Os produtos terão **preço**, **parcelamento**, **medidas**, **variações de cor**?
- O CTA do WhatsApp deve abrir conversa com **mensagem pré-preenchida**?

#### Design / branding
- Existe identidade visual definida?
- Há cores, tipografia, logo e imagens já disponíveis?
- A landing page deve seguir algum padrão visual existente?

#### Técnico
- Em qual stack a página será feita?
- É uma página estática ou integrada com CMS/backend?
- Os produtos serão hardcoded inicialmente ou virão de alguma API?
- Há necessidade de SEO?
- Há necessidade de analytics/conversão?

#### Operação / publicação
- Onde será hospedada?
- Existe domínio próprio?
- É necessário suporte mobile-first?
- Há prazo ou prioridade de MVP?

---

## riscos

### 1. Escopo ambíguo
Com poucas definições, existe risco de construir uma página tecnicamente correta, mas desalinhada com o objetivo comercial.

### 2. Conteúdo insuficiente
Uma landing page depende muito de:
- copy
- imagens
- preço
- prova de valor

Se esses insumos não existirem, a página pode ficar genérica e com baixa conversão.

### 3. Definição incompleta dos produtos
Sem detalhes sobre os sofás, a seção de produtos pode ficar superficial ou exigir retrabalho posterior.

### 4. CTA de WhatsApp mal definido
Se não houver:
- número correto
- mensagem padrão
- rastreamento
- posicionamento adequado

o canal principal de conversão pode perder eficiência.

### 5. Falta de alinhamento sobre tecnologia
Sem definição da stack, há risco de propor algo excessivo para uma necessidade simples, ou simples demais para uma necessidade futura.

### 6. Baixa performance visual
Landing pages com imagens pesadas de produtos costumam sofrer em performance, principalmente mobile.

### 7. SEO e mensuração ignorados
Mesmo sendo uma landing simples, pode haver perda de oportunidade se não forem considerados:
- metadados
- estrutura semântica
- eventos de clique no WhatsApp
- métricas de conversão

---

## plano

### 1. Refinar requisitos
Antes de qualquer implementação, levantar e fechar os pontos abaixo:

#### Negócio
- nome da marca
- objetivo principal da landing
- público-alvo
- diferenciais competitivos
- mensagem principal do hero

#### Conteúdo
- textos institucionais
- lista de benefícios
- catálogo de produtos
- imagens dos sofás
- preço/condições comerciais
- número do WhatsApp
- mensagem padrão do CTA

#### Design
- identidade visual
- referências de layout
- tom da comunicação

#### Técnico
- stack desejada
- hospedagem
- necessidade de responsividade
- necessidade de SEO
- necessidade de analytics

---

### 2. Definir arquitetura da solução
Como abordagem inicial, eu recomendaria uma solução **simples, performática e orientada à conversão**.

#### Abordagem recomendada
- **landing page estática ou semi-estática**
- foco em **mobile-first**
- estrutura de **seção única**
- CTA do WhatsApp visível em múltiplos pontos
- conteúdo carregado de forma leve
- possibilidade de futura evolução para catálogo maior

#### Estrutura lógica da página
1. **Header simples**
   - logo
   - botão de contato

2. **Hero**
   - headline forte
   - subheadline
   - imagem principal
   - CTA WhatsApp

3. **Benefícios**
   - 3 a 6 cards com ícones e textos curtos

4. **Produtos**
   - grade de sofás
   - imagem
   - nome
   - descrição curta
   - preço/condição
   - CTA por item opcional

5. **CTA final**
   - reforço de urgência/confiança
   - botão para WhatsApp

6. **Footer**
   - informações básicas
   - contato
   - endereço/redes se aplicável

---

### 3. Definir requisitos não funcionais
Mesmo sem código, já vale explicitar critérios de qualidade:

- **responsivo** para mobile, tablet e desktop
- **rápido carregamento**
- **acessível** em nível básico
- **SEO on-page** essencial
- **botões de CTA claramente visíveis**
- **mensuração de cliques no WhatsApp**

---

### 4. Planejar dados e conteúdo
Organizar os dados da página em blocos facilita manutenção e futura integração.

#### Estruturas de conteúdo sugeridas
- **hero**
  - título
  - subtítulo
  - imagem
  - CTA

- **benefícios**
  - lista de itens com título + descrição + ícone

- **produtos**
  - nome
  - imagem
  - descrição
  - preço
  - link para WhatsApp com mensagem contextualizada

- **configuração de contato**
  - número do WhatsApp
  - mensagem padrão
  - texto do botão

---

### 5. Planejar experiência de conversão
A landing deve ser construída para maximizar contato.

#### Estratégia de CTA
- botão no hero
- botão flutuante de WhatsApp
- CTA nos cards de produto
- CTA final com reforço comercial

#### Mensagens sugeridas do fluxo
- hero: “Fale com um especialista”
- produto: “Quero saber mais sobre este sofá”
- final: “Solicite atendimento no WhatsApp”

---

### 6. Planejar entregáveis do MVP
Para um MVP, eu fecharia o seguinte escopo:

#### MVP
- 1 landing page
- hero
- seção de benefícios
- seção de produtos
- CTA WhatsApp em destaque
- responsividade
- SEO básico
- integração com link do WhatsApp

#### Pós-MVP
- analytics
- testes A/B
- depoimentos
- FAQ
- selo de confiança
- integração com catálogo dinâmico
- CMS para gestão de produtos

---

### 7. Sequência de execução
#### Fase 1 — Descoberta
- coletar conteúdo e assets
- validar objetivo comercial
- fechar estrutura da página

#### Fase 2 — Definição funcional
- mapear seções
- definir comportamento do CTA
- definir formato dos produtos

#### Fase 3 — Definição visual
- wireframe
- hierarquia de informação
- responsividade

#### Fase 4 — Implementação
- montar landing
- integrar WhatsApp
- validar performance

#### Fase 5 — Validação
- revisar conteúdo
- testar mobile
- testar cliques do CTA
- validar publicação

---

Se quiser, no próximo passo eu posso transformar isso em um **briefing objetivo com perguntas para o cliente/stakeholder**, para fechar as lacunas antes da implementação.

## REGRAS

- Não alterar partes não relacionadas
- Não adicionar dependências sem necessidade
- Parar se houver divergência

## FORMATO DE RESPOSTA

1. Resumo
2. Arquivos alterados
3. Como validar
4. Checks executados
5. Problemas
6. Próximo passo