# Troubleshooting

## Daemon / Runtime API / fila

- **`daemon não sobe` / «Daemon já parece estar a correr»**: verificar `.setup-boss/daemon/pid` (ou `${SETUP_BOSS_DATA_DIR}/daemon/pid`). PID órfão: `setup-boss doctor --fix-safe` ou apagar o pid se o processo não existir.
- **`API offline` / `/health` falha**: confirmar `SETUP_BOSS_RUNTIME_API_PORT`, firewall local e se o processo `setup-bossd` está vivo (`daemon status`).
- **`queue.json` inválida ou mutex preso**: ver mensagens no `daemon.log`; variáveis `SETUP_BOSS_QUEUE_LOCK_*`. Doctor reporta `queue_json`.
- **Jobs presos em `running` após crash**: são marcados `failed` na próxima recuperação (`daemon_restarted_while_running` / `worker_pid_dead`) — não retomam sozinhos; usar retry/enqueue conforme o caso.
- **`daemonVersion` ausente em `/status`**: não deve ocorrer após Fase 3.10 — patches parciais ao `status.json` preservam campos; reportar regressão se persistir.
- **Variável `SETUP_BOSS_DATA_DIR`**: útil para testes paralelos sem partilhar `.setup-boss` do repo.

## Doctor falha no CI mas funciona localmente

O comando falha se directorias obrigatórias (`.setup-boss/runs`, `scripts/runtime`) não existirem ou policy loader não inicializar. Use `--strict-runs` apenas quando quiser que runs **amostradas** invalidem o exit code — por defeito, problemas de runs antigas aparecem como **avisos**.

## `resolveOutputDir` / local não permitido

`validate-run-artifacts.js` aceita **qualquer pasta** que já contenha `metadata.json` (para auditorias). Índices / run ids continuam a usar as regras de segurança do resolver (**`docs/.IA/outputs`** no projeto alvo; legado **`.IA/outputs`** ou outros caminhos já indexados).

## Manifest stale

Erro `MANIFEST_STALE` ou validação `STALE_MANIFEST`: regenere a corrida ou reconcilie `executor-changes.json` + `patch-manifest.json` manualmente — não force apply.

## Replay não reflecte estado esperado

Replay não substitui uma corrida completa se artefactos intermédios faltarem; confirmar `executor-output.md`, `executor-result.json`, etc., conforme o `--from`.

## Resume diz RUN_NOT_RESUMABLE

Leia a razão textual (`inspect` mostra `resume_reason`). Causas frequentes: pipeline já `approved` completo, manifest inconsistente, falta de `scan-output.md` no output dir com executor incompleto.

## JSON corrupto em artefactos

O CLI tenta degradar graciosamente (`readJsonSafe`). Para dados críticos (review/metadata), correcção manual ou nova corrida.

## UTF-8 / terminal Windows

Ver `docs/windows-terminal-utf8.md` no repo se caracteres ou logs aparecerem incorrectamente.
