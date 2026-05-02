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