# Setup Boss — Knowledge Base (Global)

Padrões e regras de contexto usados pelo **scan** e alinhados à documentação operacional **v2.0.0**. Não substituem a leitura dos **scripts** para detalhes exactos.

---

## 1. Contexto antes de agir

- **Scan** do projeto alvo antes de conclusões fora do pipeline.
- Em corridas completas, o **architect** depende do contexto de scan (ou cache) conforme configuração.

---

## 2. Fonte de verdade entre etapas

- **`run-context.json`** (gerado pelo **architect**) concentra task resumida, **`allowed_files`**, critérios e foco de review.
- Reduz a necessidade de repetir prompts gigantes (task + scan + architect completos) nas etapas seguintes quando o JSON é válido e consumido.

---

## 3. Executor: PATCH, não reescrita livre

- Alterações no disco via resposta estruturada com **`operation: patch`**, **`search`**, **`replace`**.
- Não inferir que o modelo “substitui o ficheiro inteiro”: o código aplica um replace pontual após validar **`search`** e **`allowed_files`**.

---

## 4. Não reinventar o que já existe no repo alvo

Priorizar:

- padrões já implementados no projeto alvo
- reaproveitamento de lógica e convenções locais

---

## 5. Validação com evidência

- O **review** deve fundamentar-se em **`review-output.json`** e no estado real (**diff**, ficheiros em **`allowed_files`**).
- Evitar aceitar conclusões genéricas sem correspondência no código ou nos artefactos da corrida.

---

## 6. Separar “correcto” de “pronto para produção”

- Critérios de aceite vêm da task e do **`run-context`** / nível de aceite explícito na task.

---

## 7. Tasks com critério de aceite claro

As tasks devem incluir secções esperadas pelo pipeline (ex.: **Acceptance Level**, **Acceptance Criteria** — validação na entrada do **architect**).

---

## 8. Knowledge não é log de execução

Registrar em **knowledge** (e **`.setup-boss/knowledge-base.md`** no projeto):

- decisões reutilizáveis
- padrões estáveis

Não guardar como “knowledge” o passo-a-passo bruto de uma única corrida — isso fica em **`.IA/outputs/<run-id>/`**.

---

## 9. Observabilidade

- **`metadata.json`**: **`llm_usage`**, **`llm_usage_total`** para comparar corridas e custos quando as envs de preço estão definidas.
- **`review-output.json`**: estado oficial do review.
