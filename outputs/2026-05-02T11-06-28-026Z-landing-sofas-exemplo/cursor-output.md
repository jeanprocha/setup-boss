Esse trecho é o **prompt de correção** gerado pelo pipeline após um **review reprovado**. Em resumo:

## O que ele está pedindo

1. **Implementar de fato** a landing no **projeto alvo** (`landing-sofas`): `index.html` (e estilos se precisar), com **hero, benefícios, produtos e CTA WhatsApp**.
2. Usar o **padrão WhatsApp** do projeto: `data-wa-href` + `data-whatsapp` no `<body>`/CTAs, compatível com **`js/main.js`**.
3. **Não mexer** em `agents/cursor-template.md`, nada em `outputs/...`, nem em coisas fora do escopo da task — o review apontou alterações nesses caminhos como problema.

## O que isso implica na prática

- As mudanças válidas são no repositório **`landing-sofas`** (páginas/CSS/JS da landing), não em continuar editando o **setup-boss** por causa desse prompt.
- Depois de corrigir só o que a task pede no projeto certo, volta o fluxo: colar a resposta do Cursor em **`cursor-output.md`** da run e rodar de novo o `continue` dessa pasta de output.

Se a sua dúvida for **outra** (por exemplo: mudar o **`agents/correction.md`** ou o **`scripts/correction.js`** para não gerar certas linhas, ou revisar o texto do prompt), diz objetivamente o que você quer ajustar que eu faço no código.