# TASK

## Descrição

Adicionar uma mensagem de feedback visual abaixo do botão de adicionar anotação.

Quando o usuário adicionar uma nova anotação com sucesso, a interface deve exibir uma mensagem curta confirmando a ação, como: `Anotação adicionada com sucesso`.

A mensagem deve aparecer após adicionar uma nota e deve desaparecer automaticamente depois de alguns segundos ou ao interagir novamente com o formulário.

---

## Acceptance Level (OBRIGATÓRIO)

- [x] development
- [ ] staging
- [ ] production

---

## Acceptance Criteria (OBRIGATÓRIO)

- [ ] ao adicionar uma nova anotação, a UI exibe uma mensagem de sucesso
- [ ] a mensagem contém texto claro, como `Anotação adicionada com sucesso`
- [ ] a mensagem não aparece antes de adicionar uma anotação
- [ ] a mensagem desaparece automaticamente após alguns segundos ou ao nova interação
- [ ] adicionar anotação continua funcionando normalmente
- [ ] a persistência via `localStorage` continua funcionando
- [ ] o isolamento por data continua funcionando
- [ ] pelo menos 1 arquivo real do projeto é alterado
- [ ] executor não retorna `blocked`
- [ ] executor lista arquivos alterados
- [ ] review aprova a execução

---

## Validação esperada do Activity History

Após execução aprovada:

- [ ] `.IA/08-activity-history.md` recebe no máximo uma entrada nova para o `runId`
- [ ] a nova entrada não contém `# TASK`
- [ ] a nova entrada não contém `# Review`
- [ ] a nova entrada não contém `# Executor`
- [ ] a nova entrada não contém `# Architect`
- [ ] a nova entrada não contém `## Acceptance Criteria`
- [ ] a nova entrada contém apenas resumo curto, arquivos alterados, impacto, validação e run id
- [ ] se houver leak `SOFT`, o fallback mínimo seguro é usado
- [ ] se houver leak `HARD`, a entrada não é gravada

---

## Fora de escopo

- backend
- autenticação
- sincronização entre dispositivos
- alteração de arquitetura
- refatoração grande
- mudança de stack
- alteração do sistema `.IA`

---

## Observações

- alteração funcional simples e real
- manter a UI existente
- não alterar o modelo de dados
- não adicionar dependências
- objetivo secundário: validar o Activity History inteligente