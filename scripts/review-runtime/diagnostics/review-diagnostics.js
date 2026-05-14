/**
 * Agrega dados para CLI/diagnostics do review runtime.
 */

const fs = require("fs");
const path = require("path");
const {
  REVIEW_RESULTS_FILENAME,
  REVIEW_RUNTIME_MANIFEST_FILENAME,
  REVIEW_CORRECTION_HINTS_FILENAME,
  REVIEW_DIFF_FILENAME,
  REVIEW_BASELINE_SUMMARY_FILENAME,
} = require("../constants");
const { collectRuntimeSnapshot } = require("../lib/runtime-snapshot");
const {
  loadDeterministicReview,
  aggregateDeterministicReviewForInspect,
  buildDeterministicReviewInspectSnapshot,
} = require("../deterministic-review-runtime");
const {
  getReviewGateModeFromEnv,
  getReviewGateThresholdFromEnv,
} = require("../deterministic-review-gate");
const {
  getBaselineModeFromEnv,
  getBaselinePathFromEnv,
  parseBaselineThresholdProfile,
  loadBaselineRegressionSummary,
  baselineRegressionSummaryPath,
} = require("../deterministic-review-baseline");
const { runStructuralReview } = require("../structural/structural-review-engine");
const { runAllInvariants } = require("../invariants");
const { runSemanticReview } = require("../semantic/semantic-review-layer");
const { getReviewEngineMode } = require("../feature-flags");

function readJson(p) {
  try {
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch (_) {
    return null;
  }
}

function collectReviewDiagnostics(outputDir, opts = {}) {
  const dir = String(outputDir || "");
  const includeRerun = opts.include_rerun === true;
  const includeFullDeterministic = opts.include_deterministic_full === true;
  const snapshot = collectRuntimeSnapshot(dir, null);

  const review_results = readJson(path.join(dir, REVIEW_RESULTS_FILENAME));
  const review_manifest = readJson(path.join(dir, REVIEW_RUNTIME_MANIFEST_FILENAME));
  const correction_hints = readJson(path.join(dir, REVIEW_CORRECTION_HINTS_FILENAME));
  const deterministic_review_doc = loadDeterministicReview(dir);
  const deterministic_review_fingerprint =
    deterministic_review_doc &&
    deterministic_review_doc.fingerprints &&
    deterministic_review_doc.fingerprints.deterministic_review_content_sha256 != null
      ? String(deterministic_review_doc.fingerprints.deterministic_review_content_sha256)
      : null;
  const deterministic_review_summary = aggregateDeterministicReviewForInspect(deterministic_review_doc);
  const deterministic_review_inspect = buildDeterministicReviewInspectSnapshot(deterministic_review_doc);

  const review_diff_present = Boolean(dir && fs.existsSync(path.join(dir, REVIEW_DIFF_FILENAME)));
  const review_baseline_summary_present = Boolean(dir && fs.existsSync(path.join(dir, REVIEW_BASELINE_SUMMARY_FILENAME)));

  let structural_rerun = null;
  let invariants_rerun = null;
  let semantic_rerun = null;

  if (includeRerun) {
    structural_rerun = runStructuralReview(snapshot);
    invariants_rerun = runAllInvariants(snapshot);
    semantic_rerun = runSemanticReview(snapshot);
  }

  return {
    output_dir: dir,
    review_engine_env: getReviewEngineMode(),
    deterministic_review_present: !!deterministic_review_doc,
    deterministic_review_fingerprint,
    deterministic_review_summary,
    deterministic_review_inspect,
    deterministic_review_gate:
      deterministic_review_doc && deterministic_review_doc.gate && typeof deterministic_review_doc.gate === "object"
        ? deterministic_review_doc.gate
        : null,
    review_gate_env: {
      SETUP_BOSS_REVIEW_GATE_MODE: getReviewGateModeFromEnv(),
      SETUP_BOSS_REVIEW_GATE_THRESHOLD: getReviewGateThresholdFromEnv(),
    },
    review_baseline_env: {
      SETUP_BOSS_REVIEW_BASELINE_MODE: getBaselineModeFromEnv(),
      SETUP_BOSS_REVIEW_BASELINE_PATH: getBaselinePathFromEnv(),
      SETUP_BOSS_REVIEW_BASELINE_THRESHOLD: parseBaselineThresholdProfile().join(","),
    },
    review_baseline_summary_path: baselineRegressionSummaryPath(dir),
    review_baseline_summary: loadBaselineRegressionSummary(dir),
    deterministic_review_bundle: {
      deterministic_review_present: !!deterministic_review_doc,
      review_diff_present,
      review_baseline_summary_present,
      filenames: {
        deterministic_review: "deterministic-review.json",
        review_diff: REVIEW_DIFF_FILENAME,
        review_baseline_summary: REVIEW_BASELINE_SUMMARY_FILENAME,
      },
    },
    inspect_review_diff_cli: "inspect-review --diff <runA> <runB> [--json] [--write-diff] [--compact]",
    inspect_review_single_cli:
      "inspect-review [runId|latest|índice] [--json] [--compact] [--rerun-invariants] [--include-transaction] [--full-deterministic]",
    artifacts: {
      review_results_present: !!review_results,
      review_manifest_present: !!review_manifest,
      correction_hints_present: !!correction_hints,
      deterministic_review_present: !!deterministic_review_doc,
    },
    review_results,
    review_manifest,
    correction_hints,
    deterministic_review: includeFullDeterministic ? deterministic_review_doc : null,
    structural_rerun,
    invariants_rerun,
    semantic_rerun,
  };
}

module.exports = { collectReviewDiagnostics };
