import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  executionLevelFromMode,
  modeFromExecutionLevel,
  defaultComplexityExplanation,
} from "./operational-plan-execution-level.ts";

describe("operational-plan-execution-level", () => {
  it("mapeia modos de strategy para níveis de execução", () => {
    assert.equal(executionLevelFromMode("basic"), "low");
    assert.equal(executionLevelFromMode("standard"), "normal");
    assert.equal(executionLevelFromMode("expert"), "high");
    assert.equal(modeFromExecutionLevel("low"), "basic");
    assert.equal(modeFromExecutionLevel("normal"), "standard");
    assert.equal(modeFromExecutionLevel("high"), "expert");
  });

  it("fornece explicações humanas de complexidade", () => {
    assert.match(defaultComplexityExplanation("low"), /localizada/i);
    assert.match(defaultComplexityExplanation("medium"), /componentes/i);
    assert.match(defaultComplexityExplanation("high"), /módulos/i);
  });
});
