# Runtime Logs UX + Timeout/Error Clarity

**Execução:** 2026-05-16T21:15:00 (local)

## Objetivo

Corrigir scroll e visual dos logs de observabilidade, erro de timeout amigável no intake, evento `INTAKE_TIMEOUT` nos diagnósticos, e investigar abertura indevida de abas.

## Causas identificadas

| Problema | Causa |
|----------|--------|
| Scroll cortado | `ScrollArea` com `max-h-[40vh]` no fluxo sem run + viewport sem `overflow-y-auto` na altura flex disponível |
| Cards “invisíveis” | Borda `destructive/30` e fundo `destructive/5` com pouco contraste; cards colados (`space-y-2`) |
| Erro cru de timeout | Proxy Next.js (`route.ts`) abortava `POST /runs` aos **15s** (`AbortSignal.timeout`) enquanto o cliente usava 120s — mensagem: *"The operation was aborted due to timeout"* |
| Abas Chrome | **Nenhum** `window.open` no fluxo de intake/governança; ícone `ExternalLink` sugeria link externo — acções só usam clipboard e tab interna `observe` |

## Correções

### 1. Scroll dos logs
- Constante `RUNTIME_LOGS_SCROLL_CLASS` = `min-h-0 flex-1 overflow-y-auto overscroll-contain`
- Lista principal e eventos pre-run usam `motion` nativo em vez de `ScrollArea` com altura fixa baixa
- Padding inferior (`pb-4`) para o último card não ficar colado na borda

### 2. Visual dos cards
- `PreRunDiagnosticEventCard`: borda `rose-500/45`, fundo `rose-500/6`, `shadow-sm`, spacing `2.5`
- Raw payload continua colapsado por defeito

### 3. Timeout amigável
- `resolveRuntimeProxyTimeoutMs`: `POST /runs` → **125s**
- `intake-timeout-error.ts`: `INTAKE_TIMEOUT`, título/mensagem PT, detalhes técnicos colapsáveis
- `IntakeTimeoutErrorPanel` no TaskComposer com Tentar novamente / Observabilidade / Copiar
- `use-create-run` mapeia timeout → structured error + `logIntakeStartFailure`

### 4. Evento nos logs
- `logIntakeStartFailure` com `phase: submit`, mensagem *Tempo limite ao iniciar execução*, payload com endpoint/timeoutMs/projectId

### 5. Abas / navegação
- Governança: `ExternalLink` → `Copy` + «Copiar caminho docs/.IA»
- `safeClipboardWrite` sem fallback que abre janela
- Observabilidade: apenas `setRightPanelTab("observe")` (sem `window.open`)

## Arquivos alterados

| Arquivo | Alteração |
|---------|-----------|
| `frontend/app/api/runtime/[[...segments]]/route.ts` | Timeout via helper |
| `frontend/lib/api/runtime-proxy-timeouts.ts` | **Novo** |
| `frontend/lib/api/client.ts` | Detecta abort timeout por mensagem |
| `frontend/lib/runtime/intake/intake-timeout-error.ts` | **Novo** |
| `frontend/components/features/intake/IntakeTimeoutErrorPanel.tsx` | **Novo** |
| `frontend/hooks/use-create-run.ts` | Timeout → INTAKE_TIMEOUT |
| `frontend/stores/ui-diagnostics-store.ts` | Fase submit + mensagem timeout |
| `frontend/components/features/observability/RuntimeObservabilityLogs.tsx` | Scroll + spacing |
| `frontend/components/features/observability/PreRunDiagnosticEventCard.tsx` | Contraste |
| `frontend/components/features/intake/TaskComposer.tsx` | Painel timeout |
| `frontend/components/features/governance/GovernanceStatusCard.tsx` | Ícone copy |

## Testes

```bash
cd frontend && npx tsx --test \
  lib/api/runtime-proxy-timeouts.test.ts \
  lib/runtime/intake/intake-timeout-error.test.ts \
  lib/runtime/intake/intake-no-window-open.test.ts \
  lib/runtime/observability/runtime-logs-scroll.test.ts \
  stores/ui-diagnostics-store.test.ts
```

**Resultado:** 9/9 passaram.

## Validação manual

1. Observabilidade → Logs com muitos eventos → scroll até o fim
2. Expandir raw payload de um card pre-run
3. Simular timeout (daemon lento ou proxy antigo) → mensagem amigável no intake
4. Ver evento *Tempo limite ao iniciar execução* na lista pre-run
5. Iniciar execução e confirmar que **nenhuma aba** abre sozinha no Chrome

## Resultado

UX de logs utilizável, timeout explicado e rastreável, proxy alinhado ao intake; sem `window.open` automático no fluxo analisado.
