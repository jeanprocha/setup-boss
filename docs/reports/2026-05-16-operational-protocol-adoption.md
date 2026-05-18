# Protocolo operacional — adoção

**Data:** 2026-05-16

## Objetivo

Registrar adoção das regras operacionais obrigatórias para execuções futuras no repositório setup-boss.

## Causa raiz encontrada

N/A — execução de governança de processo, não correção de bug.

## Arquivos alterados

- `docs/reports/2026-05-16-operational-protocol-adoption.md` (criado)

## Decisões relevantes

- Discovery, implementação e review permanecem separados.
- Um objetivo por execução; escopo explícito; prompts em bloco único.
- Cada execução gera relatório novo em `docs/reports/YYYY-MM-DD-<slug>.md`; nunca editar relatórios anteriores.
- Respostas e relatórios: curtos, técnicos, sem repetir contexto global.

## Validações executadas

- Relatório criado como arquivo novo (append-only policy).

## Limitações restantes

- Protocolo depende de aplicação consistente em cada turno; não há enforcement automático no repo.

## Próximos passos

- Aplicar P0 do discovery `2026-05-16-post-strategy-ux-state-discovery.md` em execução dedicada (implementação).

## Riscos identificados

- Execuções sem relatório novo violam o protocolo; mitigação: checklist por execução.
