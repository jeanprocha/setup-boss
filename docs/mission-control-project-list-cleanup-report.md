# Mission Control — limpeza definitiva da listagem de projectos (`GET /projects`)

## Causa raiz real

1. **Merge por `projectId` em vez do disco real** — o registo e a fila podiam referir o *mesmo* `projectRoot` canónico com `projectId` diferentes (hashes truncados antigos, jobs com `projectId` inconsistente). A lista aparecia com **várias linhas** para o mesmo repositório (ex.: vários `demo-project`).
2. **Jobs antigos na fila** — qualquer `projectRoot` presente em `queue.json` era agregado ao overview, **sem** validar se a pasta ainda existia, gerando entradas fantasma.
3. **Filtro demo incompleto** — faltava `demo-project` e sinais em `metadata` (ex.: `source.mode: "test-fixture"`).

## Comportamento antes / depois

| Antes | Depois |
|--------|--------|
| Várias linhas para o mesmo caminho canónico | **Uma linha por `projectRoot` normalizado**; `projectId` de saída = `deriveProjectId(caminho canónico)` |
| Jobs só na fila com path apagado ainda listados | **Excluídos por omissão** (contador `removedStaleQueuePath`); registo continua a listar mesmo com path em falta (diagnóstico `registryRowsWithMissingPathOnDisk`) |
| Demo só `demo` / `demo-block` | Também **`demo-project`**, `metadata` fixture/test |
| Pouca visibilidade | Logs `runtime.projects.pipeline` + resposta opcional `?explain=1` |

## Ficheiros alterados

- `scripts/daemon/lib/project-registry.js` — `computePublicProjectsList`, agregação por raiz canónica, `projectRootDedupKey` (Windows case-insensitive), filtro demo/metadata, validação de directoria para entradas **só da fila**, `buildProjectsOverview` delega na nova pipeline; `mergeProjectsOverviewFromJobs` mantém merge legado por `projectId` (uso interno/legado).
- `scripts/daemon/runtime-api.js` — `GET /projects` usa `computePublicProjectsList`, logs detalhados, `explain=1` na query string.
- `scripts/daemon/lib/project-registry.test.js` — testes de filtro, dedup, path inexistente, modo demo.
- `scripts/daemon/runtime-api.test.js` — teste HTTP `GET /projects` com `SETUP_BOSS_DATA_DIR` isolado + `explain`.
- `frontend/components/regions/ProjectSidebar.tsx` — texto operacional vazio (registry/Git).
- `frontend/components/regions/ProjectActivitySidebar.tsx` — alinhamento da mensagem vazia.

## Como limpar estado antigo (manual)

**Não é feito automaticamente.** Para reduzir ruído na fila e no registo:

1. **Parar o daemon** (para não haver escrita concorrente).
2. Em `SETUP_BOSS_DATA_DIR` (ou `<repo>/.setup-boss` por omissão):
   - Rever **`daemon/queue.json`** — remover jobs de teste cujo `projectRoot` aponte para pastas temporárias apagadas ou nomes `demo*`.
   - Rever **`projects.json`** — remover entradas duplicadas do mesmo repositório ou projectos de teste; garantir `projectRoot` absoluto canónico e pastas que ainda existem.
3. **Reiniciar o daemon** para carregar o código e reler ficheiros.

> **Atenção:** editar `queue.json` à mão pode corromper o estado se o formato estiver inválido; faça cópia de segurança antes.

## Diagnóstico sem editar ficheiros

- `GET /projects?explain=1` (Runtime API local) devolve `explain` com contagens e `finalProjects` (lista resumida).
- Logs do processo: evento `runtime.projects.pipeline` (registry, fila, filtrados, duplicados, paths em falta na fila, etc.).

## Variável de ambiente

- **`SETUP_BOSS_ENABLE_DEMO_PROJECTS=1`** — inclui projectos cujo basename/displayName é `demo`, `demo-project` ou `demo-block` (e não aplica filtro por metadata fixture no critério demo). Por omissão **desligado**.

## Reiniciar o daemon

Após actualizar o código, **reiniciar** o processo `setup-bossd` / Runtime API para carregar `project-registry.js` e `runtime-api.js`. O Next.js (frontend) só precisa de rebuild se alterou TS/React.

## Comandos de validação

```powershell
cd c:\Users\pierr\Documents\automacao\setup-boss
node --test scripts/daemon/lib/project-registry.test.js
node --test scripts/daemon/runtime-api.test.js
cd frontend
npx tsc --noEmit
```

## Resposta: preciso apagar ficheiros em `SETUP_BOSS_DATA_DIR`?

**Não é obrigatório** para a listagem nova funcionar: o backend já filtra e deduplica.  
**Recomendado** se ainda vir lixo: limpar jobs antigos em `daemon/queue.json` e linhas obsoletas em `projects.json`, como acima — **documentado aqui por opção manual**, sem script automático destrutivo.
