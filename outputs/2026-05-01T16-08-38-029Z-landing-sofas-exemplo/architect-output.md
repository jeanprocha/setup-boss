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