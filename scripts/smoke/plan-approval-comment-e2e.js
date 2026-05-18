#!/usr/bin/env node
/**
 * E2E real — plano operacional: aprovação + comentário + sync browser (Fase G).
 *
 * Fluxo: intake → clarify → approve → strategy → snapshot base → comentário →
 * validação API/disco → simulação sessionStorage → repair stale.
 *
 * Uso:
 *   node scripts/smoke/plan-approval-comment-e2e.js
 *   npm run smoke:plan-approval-comment-e2e
 *
 * Variáveis:
 *   SETUP_BOSS_E2E_USE_EXISTING_DAEMON=1 — usa daemon em SETUP_BOSS_RUNTIME_API_PORT (default 3210)
 */
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const { CHAT_COMMENT } = require("./lib/plan-approval-e2e/fixtures");
const {
  assertCanonicalChatPlan,
  assertUpdatedPlanDoc,
} = require("./lib/plan-approval-e2e/assertions");
const {
  bootstrapChatApprovalRun,
  apiGetPlanComments,
  apiPostPlanComment,
  readUpdatedPlanFromDisk,
  writeStaleUpdatedPlanOnDisk,
  stopDaemon,
  mkDataDir,
} = require("./lib/plan-approval-e2e/helpers");
const {
  simulateBrowserTimelineMerge,
  simulatePersistUpdatedPlan,
} = require("./lib/plan-approval-e2e/session-storage-bridge");

const REPORT_PATH = path.join(
  __dirname,
  "..",
  "..",
  ".setup-boss",
  "reports",
  "plan-approval-comment-e2e-last.json",
);

/** @type {Array<{ name: string, ok: boolean, error?: string, ms: number }>} */
const results = [];

/**
 * @param {string} name
 * @param {() => Promise<void>} fn
 */
async function scenario(name, fn) {
  const t0 = Date.now();
  try {
    await fn();
    results.push({ name, ok: true, ms: Date.now() - t0 });
    console.log(`  ✔ ${name}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    results.push({ name, ok: false, error: msg, ms: Date.now() - t0 });
    console.error(`  ✖ ${name}: ${msg}`);
  }
}

async function main() {
  console.log("[plan-approval-e2e] Fase G — fluxo real runtime/API/sessionStorage\n");

  const useExisting = process.env.SETUP_BOSS_E2E_USE_EXISTING_DAEMON === "1";
  const port = useExisting
    ? Number(process.env.SETUP_BOSS_RUNTIME_API_PORT || 3210)
    : undefined;

  let ctx = null;
  let dataDir = null;

  try {
    ctx = await bootstrapChatApprovalRun(
      useExisting ? { port, dataDir: mkDataDir() } : {},
    );
    dataDir = ctx.dataDir;

    await scenario("plano base (v1) canonicalizado no snapshot", async () => {
      assertCanonicalChatPlan(ctx.basePresentation, { label: "v1" });
      const snapPath = path.join(ctx.outputDir, "plan-presentation-base.json");
      assert.ok(fs.existsSync(snapPath), "plan-presentation-base.json");
      const snap = JSON.parse(fs.readFileSync(snapPath, "utf-8"));
      assert.equal(snap.canonicalized, true);
      assert.ok(snap.schemaVersion >= 2);
    });

    const commentId = `e2e-comment-${Date.now()}`;
    let postRes;

    await scenario("POST comentário gera updatedPlan canonicalizado", async () => {
      postRes = await apiPostPlanComment(ctx.port, ctx.runId, {
        commentId,
        text: CHAT_COMMENT,
      });
      assert.equal(postRes.status, 200, postRes.raw);
      assert.ok(postRes.json?.data?.updatedPlan, "updatedPlan na resposta");
      assertUpdatedPlanDoc(postRes.json.data.updatedPlan, {
        expectButton: true,
        label: "POST",
      });
    });

    await scenario("GET plan-comments consistente com POST", async () => {
      const getRes = await apiGetPlanComments(ctx.port, ctx.runId);
      assert.equal(getRes.status, 200);
      const thread = (getRes.json?.data?.threads || []).find(
        (t) => t.comment?.id === commentId,
      );
      assert.ok(thread?.updatedPlan, "thread.updatedPlan");
      assertUpdatedPlanDoc(thread.updatedPlan, {
        expectButton: true,
        label: "GET",
      });
    });

    await scenario("disco updated-plan.json canonicalizado", async () => {
      const disk = readUpdatedPlanFromDisk(ctx.outputDir, commentId);
      assertUpdatedPlanDoc(disk, { expectButton: true, label: "disco" });
    });

    await scenario("reopen/idempotência — segundo GET mantém plano correto", async () => {
      const a = await apiGetPlanComments(ctx.port, ctx.runId);
      const b = await apiGetPlanComments(ctx.port, ctx.runId);
      const planA = a.json?.data?.threads?.find((t) => t.comment?.id === commentId)
        ?.updatedPlan?.presentation;
      const planB = b.json?.data?.threads?.find((t) => t.comment?.id === commentId)
        ?.updatedPlan?.presentation;
      assert.equal(
        planA?.complexity?.level,
        planB?.complexity?.level,
        "complexity divergiu entre GETs",
      );
      assert.equal(planB?.complexity?.level, "medium");
    });

    await scenario("sessionStorage: remoto vence local stale", async () => {
      const getRes = await apiGetPlanComments(ctx.port, ctx.runId);
      const remoteThread = (getRes.json?.data?.threads || []).find(
        (t) => t.comment?.id === commentId,
      );
      assert.ok(remoteThread?.updatedPlan);

      const staleLocal = {
        comment: {
          id: commentId,
          kind: "user_comment",
          text: CHAT_COMMENT,
          createdAt: new Date().toISOString(),
        },
        analysisStatus: "done",
        analysis: remoteThread.analysis,
        analysisError: null,
        additionalQuestions: null,
        additionalAnswers: null,
        additionalAnswersStatus: "idle",
        additionalAnswersError: null,
        updatedPlan: {
          commentId,
          planVersion: 2,
          schemaVersion: 1,
          canonicalized: false,
          generatedAt: "2026-05-14T10:00:00.000Z",
          supersedesPlanVersion: 1,
          presentation: {
            understanding: { summary: "Chat", mainObjective: "Criar chat" },
            whatWillBeDone: [
              "Criar componente visual reutilizável do chat.",
              "Criar componente de botão para abrir/fechar o chat.",
            ],
            whatWillChange: [],
            outOfScope: [],
            completionCriteria: ["O chat aparece", "O botão abre"],
            complexity: {
              level: "high",
              levelLabelPt: "Alta",
              reason: null,
              explanation: "A tarefa foi avaliada como alta",
            },
            executionRecommendation: {
              recommendedLevel: "high",
              levelLabelPt: "Alta",
              explanation: "x",
            },
            miniTasks: { mode: "direct", directLabelPt: "D", tasks: [] },
            risks: [],
            hasContent: true,
          },
        },
        updatedPlanStatus: "done",
      };

      const merged = simulateBrowserTimelineMerge(
        staleLocal,
        {
          analysis: remoteThread.analysis,
          additionalQuestions: remoteThread.additionalQuestions,
          additionalAnswers: remoteThread.additionalAnswers,
          updatedPlan: remoteThread.updatedPlan,
        },
        ctx.basePresentation,
      );

      assert.equal(
        merged.updatedPlan?.presentation?.complexity?.level,
        "medium",
        "merge deve trazer medium do remoto",
      );
      assert.ok(
        merged.updatedPlan?.presentation?.outOfScope?.length >= 3,
        "outOfScope do remoto",
      );
      assert.ok(
        merged.updatedPlan?.presentation?.completionCriteria?.some((c) =>
          /tema/i.test(String(c)),
        ),
        "critérios com tema",
      );

      const persisted = simulatePersistUpdatedPlan(
        merged.updatedPlan,
        ctx.basePresentation,
      );
      assert.ok(persisted, "não deve re-persistir stale");
      assert.equal(persisted.schemaVersion, 2);
      assert.equal(persisted.canonicalized, true);
    });

    await scenario("repair automático: disco stale → GET repara", async () => {
      const repairId = `e2e-repair-${Date.now()}`;
      await apiPostPlanComment(ctx.port, ctx.runId, {
        commentId: repairId,
        text: CHAT_COMMENT,
      });

      writeStaleUpdatedPlanOnDisk(ctx.outputDir, repairId, {
        commentId: repairId,
        planVersion: 2,
        schemaVersion: 1,
        canonicalized: false,
        generatedAt: "2026-05-14T10:00:00.000Z",
        presentation: {
          understanding: { summary: "Chat", mainObjective: "Criar chat" },
          whatWillBeDone: ["Criar componente visual reutilizável do chat."],
          whatWillChange: [],
          outOfScope: [],
          completionCriteria: ["O chat aparece"],
          complexity: {
            level: "high",
            levelLabelPt: "Alta",
            reason: null,
            explanation: "alta",
          },
          executionRecommendation: {
            recommendedLevel: "high",
            levelLabelPt: "Alta",
            explanation: "x",
          },
          miniTasks: { mode: "direct", directLabelPt: "D", tasks: [] },
          risks: [],
          hasContent: true,
        },
      });

      const getRes = await apiGetPlanComments(ctx.port, ctx.runId);
      const thread = (getRes.json?.data?.threads || []).find(
        (t) => t.comment?.id === repairId,
      );
      assertUpdatedPlanDoc(thread?.updatedPlan, {
        expectButton: true,
        label: "repair GET",
      });

      const disk = readUpdatedPlanFromDisk(ctx.outputDir, repairId);
      assertUpdatedPlanDoc(disk, { expectButton: true, label: "repair disco" });
    });
  } finally {
    if (ctx?.startedDaemon && dataDir) {
      await stopDaemon(dataDir);
    }
    if (ctx?.projectRoot && fs.existsSync(ctx.projectRoot)) {
      try {
        fs.rmSync(ctx.projectRoot, { recursive: true, force: true });
      } catch {
        /* */
      }
    }
    if (dataDir && fs.existsSync(dataDir) && !useExisting) {
      try {
        fs.rmSync(dataDir, { recursive: true, force: true });
      } catch {
        /* */
      }
    }
  }

  const failed = results.filter((r) => !r.ok);
  const report = {
    at: new Date().toISOString(),
    passed: results.filter((r) => r.ok).length,
    failed: failed.length,
    results,
  };
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), "utf-8");
  console.log(`\n[plan-approval-e2e] relatório: ${REPORT_PATH}`);
  console.log(
    `[plan-approval-e2e] ${report.passed}/${results.length} cenários OK\n`,
  );

  if (failed.length) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
