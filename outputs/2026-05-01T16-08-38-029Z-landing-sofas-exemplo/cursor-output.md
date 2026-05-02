Revendo o `cursor-prompt.md` e o código em `C:\Users\pierr\Documents\automacao\landing-sofas`: o objetivo do brief **já está atendido** no repositório — não há divergência entre o plano e o HTML/CSS/JS reais (o scan que falava em HTML truncado estava desatualizado face ao ficheiro completo).

Segue o **formato de resposta** pedido no próprio prompt:

---

### 1. Resumo  
A landing em `landing-sofas` já tem **hero**, **benefícios** (5 cards), **produtos** (4 cards com `data-wa-href` e mensagens por produto), **CTA final**, header, botão flutuante e **integração WhatsApp** via `data-whatsapp` no `<body>`, UTMs na mensagem e evento `whatsapp_cta_click` em `js/main.js`. Nada obrigatório ficou em falta face ao objetivo do `cursor-prompt.md`.

### 2. Arquivos alterados  
Nenhum — não foi necessário editar código.

### 3. Como validar  
- Abrir `landing-sofas/index.html` no navegador (ou servir a pasta como estático).  
- Clicar nos CTAs: `href` deve ser `https://wa.me/5511999999999?text=...` (substitua pelo número real em `data-whatsapp`).  
- Testar com `?utm_source=teste&utm_medium=email` na URL e confirmar o bloco `[landing] ...` na mensagem.  
- No DevTools, ouvir `whatsapp_cta_click` no clique (ou inspecionar em código com `document.addEventListener('whatsapp_cta_click', console.log)`).  
- Redimensionar a janela para conferir hero, grelha de benefícios/produtos e CTA final.

### 4. Checks executados  
- Leitura integral de `index.html`, `css/styles.css` e `js/main.js`.  
- Confirmação de seções, classes alinhadas ao CSS e uso consistente de `data-wa-href` / `data-wa-msg` / `data-wa-placement` (e `data-product-id` nos produtos).

### 5. Problemas  
- **Conteúdo de negócio**: preços e textos são exemplares; imagens são Unsplash (já assinalhado no footer).  
- **Número**: o body usa placeholder `5511999999999` — trocar pelo número real antes de publicar.

### 6. Próximo passo  
Se quiser evoluir além do brief: trocar copy/imagens por materiais oficiais, ajustar quantidade de produtos ou remover/ajustar a faixa `trust-strip` (opcional no plano). Diga o que prefere e faço as alterações nos ficheiros.

---

**Sobre o ficheiro `cursor-prompt.md`:** é um brief gerado pelo setup-boss para colar no Cursor com contexto do scan, plano, regras e formato de resposta; `{{PROJECT_CONTEXT}}` no template continua vazio no output — o scan preenche a parte útil mais abaixo (`PROJECT SCAN`).

Se a intenção era **implementar mudanças concretas** (textos, marca, número, mais produtos), descreva o que mudar que aplico no projeto.