## Decision / Update

### Context
Na validação da task da landing de sofás, foi confirmado que o escopo de desenvolvimento já estava atendido por implementação pré-existente no projeto, sem necessidade de nova codificação nesta rodada.

### Decision
Passa a valer que, quando a estrutura solicitada já existir no projeto e atender ao escopo, a entrega pode ser aprovada em desenvolvimento por validação técnica, sem obrigar reimplementação.

### Reason
Isso evita retrabalho, preserva código funcional já existente e mantém o foco da task no resultado entregue, não na quantidade de alterações feitas.

### Impact
Em próximas tasks semelhantes:
- deve-se verificar primeiro se o escopo já está atendido no código atual
- se estiver, a conclusão pode ser por auditoria/validação
- a documentação da entrega deve deixar explícito quando não houve alteração de arquivos

### Validation
Foi confirmado no projeto que a landing já contém:
- hero
- benefícios
- produtos
- CTA WhatsApp

Também foi validado que os CTAs seguem a infraestrutura existente integrada ao `main.js`.

### Date
2026-05-01

---

## Decision / Update

### Context
A aprovação desta task foi solicitada especificamente para ambiente de desenvolvimento, com critérios distintos para homologação e produção.

### Decision
Passa a valer como critério operacional que aprovação em desenvolvimento não implica aprovação automática para produção quando houver pendência operacional fora do layout/markup principal, como configuração real de contato.

### Reason
A estrutura da landing pode estar correta tecnicamente para desenvolvimento, mas ainda não estar pronta para uso real se depender de um dado obrigatório de operação, como o número final de WhatsApp.

### Impact
Próximas validações devem separar claramente:
- conformidade de desenvolvimento
- prontidão operacional para publicação

Isso reduz falso positivo de “task concluída” em ambientes posteriores.

### Validation
Foi validado que:
- a task está aprovada para desenvolvimento
- o campo `data-whatsapp` ainda usa placeholder
- por isso, a landing não deve ser considerada pronta para produção sem ajuste operacional

### Date
2026-05-01