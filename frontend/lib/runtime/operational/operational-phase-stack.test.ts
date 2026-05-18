import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { deriveOperationalPhaseStackEntries } from "./operational-phase-stack.ts";
import type { RunOperationalUxContract } from "./operational-ux-types.ts";

function baseContract(
  overrides: Partial<RunOperationalUxContract> = {},
): RunOperationalUxContract {
  return {
    uxPhase: "initialization",
    uxStep: "compose_activity",
    uxPhaseLabelPt: "Inicialização",
    uxStepLabelPt: "Descrever atividade",
    iaValidated: true,
    contextLoaded: true,
    initialSpecReady: false,
    planningStatus: "idle",
    planningQuestionsPending: 0,
    finalPlanReady: false,
    requiresHumanAction: false,
    isInitializationPhase: true,
    isPlanningPhase: false,
    confidence: "high",
    ...overrides,
  };
}

describe("deriveOperationalPhaseStackEntries", () => {
  it("planning não repete inicialização no histórico", () => {
    const entries = deriveOperationalPhaseStackEntries(
      baseContract({
        uxPhase: "planning",
        initialSpecReady: true,
        isInitializationPhase: false,
        isPlanningPhase: true,
      }),
    );
    assert.equal(entries.length, 1);
    assert.equal(entries[0]?.phase, "planning");
    assert.equal(entries[0]?.mode, "active");
  });

  it("só inicialização quando ainda na fase", () => {
    const entries = deriveOperationalPhaseStackEntries(
      baseContract({ uxPhase: "initialization" }),
    );
    assert.equal(entries.length, 1);
    assert.equal(entries[0]?.mode, "active");
  });

  it("aprovação mantém planeamento no histórico", () => {
    const entries = deriveOperationalPhaseStackEntries(
      baseContract({
        uxPhase: "approval",
        isInitializationPhase: false,
        isPlanningPhase: false,
        initialSpecReady: true,
        finalPlanReady: true,
      }),
    );
    assert.equal(entries.length, 2);
    assert.equal(entries[0]?.phase, "planning");
    assert.equal(entries[0]?.mode, "history");
    assert.equal(entries[1]?.phase, "approval");
    assert.equal(entries[1]?.mode, "active");
  });
});
