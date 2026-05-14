"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");

const {
  evaluateStructuralExecutionGate,
  resolveStructuralOrTextualPatch,
} = require("./structural-execution-gate");

test("4.9.4.1 — limiar de confiança: score === min passa; score < min falha", () => {
  const basePlan = {
    op: "replace_node",
    mapping_status: "mapped",
    confidence_score: 90,
    search_geometry: { search_fully_inside_chosen_node_span: true },
    search_match_stats: { literal_matches: 1, normalized_matches: 1 },
    node_span: { start: 0, end: 1 },
    shadow_confidence: {},
  };

  const gEq = evaluateStructuralExecutionGate(basePlan, 0.9, "x", { search: "x" });
  assert.equal(gEq.allowed, true);

  const gBelow = evaluateStructuralExecutionGate(
    { ...basePlan, confidence_score: 89 },
    0.9,
    "x",
    { search: "x" },
  );
  assert.equal(gBelow.allowed, false);
  assert.ok(gBelow.block_reasons.includes("confidence_below_threshold"));
});

test("4.9.4.1 — divergência structural/textual ⇒ fallback textual + trigger divergence", () => {
  const planEntry = {
    op: "replace_node",
    mapping_status: "mapped",
    confidence_score: 100,
    search_geometry: { search_fully_inside_chosen_node_span: true },
    search_match_stats: { literal_matches: 1, normalized_matches: 1 },
    node_span: { start: 0, end: 1 },
    search: "a",
    replace: "b",
    shadow_confidence: {},
  };

  const res = resolveStructuralOrTextualPatch({
    before: "a",
    change: { search: "a", replace: "b" },
    minConfidenceFraction: 0,
    relativePath: "t.js",
    buildPlan: () => ({ entries: [planEntry] }),
    applyStructuralReplaceNode: () => "Z",
  });

  assert.equal(res.execution_mode_used, "textual");
  assert.equal(res.after, "b");
  assert.equal(res.fallback_trigger, "divergence");
  assert.ok(Array.isArray(res.fallback_reason_codes));
  assert.ok(res.fallback_reason_codes.includes("structural_textual_post_verify_mismatch"));
  assert.ok(
    String(res.fallback_reason || "").includes("structural_textual_post_verify_mismatch"),
  );
});
