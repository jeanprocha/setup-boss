Você está trabalhando em um projeto real.

## OBJETIVO

Criar uma landing page de sofás com:

- hero
- benefícios
- produtos
- CTA WhatsApp

## DECISÃO / PLANO

## entendimento

Você quer uma **landing page de sofás** com foco comercial, contendo pelo menos:

- **hero**
- **benefícios**
- **produtos**
- **CTA para WhatsApp**

Como Arquiteto de Software Sênior, interpreto essa task não só como “montar uma página”, mas como definir uma solução que seja:

- simples de evoluir
- orientada à conversão
- clara para implementação
- preparada para conteúdo comercial
- com baixo atrito para manutenção

### Leitura funcional da demanda

A página parece ter objetivo principal de:

- **apresentar a marca ou campanha**
- **exibir sofás em destaque**
- **reforçar diferenciais**
- **levar o usuário a entrar em contato via WhatsApp**

Ou seja, trata-se de uma **landing page de geração de leads/conversão**, não de um e-commerce completo.

### Estrutura mínima esperada

1. **Hero**
   - título forte
   - subtítulo com proposta de valor
   - imagem principal
   - botão de CTA para WhatsApp

2. **Benefícios**
   - lista de diferenciais, por exemplo:
     - conforto
     - variedade de modelos
     - entrega
     - atendimento
     - personalização

3. **Produtos**
   - vitrine com cards de sofás
   - imagem
   - nome
   - descrição curta
   - preço opcional
   - CTA por item ou CTA geral

4. **CTA WhatsApp**
   - botão fixo ou seções com CTA repetido
   - mensagem pré-preenchida
   - foco em conversão rápida

---

## riscos

### 1. Lacunas de negócio

O contexto está muito aberto. Faltam definições importantes para evitar retrabalho:

- qual é a **marca/empresa**
- qual é o **público-alvo**
- qual é o **tom visual** da landing page
- qual é a **proposta de valor principal**
- qual é o **objetivo exato do CTA**
  - pedir orçamento?
  - falar com vendedor?
  - agendar visita?
  - tirar dúvidas?

Sem isso, a solução pode ficar tecnicamente correta, mas comercialmente fraca.

### 2. Conteúdo insuficiente

Ainda não foram informados:

- textos
- imagens
- catálogo de produtos
- preços
- telefone do WhatsApp
- mensagens automáticas do CTA

Risco: a implementação depender de conteúdo fictício ou genérico, o que reduz qualidade final.

### 3. Escopo visual indefinido

Não há definição sobre:

- identidade visual
- cores
- tipografia
- estilo das imagens
- nível de sofisticação da interface

Risco: produzir algo desalinhado com a marca ou com expectativa do cliente.

### 4. Escopo técnico não definido

Faltam decisões sobre:

- stack desejada
- responsividade esperada
- SEO
- analytics
- performance
- hospedagem
- CMS ou conteúdo estático

Risco: a solução ser construída numa direção técnica inadequada.

### 5. Conversão sem mensuração

Se a página tem foco em WhatsApp, idealmente deveríamos prever:

- rastreamento de clique no CTA
- origem da campanha
- parâmetros UTM
- eventos analíticos

Sem isso, fica difícil medir resultado.

### 6. Escalabilidade futura

Hoje a task é uma landing page simples, mas pode evoluir para:

- mais categorias
- páginas de produto
- campanhas sazonais
- captação de leads
- integração com CRM

Se a arquitetura for “rápida demais”, a evolução pode sair cara.

---

## plano

### 1. Refinamento da task

Antes de implementar, eu fecharia estes pontos:

#### Negócio
- nome da marca/loja
- objetivo principal da página
- público-alvo
- região de atendimento
- principal diferencial competitivo

#### Conteúdo
- headline do hero
- lista de benefícios
- catálogo inicial de sofás
- imagens dos produtos
- número do WhatsApp
- mensagem padrão do botão

#### Design
- referência visual
- paleta de cores
- estilo: premium, popular, moderno, minimalista etc.
- versão mobile como prioridade

#### Técnico
- tecnologia desejada
- necessidade de SEO
- necessidade de analytics
- ambiente de deploy

---

### 2. Definição da arquitetura da landing page

A abordagem recomendada é uma **arquitetura enxuta, componentizada e orientada à conversão**.

#### Estrutura de seções
- **Header simples**
  - logo
  - botão de contato
- **Hero**
  - título
  - subtítulo
  - imagem destaque
  - CTA WhatsApp
- **Benefícios**
  - 3 a 6 diferenciais
- **Produtos**
  - grade de cards
  - destaque visual por produto
- **Seção de reforço de confiança**
  - opcional: avaliações, números, garantia, entrega
- **CTA final**
  - chamada forte para WhatsApp
- **Footer**
  - contatos
  - endereço/redes, se aplicável

#### Componentização sugerida
- HeroSection
- BenefitsSection
- ProductGrid
- ProductCard
- WhatsAppCTA
- Footer

Isso facilita manutenção, reuso e futuras variações de campanha.

---

### 3. Estratégia de UX e conversão

A landing page deve ser pensada para reduzir fricção.

#### Diretrizes
- CTA acima da dobra
- CTA repetido ao longo da página
- versão mobile muito bem resolvida
- imagens fortes e de qualidade
- textos curtos e comerciais
- prova de valor clara
- caminho de ação único: WhatsApp

#### WhatsApp
O CTA deve:
- abrir conversa com mensagem pré-preenchida
- mencionar interesse em sofás
- preferencialmente variar conforme contexto:
  - “Quero saber mais sobre este sofá”
  - “Quero receber o catálogo”
  - “Quero um orçamento”

---

### 4. Estratégia de dados e conteúdo

Mesmo sem back-end, vale estruturar os dados para facilitar manutenção.

#### Modelo de conteúdo recomendado
- hero:
  - título
  - subtítulo
  - imagem
  - texto do botão
- benefícios:
  - título
  - descrição
  - ícone
- produtos:
  - nome
  - imagem
  - descrição
  - preço opcional
  - etiqueta opcional
  - link/CTA WhatsApp

Isso permite trocar conteúdo sem reescrever a estrutura da página.

---

### 5. Requisitos não funcionais recomendados

Mesmo para uma landing page simples, eu recomendaria considerar:

- **responsividade total**
- **boa performance**
- **acessibilidade básica**
- **SEO on-page**
- **otimização de imagens**
- **rastreio de clique no WhatsApp**

#### SEO básico
- título da página
- meta description
- headings semânticos
- alt em imagens
- conteúdo textual relevante

#### Analytics
- evento de clique no botão do WhatsApp
- evento por produto, se houver CTA individual
- captura de UTMs, se a página vier de mídia paga

---

### 6. Priorização por fases

#### Fase 1 — MVP
Entregar o essencial para colocar a campanha no ar:
- hero
- benefícios
- produtos
- CTA WhatsApp
- responsividade

#### Fase 2 — Otimização comercial
- prova social
- depoimentos
- selos de confiança
- CTA flutuante
- mensagens personalizadas por produto

#### Fase 3 — Mensuração e evolução
- analytics
- testes A/B de headline/CTA
- integração com campanhas
- SEO refinado

---

### 7. Critérios de aceite sugeridos

A task pode ser considerada pronta quando:

- a landing page possui as 4 seções pedidas
- o CTA do WhatsApp funciona corretamente
- a página é responsiva em mobile e desktop
- os produtos são exibidos de forma clara
- o hero comunica proposta de valor
- os benefícios estão destacados
- a navegação é simples e focada em conversão
- performance e legibilidade estão adequadas

---

### 8. Próximos passos objetivos

1. validar escopo funcional da landing page
2. coletar conteúdo e identidade visual
3. definir estrutura final das seções
4. definir stack/abordagem técnica
5. preparar wireframe de baixa fidelidade
6. validar copy e CTAs
7. só então partir para implementação

Se quiser, no próximo passo eu posso transformar isso em um **briefing técnico completo com requisitos, estrutura de componentes e checklist de implementação**, ainda sem gerar código.

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