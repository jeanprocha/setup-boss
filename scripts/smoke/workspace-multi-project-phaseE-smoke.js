#!/usr/bin/env node
"use strict";

/**
 * Fase E — validação ponta a ponta (programática) do pipeline multi-projeto:
 * intake + workspace link → strategy multi-repo → materialização automática → start guard.
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const { createWorkspace } = require("../daemon/lib/workspace-registry");
const {
  createWorkspaceRun,
  getWorkspaceRun,
  updateWorkspaceRun,
  loadWorkspaceRunsUnsafe,
} = require("../daemon/lib/workspace-run-registry");
const { upsertProjectFromUsage, deriveProjectId } = require("../daemon/lib/project-registry");
const { createRunFromTask } = require("../daemon/lib/run-intake-api");
const { triggerStrategyRun } = require("../daemon/lib/run-strategy-api");
const { startWorkspaceRun } = require("../daemon/lib/workspace-run-orchestrator");
const { writeRunIndex } = require("../../core/run-resolver");
const { parseWorkspaceGlobalSpec } = require("../../core/parse-workspace-global-spec");
const { PLAN_REFINED } = require("../runtime/strategy-runtime/analyze-complexity");
const { ensureDocsIaDir } = require("../test-helpers/ensure-docs-ia-dir");

const SHA64 = "a".repeat(64);

async function main() {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "sb-ws-phasee-"));
  const dataDir = path.join(repo, "sb-data");
  fs.mkdirSync(path.join(dataDir, "daemon"), { recursive: true });
  fs.writeFileSync(
    path.join(dataDir, "daemon", "queue.json"),
    JSON.stringify({ jobs: [] }),
    "utf-8",
  );

  const prevRoot = process.env.SETUP_BOSS_CLI_ROOT;
  const prevData = process.env.SETUP_BOSS_DATA_DIR;
  process.env.SETUP_BOSS_CLI_ROOT = repo;
  process.env.SETUP_BOSS_DATA_DIR = dataDir;

  try {
    const apiRoot = path.join(repo, "wiser-bot-api");
    const frontRoot = path.join(repo, "wiser-bot-front");
    fs.mkdirSync(apiRoot, { recursive: true });
    fs.mkdirSync(frontRoot, { recursive: true });
    fs.writeFileSync(path.join(apiRoot, "README.md"), "# api\n", "utf-8");
    fs.writeFileSync(path.join(frontRoot, "README.md"), "# front\n", "utf-8");
    ensureDocsIaDir(frontRoot);
    ensureDocsIaDir(apiRoot);
    fs.mkdirSync(path.join(repo, ".setup-boss", "daemon"), { recursive: true });

    upsertProjectFromUsage({
      projectRoot: apiRoot,
      displayName: "wiser-bot-api",
    });
    upsertProjectFromUsage({
      projectRoot: frontRoot,
      displayName: "wiser-bot-front",
    });
    const pidApi = deriveProjectId(apiRoot);
    const pidFront = deriveProjectId(frontRoot);

    const ws = createWorkspace({
      name: "wiser",
      projectIds: [pidApi, pidFront],
    });
    const task = "Criar exportação PDF dashboard";
    const wsr = createWorkspaceRun({
      workspaceId: ws.workspace.workspaceId,
      title: task,
      globalSpec: {
        schemaVersion: 1,
        task,
        projectIds: [pidApi, pidFront],
        source: "smoke_phase_e",
      },
    });
    const workspaceRunId = wsr.workspaceRun.workspaceRunId;

    const intake = await createRunFromTask({
      repoRoot: repo,
      projectId: pidFront,
      task,
      metadata: {
        skipLlm: true,
        source: "smoke_phase_e",
        workspaceRunId,
        workspaceId: ws.workspace.workspaceId,
        workspaceProjectIds: [pidApi, pidFront],
      },
    });
    assert.strictEqual(intake.ok, true, JSON.stringify(intake.error));
    const planningRunId = intake.data.runId;
    const outputDir = path.join(frontRoot, "docs", ".IA", "outputs", planningRunId);

    const ctx = JSON.parse(fs.readFileSync(path.join(outputDir, "run-context.json"), "utf-8"));
    assert.strictEqual(ctx.workspace.workspaceRunId, workspaceRunId);
    assert.strictEqual(ctx.workspace.workspaceId, ws.workspace.workspaceId);
    assert.deepStrictEqual(ctx.workspace.projectIds, [pidApi, pidFront]);

    updateWorkspaceRun(workspaceRunId, {
      globalSpec: {
        schemaVersion: 1,
        task,
        projectIds: [pidApi, pidFront],
        planningRunId,
        planningProjectId: pidFront,
      },
    });

    fs.writeFileSync(
      path.join(outputDir, "run-context.json"),
      JSON.stringify(
        {
          ...ctx,
          phase2: {
            schema_version: "1.0.0",
            status: "ready_for_execution",
            current_round: 1,
          },
        },
        null,
        2,
      ),
      "utf-8",
    );
    fs.writeFileSync(
      path.join(outputDir, "approval-state.json"),
      JSON.stringify({
        schema_version: "1.0.0",
        status: "approved",
        approved_at: new Date().toISOString(),
        plan_ref: PLAN_REFINED,
        plan_sha256: SHA64,
      }),
      "utf-8",
    );
    fs.writeFileSync(
      path.join(outputDir, PLAN_REFINED),
      [
        "---TASK_PLAN_REFINED---",
        "## Entregas",
        "- Criar endpoint export PDF na API wiser-bot-api",
        "- Criar modal de exportação no dashboard frontend",
        "- Integrar frontend com endpoint de export PDF",
      ].join("\n"),
      "utf-8",
    );

    writeRunIndex({
      runId: planningRunId,
      projectRoot: frontRoot,
      outputDir,
      run_type: "intake",
      workspaceRunId,
    });

    const strat = await triggerStrategyRun({ runId: planningRunId, force: true });
    assert.strictEqual(strat.ok, true, JSON.stringify(strat));

    const oes = JSON.parse(
      fs.readFileSync(
        path.join(outputDir, "strategy", "operational-executable-strategy.json"),
        "utf-8",
      ),
    );
    assert.strictEqual(oes.multiRepo, true);
    assert.ok(oes.miniTasks.length >= 2);
    for (const mt of oes.miniTasks) {
      assert.ok(mt.projectId, `miniTask ${mt.id} sem projectId`);
      assert.ok(mt.repositoryName, `miniTask ${mt.id} sem repositoryName`);
    }
    const apiTasks = oes.miniTasks.filter((m) => m.projectId === pidApi);
    const frontTasks = oes.miniTasks.filter((m) => m.projectId === pidFront);
    assert.ok(apiTasks.length >= 1, "deve haver miniTask API");
    assert.ok(frontTasks.length >= 1, "deve haver miniTask front");

    const integration = oes.miniTasks.find((m) => /integrar/i.test(String(m.title)));
    if (integration && integration.dependsOnIds?.length) {
      const dep = oes.miniTasks.find((m) => m.id === integration.dependsOnIds[0]);
      assert.ok(dep, "dependência deve resolver miniTask");
      assert.strictEqual(dep.projectId, pidApi, "integração deve depender da API");
    }

    const row = getWorkspaceRun(workspaceRunId);
    assert.ok(row.miniActivities.length >= 2, "miniActivities materializadas");
    const spec = parseWorkspaceGlobalSpec(row.globalSpec);
    assert.strictEqual(spec.planningRunId, planningRunId);
    const specRaw =
      row.globalSpec && typeof row.globalSpec === "object"
        ? row.globalSpec
        : JSON.parse(String(row.globalSpec || "{}"));
    assert.strictEqual(specRaw.phase, "materialized");

    const orders = row.miniActivities.map((m) => m.order);
    const apiOrder = row.miniActivities.find((m) => m.targetProjectId === pidApi)?.order;
    const integOrder = row.miniActivities.find((m) =>
      /integrar/i.test(String(m.title)),
    )?.order;
    if (apiOrder != null && integOrder != null) {
      assert.ok(apiOrder < integOrder, "API deve preceder integração na ordem");
    }

    const emptyWsr = createWorkspaceRun({
      workspaceId: ws.workspace.workspaceId,
      title: "Sem minis",
    });
    const blockedEmpty = await require("../daemon/lib/workspace-run-orchestrator").startWorkspaceRun(
      emptyWsr.workspaceRun.workspaceRunId,
    );
    assert.strictEqual(blockedEmpty.ok, false);
    assert.strictEqual(blockedEmpty.code, "workspace_run_no_mini_activities");

    console.log("[smoke] workspace-multi-project-phaseE: OK", {
      workspaceRunId,
      planningRunId,
      miniCount: row.miniActivities.length,
      oesMiniTasks: oes.miniTasks.length,
    });
  } finally {
    if (prevRoot === undefined) delete process.env.SETUP_BOSS_CLI_ROOT;
    else process.env.SETUP_BOSS_CLI_ROOT = prevRoot;
    if (prevData === undefined) delete process.env.SETUP_BOSS_DATA_DIR;
    else process.env.SETUP_BOSS_DATA_DIR = prevData;
    fs.rmSync(repo, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error("[smoke] workspace-multi-project-phaseE: FAIL", e);
  process.exit(1);
});
