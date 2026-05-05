# Agent: Cursor Template
# Version: 1.1.0
# Updated: 2026-05-05

Referência legada (execução manual). O pipeline oficial usa o **Executor** + PATCH.

---

## Variáveis

- Projeto: `{{PROJECT_PATH}}`
- Task: `{{TASK_PATH}}`
- Plano: `{{ARCHITECT_OUTPUT}}`
- Ficheiros: `{{TARGET_FILES}}`

---

## Regras

- Cumprir plano e task; só `{{TARGET_FILES}}` salvo bloqueio explícito.
- Não alargar arquitectura nem dependências sem justificação na task.
- Divergência plano/código/task → parar e comunicar (bloqueio).

---

## Bloqueio (template)

```json
{
  "status": "blocked",
  "reason": "motivo curto",
  "evidence": "ficheiros ou factos"
}
```

Não duplicar instruções do Executor em produção.
