## Decision / Update

### Context

Na validação da task de evolução da landing `landing-sofas`, o review aprovou a entrega em `development` sem alterações de código, porque o projeto já atendia ao escopo solicitado com a estrutura existente.

### Decision

Neste projeto, tasks de evolução de landing podem ser concluídas por validação de conformidade quando o código já satisfizer integralmente os critérios de aceite, mesmo sem modificação de arquivos.

### Reason

O foco da entrega é o atendimento do escopo e dos critérios definidos, não a obrigatoriedade de gerar diff. Isso evita retrabalho e preserva implementações já funcionais.

### Impact

Próximas tasks em `landing-sofas` devem começar por auditoria do estado atual antes de propor mudanças. Se a estrutura existente já cumprir a task, a conclusão pode ocorrer por evidência técnica, desde que:
- os critérios de aceite sejam cobertos explicitamente
- os arquivos inspecionados sejam informados
- fique claro que não houve alteração de código

### Validation

O review aprovou a task em `development` com base em evidências no código de:
- hero
- benefícios
- seção de produtos com 4 modelos
- CTA principal e CTA final
- padrão de WhatsApp com `data-wa-href`, `data-wa-msg`, `data-wa-placement`
- `<body data-whatsapp>`
- `js/main.js` como lógica única
- CSS responsivo

### Date

2026-05-02

---

## Decision / Update

### Context

A revisão confirmou que a landing está adequada para `development`, mas o `data-whatsapp` permanece com valor placeholder e há recomendação de revalidação do fluxo de `js/main.js` antes de promover ambiente.

### Decision

Em `landing-sofas`, aprovação em `development` deve continuar separada de prontidão para ambientes superiores quando houver dependência operacional real, especialmente número definitivo em `data-whatsapp` e revalidação do fluxo de CTA em runtime.

### Reason

A presença correta do markup e da integração no código não garante prontidão operacional. Para landing com captação via WhatsApp, configuração real de contato e confirmação do comportamento do script são pré-condições para promoção.

### Impact

Próximas tasks ou promoções de ambiente neste projeto devem incluir checklist explícito de:
- substituição do placeholder em `data-whatsapp`
- revalidação manual do fluxo de CTA em navegador
- confirmação de que `js/main.js` continua gerando links WhatsApp sem regressão

### Validation

O review registrou como warnings:
- `data-whatsapp` ainda está como `5511999999999`
- não houve evidência automatizada/runtime anexada
- o risco histórico sobre `js/main.js` deve ser revalidado antes de promoção

### Date

2026-05-02