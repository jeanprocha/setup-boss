# Setup Boss — Roadmap

## Estado atual (v2.0.0 · Fase 3)

```text
scan → architect → executor → review → correction → executor → knowledge
```

O pipeline em produção automatiza até o registrar de knowledge quando o resultado chega ao estado `approved` no review. Execuções que precisarem de novo intento repetem **`correction` → `executor` → `review`** até aceite ou limites configurados no run (`MAX_CORRECTIONS`, etc.).

---

## Próximo objetivo (Fase 4)

- **executor híbrido**: onde for seguro, aplicar edições deterministicamente (estruturas, slots, marcadores estáveis); manter IA para regiões ainda fracamente estruturadas
- **parsing estruturado**: análise mais rígida de HTML/arquivos de markup (e extensível a outras gramáticas quando o projeto assim o demandar)
- **validação via build ou teste**: integração opcional de comandos automatizados de verificação adicionando um sinal forte de correção sintática/execução

---

## O que o executor faz hoje (Fase 3)

Componente já integrado ao run que:

- lê prompt + arquivos permitidos pelo architect
- gera payloads `write_file` que substituem o conteúdo dos arquivos autorizados
- respeita escopo declarado pela lista «Arquivos prováveis» / seguranças de caminho já existentes
- grava evidência operacional através de **`executor-output.md`** e **`executor-changes.json`** consumidos pela etapa seguinte (**review**) e tooling humano opcional

---

## Regras

- preservar invariantes públicas do fluxo atual (consumidores de JSON de saída / scripts operacionais já publicados onde couber)
- review continua porta de validação obrigatória antes de mover knowledge aceito quando o ciclo assim exigir na configuração de release interna deste projeto
- jamais ampliar write automaticamente para caminhos fora do whitelist do run corrente

---

## Critério de sucesso

Concluído na Fase 3 (v2.0.0):

- executor automático aplica alterações reais no projeto alvo dentro do escopo do architect
- review valida usando o estado persistido dos arquivos e reduz falsos negativos só por snippet de log
- execution end-to-end automatizada na orquestração padrão até `knowledge`, sem passo manual paralelo dentro do mesmo run quando o ciclo automatizado completa sem bloqueios

Próximos alvos (Fase 4):

- executor híbrido (mais edits determinísticos)
- parsing estruturado onde o stack permitir
- sinal adicional de correção via build/testes quando configurado
