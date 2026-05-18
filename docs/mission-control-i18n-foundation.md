# Mission Control — fundação de i18n

Este documento descreve a base de internacionalização do frontend Mission Control: **pt-BR** (padrão) e **en** (secundário).

## Decisão de arquitetura

- **Sem** `next-intl`, `react-intl`, `i18next` ou `next-i18next` — catálogos estáticos em TypeScript + função `translate` + hook `useI18n`.
- **Locale** guardado com **Zustand** (`useMissionLocaleStore`, `persist`, `skipHydration: true`, chave `setup-boss-mission-locale`) para permitir troca e persistência futuras sem acoplar ao roteamento do Next.js.
- **Re-render** ao mudar idioma: componentes que consomem `useI18n()` ou `useMissionLocaleStore` atualizam automaticamente; memos que dependem de cópias localizadas devem listar `missionLocale` (ou `locale`) nas dependências.

Arquivos centrais:

| Peça | Caminho |
|------|---------|
| Tradução + interpolação | `frontend/lib/i18n/translate.ts` |
| Hook `t` / `setLocale` | `frontend/lib/i18n/use-i18n.ts` |
| Catálogos agregados | `frontend/locales/registry.ts` |
| Mensagens pt-BR | `frontend/locales/pt-BR.ts` |
| Mensagens en | `frontend/locales/en.ts` |
| Store de locale | `frontend/stores/mission-locale-store.ts` |

## Locales e fallback

- **Padrão:** `pt-BR`.
- **Secundário:** `en`.
- Se uma chave não existir no objeto de mensagens, `translate` devolve a **própria chave** (ex.: `foo.missing`) — útil para detetar buracos em desenvolvimento.

## Namespaces (objetos de primeiro nível)

Convenção: chave em notação ponto alinhada ao objeto (`phases.execution`, `sidebar.projects`).

| Namespace | Conteúdo típico |
|-----------|------------------|
| `phases` | Nomes curtos de fases (Intake, Clarificação, Execução, …) |
| `workflow` | Estados de fluxo (`strategy_pending`, `completed`, …) |
| `runtimeStates`, `runtimeChannels`, `runtimeSeverity` | Superfícies técnicas do runtime |
| `common` | Ações genéricas (Carregar, Configurações, Copiar, …) |
| `sidebar` | Lista de projetos/atividades, erros, vazios |
| `chrome` | Cabeçalho global (aria-labels) |
| `timeline` | Painel direito, execução, vazios de corrida, timeline vazia |
| `runShell` | Área central da atividade (empty states, carregamento, fases do workspace) |
| `taskIntake` | Composer de intake (avisos de projeto/offline, CTA) |
| `artifacts` | Fonte de evidência, listas, explorer degradado/vazio |
| `artifactViewer` | Viewer de ficheiro (empty, loading, unsupported, truncado) |
| `observability` | Painel técnico e logs (filtros, rodapés, SSE) |
| `runtimeEvents` | Tipos de evento (mapeamento de `snake_case` → texto legível) |

Novos domínios devem receber **objeto dedicado** em vez de espalhar chaves soltas.

## Interpolação

Mensagens com `{nome}` e chamada `t("chave", { nome: valor })`. Evitar concatenação manual de frases com ordem de palavras diferente entre idiomas; preferir uma chave por frase.

## Padrão de naming

- **Minúsculas com ponto:** `grupo.subcampo` (ex.: `runShell.noActivityTitle`).
- **Sem** mistura pt-PT/pt-BR nos valores de `pt-BR.ts` (ex.: *atividade*, *atualização*, *ação*, *selecionar*).
- Estados de API em **inglês** nos catálogos `workflow` / `runtimeEvents` quando refletem contratos; a UI usa sempre `t(...)`.

## Hooks e código não-React

- Em componentes cliente: `const { t, locale, setLocale } = useI18n()`.
- Em hooks puros (ex.: `use-run-evidence`): `translate(messageCatalog[useMissionLocaleStore.getState().locale], key)` no momento da leitura — não substitui reatividade da UI que já depende do resultado do hook.

## Adicionar um idioma

1. Criar `frontend/locales/<locale>.ts` exportando o mesmo formato aninhado que `pt-BR.ts`.
2. Registar em `frontend/locales/registry.ts` e alargar o tipo `MissionLocale` na store.
3. Garantir rehidratação / `document.documentElement.lang` onde o shell já trata o locale (ex.: `MissionRuntimeRoot`).

## Boas práticas para novos componentes

**Correto:** `title={t("timeline.noRunTitle")}`.

**Evitar:** strings literais em JSX; construir frases com `+` entre traduções parciais; duplicar a mesma frase em dois namespaces sem motivo.

## Testes recomendados

- `npx tsc --noEmit` no diretório `frontend`.
- Smoke: alternar `setLocale` (quando exposto na UI) e confirmar empty states, observabilidade e intake.
- Procurar chaves devolvidas na UI (texto igual à chave) após adicionar mensagens.
