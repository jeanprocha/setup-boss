# Relatório — Refactor navegação Observabilidade

**Data:** 2026-05-17  
**Execução:** Cursor (append-only)

## Objetivo

Simplificar a área Observabilidade do Mission Control: um único nível de tabs, integrar «Progresso da corrida» no painel direito e alinhar com UX tipo Cursor (3 modos claros de visualização).

## Problema anterior

```
Observabilidade
 ├─ Atividade          → RuntimeActivityFeed (humano)
 └─ Debug técnico
      ├─ Logs do runtime      → RuntimeObservabilityLogs (bruto)
      └─ Execução técnica     → RuntimeObservabilityTechnical

Coluna central (duplicado):
 └─ Card Progresso da corrida (Banner + Timeline)
```

Confusão: «Atividade» vs «Logs», «Debug técnico» vs «Execução técnica», progresso competindo com a coluna central.

## Nova hierarquia

```
Painel direito
 ├─ Execução (steps)     [inalterado]
 ├─ Chat / artefatos     [inalterado]
 └─ Observabilidade
      ├─ Progresso              ← 1ª aba (default)
      ├─ Logs do runtime        ← feed humanizado (ex-Atividade)
      └─ Execução técnica      ← logs brutos + diagnóstico (sem sub-tabs)
```

Coluna central: apenas painéis de execução (`CentralExecutionTimeline` em colapso); **sem** card de progresso duplicado.

## Diagrama conceitual

```
┌─────────────────────────────────────────────────────────────┐
│ Mission Control                                              │
├──────────────────────────────┬──────────────────────────────┤
│ Coluna central               │ Painel direito               │
│ · Intake / Clarificação / …  │ [Execução][Chat][Observab.]  │
│ · Detalhe técnico (colapso)  │                              │
│                              │ ┌─ Progresso ─────────────┐  │
│                              │ │ ActiveStepBanner        │  │
│                              │ │ Timeline checkpoints    │  │
│                              │ └─────────────────────────┘  │
│                              │ ┌─ Logs do runtime ────────┐  │
│                              │ │ RuntimeActivityFeed     │  │
│                              │ └─────────────────────────┘  │
│                              │ ┌─ Execução técnica ──────┐  │
│                              │ │ Stream de logs          │  │
│                              │ │ Diagnóstico / estado    │  │
│                              │ └─────────────────────────┘  │
└──────────────────────────────┴──────────────────────────────┘
```

## Estados / tabs removidos

| Removido | Substituído por |
|----------|-----------------|
| `timeline.activityTab` («Atividade») | `timeline.logsTab` («Logs do runtime») no nível principal |
| `timeline.debugTab` («Debug técnico») | Eliminado (nível superior) |
| Sub-tabs dentro de `TechnicalDebugConsole` | Secções empilhadas em `TechnicalExecutionPanel` |
| Card progresso em `RunViewShell` | `RunOperationalProgressPanel` na aba Progresso |

## Componentes

| Ação | Ficheiro |
|------|----------|
| **Novo** | `frontend/components/features/observability/ObservabilityPanel.tsx` |
| **Novo** | `frontend/components/features/observability/RunOperationalProgressPanel.tsx` |
| **Novo** | `frontend/components/features/observability/TechnicalExecutionPanel.tsx` |
| **Refatorado** | `frontend/components/features/execution-timeline/RightTimelinePanel.tsx` |
| **Refatorado** | `frontend/components/features/run-detail/RunViewShell.tsx` |
| **Refatorado** | `frontend/components/features/run-detail/TechnicalDebugConsole.tsx` (re-export legado) |
| **Ajustado** | `frontend/components/features/run-detail/ExecutionTimelineView.tsx` (`showSectionTitle`) |
| **Estado** | `frontend/stores/mission-layout-store.ts` (`observeSubTab`, persist v2) |
| **i18n** | `frontend/locales/pt-BR.ts`, `frontend/locales/en.ts` |

## Persistência

- `observeSubTab`: `"progress" | "runtime_logs" | "technical"` em `localStorage` (`setup-boss-mission-layout`, versão 2).
- Default: **`progress`**.
- Migração v1→v2: força `progress` para utilizadores existentes.

## Validação

| Critério | Estado |
|----------|--------|
| Apenas 1 nível de tabs em Observabilidade | ✅ |
| «Progresso» é a 1ª aba | ✅ |
| Tabs Atividade / Debug técnico removidas | ✅ |
| Funcionalidade preservada (feed, logs, técnico, timeline) | ✅ |
| Layout responsivo (painel redimensionável) | ✅ (inalterado) |
| Persistência de aba | ✅ `observeSubTab` |
| Testes automatizados desta mudança | Não adicionados (UI shell) |

## Melhorias futuras

1. Abrir Observabilidade na aba Progresso automaticamente ao iniciar uma corrida.
2. Atalho de teclado para alternar as 3 sub-abas.
3. Unificar `useRunEvents` / normalização num hook partilhado (progresso + feed).
4. Secção «Execução técnica» com split redimensionável em vez de stack fixo.
5. Remover re-export `TechnicalDebugConsole` após janela de depreciação.

## Limitações

- «Logs do runtime» (aba 2) = feed **humanizado**; stream bruto filtrável fica em «Execução técnica» — nomes alinhados ao pedido, mas o utilizador deve ler o hint da aba.
- Validação manual no browser recomendada com `npm run dev:stack`.
