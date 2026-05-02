### Entendimento
A task, no contexto atual do projeto, é **montar/ajustar uma landing page estática para venda/orçamento de sofás**, usando a stack já existente: **HTML + CSS + JavaScript vanilla**.

Pelo scan, parte disso **já parece existir parcial ou totalmente**:
- há `index.html`
- há `css/styles.css`
- há `js/main.js`
- já existe lógica de:
  - configuração do WhatsApp via `data-whatsapp`
  - montagem de links `wa.me`
  - leitura de UTMs
  - disparo de evento `whatsapp_cta_click`

Então, antes de tratar como “criar do zero”, o entendimento mais correto é:

1. **validar o estado atual da landing**
   - confirmar se hero, benefícios, produtos e CTA já existem no HTML atual
   - confirmar se estão completos ou se faltam seções/ajustes

2. **completar a estrutura da landing conforme a task**
   - garantir presença clara de:
     - hero
     - seção de benefícios
     - seção de produtos
     - CTAs para WhatsApp
   - manter consistência com o comportamento já implementado em `main.js`

3. **preservar o modelo operacional atual**
   - número do WhatsApp continua vindo de `data-whatsapp`
   - CTAs continuam usando a lógica atual de geração de link
   - UTMs e evento customizado continuam funcionando

4. **priorizar simplicidade**
   - sem introduzir backend
   - sem build tool
   - sem frameworks
   - sem novas abstrações desnecessárias

Também há uma lacuna importante no contexto: o scan diz que `index.html` está truncado, então **não dá para afirmar com segurança o quanto da task já foi implementado**. Isso precisa ser checado antes de sair alterando estrutura.

---

### Riscos

#### Técnicos
- **Duplicação de estrutura já existente**
  - Se a landing já tiver hero/produtos/CTA, há risco de refazer ou quebrar uma implementação que já funciona.

- **Quebra da integração com WhatsApp**
  - Se os novos CTAs não seguirem o padrão esperado por `main.js` (`[data-wa-href]`, atributos de contexto, etc.), os links podem parar de funcionar.

- **Perda de rastreamento**
  - Mudanças nos CTAs podem impedir ou degradar o disparo do evento `whatsapp_cta_click`.

- **Inconsistência de marcação**
  - Como o HTML/CSS no scan está truncado, pode haver classes, padrões visuais e convenções já adotadas que não estão visíveis no contexto fornecido.

- **Responsividade**
  - Inserir novas seções sem respeitar o CSS existente pode causar problemas em mobile, que é crítico para CTA de WhatsApp.

- **Dependência de imagens**
  - Se forem usadas imagens externas, há risco de performance, layout quebrado e indisponibilidade.

#### Escopo
- **Task curta, mas ambígua**
  - “Criar uma landing page de sofás com hero, benefícios, produtos, CTA WhatsApp” não define:
    - quantidade de produtos
    - conteúdo textual
    - identidade visual
    - necessidade de SEO
    - analytics real
    - copy final aprovada

- **Possível conflito entre criar vs ajustar**
  - O projeto já aparenta ser uma landing de sofás. Então a task pode ser:
    - criar do zero
    - completar o que falta
    - reorganizar o conteúdo atual
  - Isso precisa ser esclarecido no código real.

#### Execução
- **Sem comando formal de execução**
  - Não há pipeline, testes ou build. A validação será manual no navegador.

- **Ausência de critérios de aceite explícitos**
  - Sem definição clara, pode-se entregar algo funcional mas desalinhado da expectativa visual/comercial.

- **Possível falta de ativos**
  - Se não houver imagens, textos ou dados dos produtos no projeto, será necessário usar placeholders ou conteúdo provisório, o que precisa ser assumido explicitamente.

---

### Plano

#### 1. Inspecionar o estado real do projeto
Objetivo: entender o que já existe antes de mexer.

Passos:
1. Abrir `index.html` completo e mapear as seções já presentes.
2. Confirmar se já existem:
   - hero
   - benefícios
   - produtos
   - botões/links de WhatsApp
3. Ler `js/main.js` para identificar:
   - quais seletores são usados para montar links de WhatsApp
   - quais atributos os CTAs precisam ter
   - como o evento `whatsapp_cta_click` é disparado
4. Ler `css/styles.css` para identificar:
   - convenção de classes
   - grid/layout existente
   - componentes reutilizáveis de botão, card e seção

**Resultado esperado desta etapa:**
- classificar a task como:
  - ajuste incremental da landing existente, ou
  - construção das seções faltantes

---

#### 2. Validar lacunas da task
Objetivo: transformar a task genérica em escopo executável.

Conferir no projeto:
1. **Hero**
   - existe título principal?
   - existe subtítulo/copy?
   - existe CTA primário para WhatsApp?
2. **Benefícios**
   - existe seção destacando diferenciais?
   - quantidade de itens está adequada?
3. **Produtos**
   - há cards/listagem de sofás?
   - cada produto tem nome, descrição e CTA?
4. **CTA WhatsApp**
   - existe CTA no topo?
   - existe CTA nos cards?
   - existe CTA final de fechamento?

Se faltar conteúdo editorial definitivo, alinhar abordagem:
- usar conteúdo objetivo e simples
- evitar promessas comerciais excessivas
- deixar estrutura pronta para posterior refinamento de copy

---

#### 3. Definir a estrutura mínima da landing
Objetivo: garantir uma arquitetura simples e funcional.

A estrutura recomendada, respeitando o contexto atual, é:

1. **Header simples**
   - marca/nome
   - botão de orçamento via WhatsApp

2. **Hero**
   - headline clara sobre sofás
   - apoio curto com proposta de valor
   - CTA principal para WhatsApp
   - imagem ou destaque visual principal

3. **Benefícios**
   - 3 a 4 benefícios curtos
   - foco em confiança e decisão rápida
   - exemplo de eixos: conforto, qualidade, personalização, atendimento

4. **Produtos**
   - grid de cards
   - cada card com:
     - nome do produto
     - descrição curta
     - informação comercial simples
     - CTA para orçamento no WhatsApp

5. **CTA final**
   - reforço de conversão
   - botão para falar no WhatsApp

6. **Footer simples**
   - contatos básicos
   - reforço do canal principal

Essa estrutura é coerente com uma landing estática e com o JS já existente.

---

#### 4. Integrar corretamente com a lógica atual de WhatsApp
Objetivo: não quebrar o comportamento já implementado.

O Cursor deve:
1. identificar o padrão exato esperado por `main.js`
2. garantir que todos os CTAs da landing usem esse padrão
3. confirmar se os CTAs aceitam contexto por:
   - placement
   - productId
   - texto base da mensagem
4. manter o `data-whatsapp` no `<body>` como fonte única do número

Ponto crítico:
- **não criar uma nova lógica paralela de link de WhatsApp**
- reutilizar a existente

---

#### 5. Ajustar o HTML com foco em semântica e simplicidade
Objetivo: estruturar a página de forma limpa e compatível com o CSS atual.

Orientações para execução:
1. usar landmarks semânticos já adotados:
   - `header`
   - `main`
   - `section`
   - `footer`
2. manter hierarquia clara de títulos
3. evitar wrappers desnecessários
4. reaproveitar classes existentes sempre que possível
5. só criar novas classes se realmente não houver equivalente no CSS atual

---

#### 6. Ajustar o CSS apenas no necessário
Objetivo: encaixar a landing sem reescrever estilos.

Ordem de atuação:
1. reutilizar componentes visuais já existentes
2. ajustar espaçamento e responsividade das seções
3. padronizar cards de benefícios e produtos
4. revisar botões de CTA para consistência visual
5. validar comportamento em mobile primeiro

Evitar:
- grandes refactors no `styles.css`
- introdução de padrões novos sem necessidade
- complexidade visual desproporcional para uma landing estática

---

#### 7. Revisar conteúdo dos produtos
Objetivo: manter uma apresentação comercial mínima e coerente.

Como o contexto não traz catálogo oficial, o Cursor deve:
1. verificar se já há conteúdo real no HTML atual
2. se houver, preservar e apenas organizar
3. se não houver, estruturar de forma neutra e simples para fácil troca posterior

Ponto de atenção:
- não inventar regras comerciais complexas
- não inserir preço se isso não estiver no material atual
- preferir “solicite orçamento” via WhatsApp

---

#### 8. Validar manualmente no navegador
Objetivo: garantir entrega funcional, já que não há testes automáticos.

Checklist:
1. página abre sem erros visuais
2. hero aparece corretamente
3. benefícios aparecem em layout consistente
4. produtos aparecem em grid/lista coerente
5. todos os CTAs funcionam
6. links gerados apontam para `wa.me`
7. `data-whatsapp` é respeitado
8. ao acessar com UTMs, a mensagem mantém os parâmetros
9. evento `whatsapp_cta_click` continua sendo disparado
10. mobile:
   - textos legíveis
   - botões clicáveis
   - cards não quebram layout

---

#### 9. Fechar com uma revisão de consistência
Objetivo: reduzir retrabalho.

Revisar:
1. se a landing atende exatamente à task:
   - hero
   - benefícios
   - produtos
   - CTA WhatsApp
2. se não foi adicionada tecnologia fora da stack
3. se o comportamento existente foi preservado
4. se o HTML ficou simples de manter
5. se a configuração operacional continua clara:
   - número do WhatsApp no `data-whatsapp`

---

#### 10. Entrega esperada pelo Cursor
O Cursor deve executar a task nesta ordem prática:

1. abrir e ler `index.html`, `css/styles.css` e `js/main.js`
2. mapear o que já existe
3. identificar lacunas em relação à task
4. completar a estrutura da landing sem reescrever o projeto
5. conectar todos os CTAs à lógica já existente
6. ajustar estilos mínimos necessários
7. validar manualmente comportamento e responsividade
8. reportar exatamente:
   - o que já existia
   - o que foi criado/ajustado
   - o que ficou pendente por falta de contexto

---

Se quiser, no próximo passo eu posso transformar isso em um **prompt operacional para o Cursor**, no formato de execução direta da task.