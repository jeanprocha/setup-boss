import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deriveHonestRunDisplay } from "./derive-honest-run-display.ts";

describe("deriveHonestRunDisplay", () => {
  it("job completed + clarification_required não vira concluído", () => {
    const d = deriveHonestRunDisplay("completed", {
      initialState: "clarification_required",
      uiPhase: "clarify",
      uiState: "waiting_clarification_answers",
    });
    assert.notEqual(d.state, "success");
    assert.equal(d.operationalStatusKey, "clarification_pending");
    assert.equal(d.state, "waiting_clarification_answers");
  });

  it("job completed + strategy_pending não vira concluído", () => {
    const d = deriveHonestRunDisplay("completed", {
      initialState: "strategy_pending",
      uiPhase: "strategy",
      uiState: "running",
    });
    assert.notEqual(d.state, "success");
    assert.equal(d.operationalStatusKey, "strategy_pending");
  });

  it("completed real (orchestration execution_completed) continua concluído", () => {
    const d = deriveHonestRunDisplay("completed", {
      orchestrationState: "execution_completed",
      uiState: "success",
      uiPhase: "execution",
    });
    assert.equal(d.state, "success");
    assert.equal(d.operationalStatusKey, "completed");
  });

  it("failed continua falhou", () => {
    const d = deriveHonestRunDisplay("failed", {
      initialState: "failed",
      uiState: "failed",
    });
    assert.equal(d.state, "failed");
    assert.equal(d.operationalStatusKey, "failed");
  });

  it("job completed + uiState completed inválido não força success sem orquestração terminal", () => {
    const d = deriveHonestRunDisplay("completed", {
      uiState: "completed",
      uiPhase: "clarify",
      initialState: "clarification_required",
    });
    assert.notEqual(d.state, "success");
  });

  it("job running na fila mantém running", () => {
    const d = deriveHonestRunDisplay("running", {
      uiPhase: "execution",
    });
    assert.equal(d.state, "running");
  });
});
