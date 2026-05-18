"use strict";

const fs = require("fs");
const path = require("path");

const { tryGitCommitAfterApprovedRun } = require("../../../core/git-approved-run-commit");
const { tryGitPushAfterApprovedCommit } = require("../../../core/git-approved-run-push");
const { tryGitPrAfterApprovedPush } = require("../../../core/git-approved-run-pr");
const {
  normalizeReviewOutputFromExecutionBundle,
} = require("../../../core/normalize-review-output-from-bundle");
const { enrichIAAfterApprovedRun } = require("../../ensure-ia");

/**
 * @param {string} fp
 * @returns {Record<string, unknown>|null}
 */
function safeReadJson(fp) {
  try {
    if (!fs.existsSync(fp)) return null;
    const j = JSON.parse(fs.readFileSync(fp, "utf-8"));
    return j && typeof j === "object" && !Array.isArray(j) ? j : null;
  } catch {
    return null;
  }
}

/**
 * Pós-review aprovado (daemon sync): enrich IA idempotente + commit automático.
 *
 * @param {string} runId
 * @param {string} outputDir
 * @param {{ projectRoot?: string|null, projectId?: string|null }|null} [job]
 * @param {{ bundle?: { ok: boolean, data?: Record<string, unknown>|null }, env?: NodeJS.ProcessEnv }} [opts]
 */
async function runPostReviewApprovedGitCommit(runId, outputDir, job = null, opts = {}) {
  const rid = String(runId || "").trim();
  const out = path.resolve(String(outputDir || ""));
  if (!rid || !out) return { skipped: true, reason: "missing_params" };

  const norm = normalizeReviewOutputFromExecutionBundle(out, rid, {
    bundle: opts.bundle,
  });
  if (norm.action === "preserved") {
    console.log("[review-normalize] review-output.json existente preservado.");
  } else if (norm.action === "written") {
    console.log(
      "[review-normalize] review-output.json criado a partir do bundle execute-only.",
    );
  } else if (norm.action === "skipped") {
    console.log(
      `[review-normalize] skip (${norm.reason || "unknown"})${
        norm.aggregateStatus ? ` aggregate=${norm.aggregateStatus}` : ""
      }`,
    );
  }

  const reviewOutput =
    norm.reviewOutput && typeof norm.reviewOutput === "object"
      ? norm.reviewOutput
      : safeReadJson(path.join(out, "review-output.json"));
  if (!reviewOutput || String(reviewOutput.status).toLowerCase() !== "approved") {
    return { skipped: true, reason: "review_not_approved", normalize: norm };
  }

  const metadata = safeReadJson(path.join(out, "metadata.json"));
  const projectRoot =
    metadata && metadata.projectRoot != null
      ? String(metadata.projectRoot).trim()
      : job && job.projectRoot != null
        ? String(job.projectRoot).trim()
        : "";
  if (!projectRoot) return { skipped: true, reason: "project_root_missing" };

  try {
    await enrichIAAfterApprovedRun({
      projectRoot,
      outputDir: out,
      metadata: metadata || {},
      reviewOutput,
    });
  } catch (err) {
    console.warn(
      "⚠️ runPostReviewApprovedGitCommit: enrichIAAfterApprovedRun (não fatal):",
      err && err.message ? err.message : err,
    );
  }

  try {
    const commitResult = await tryGitCommitAfterApprovedRun({
      projectRoot,
      outputDir: out,
      runId: rid,
    });

    /** @type {Record<string, unknown>|null} */
    let pushResult = null;
    /** @type {Record<string, unknown>|null} */
    let prResult = null;
    if (commitResult.ok === true || commitResult.reason === "already_committed") {
      try {
        pushResult = tryGitPushAfterApprovedCommit({
          projectRoot,
          outputDir: out,
          runId: rid,
          env: opts.env,
        });
        if (pushResult && pushResult.ok === true) {
          console.log(
            `[git-push] enviado para ${pushResult.remote}/${pushResult.branch}.`,
          );
        } else if (pushResult && pushResult.skipped && pushResult.reason === "already_pushed") {
          console.log("[git-push] já enviado (idempotente).");
        } else if (pushResult && pushResult.ok === false && !pushResult.skipped) {
          console.warn(`[git-push] falhou: ${pushResult.code || "git_push_failed"}`);
        }
      } catch (pushErr) {
        console.warn(
          "⚠️ tryGitPushAfterApprovedCommit (não fatal):",
          pushErr && pushErr.message ? pushErr.message : pushErr,
        );
      }

      if (
        pushResult &&
        (pushResult.ok === true || pushResult.reason === "already_pushed")
      ) {
        try {
          prResult = await tryGitPrAfterApprovedPush({
            projectRoot,
            outputDir: out,
            runId: rid,
            env: opts.env,
          });
          if (prResult && prResult.ok === true) {
            console.log(`[git-pr] PR aberto: ${prResult.url || prResult.id}`);
          } else if (prResult && prResult.skipped && prResult.reason === "already_opened") {
            console.log("[git-pr] PR já registado (idempotente).");
          } else if (prResult && prResult.ok === false && !prResult.skipped) {
            console.warn(`[git-pr] falhou: ${prResult.code || "git_pr_failed"}`);
          }
        } catch (prErr) {
          console.warn(
            "⚠️ tryGitPrAfterApprovedPush (não fatal):",
            prErr && prErr.message ? prErr.message : prErr,
          );
        }
      }
    }

    return { ...commitResult, push: pushResult, pr: prResult, normalize: norm };
  } catch (err) {
    console.warn(
      "⚠️ runPostReviewApprovedGitCommit: tryGitCommitAfterApprovedRun (não fatal):",
      err && err.message ? err.message : err,
    );
    return { ok: false, code: "git_commit_failed" };
  }
}

module.exports = {
  runPostReviewApprovedGitCommit,
};
