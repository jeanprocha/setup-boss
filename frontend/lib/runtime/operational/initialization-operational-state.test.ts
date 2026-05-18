import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  deriveInitializationOperationalStatus,
  labelInitializationOperationalStatus,
} from "./initialization-operational-state.ts";
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
    contextLoaded: false,
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

describe("deriveInitializationOperationalStatus", () => {
  it("composeOnly + ia ok → awaiting_activity", () => {
    const s = deriveInitializationOperationalStatus({
      contract: baseContract(),
      composeOnly: true,
    });
    assert.equal(s, "awaiting_activity");
    assert.equal(
      labelInitializationOperationalStatus(s),
      "Aguardar descrição da atividade",
    );
  });

  it("preSubmitCompose → awaiting_activity sem validar .IA", () => {
    const s = deriveInitializationOperationalStatus({
      contract: baseContract({ iaValidated: false }),
      composeOnly: true,
      preSubmitCompose: true,
    });
    assert.equal(s, "awaiting_activity");
  });

  it("ia blocked → ia_missing", () => {
    const s = deriveInitializationOperationalStatus({
      contract: baseContract({ iaValidated: false }),
      composeOnly: true,
    });
    assert.equal(s, "ia_missing");
    assert.equal(
      labelInitializationOperationalStatus(s),
      "Contexto IA não encontrado",
    );
  });

  it("governance loading → validating_ia", () => {
    const s = deriveInitializationOperationalStatus({
      contract: baseContract({ iaValidated: null }),
      composeOnly: true,
      governanceLoading: true,
    });
    assert.equal(s, "validating_ia");
  });

  it("initialSpecReady → spec_ready", () => {
    const s = deriveInitializationOperationalStatus({
      contract: baseContract({
        initialSpecReady: true,
        contextLoaded: true,
      }),
      composeOnly: false,
    });
    assert.equal(s, "spec_ready");
    assert.equal(
      labelInitializationOperationalStatus(s),
      "SPEC inicial pronta",
    );
  });

  it("run em intake → generating_spec", () => {
    const s = deriveInitializationOperationalStatus({
      contract: baseContract({
        contextLoaded: true,
        iaValidated: true,
      }),
      composeOnly: false,
    });
    assert.equal(s, "generating_spec");
  });
});
