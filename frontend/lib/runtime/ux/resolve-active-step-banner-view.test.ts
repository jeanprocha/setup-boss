import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveActiveStepBannerView } from "./resolve-active-step-banner-view.ts";
import type { RunUxState } from "./runtime-ux-types.ts";

function base(overrides: Partial<RunUxState>): RunUxState {
  return {
    activeStep: "strategy",
    visualStep: "execution",
    status: "running",
    headline: "A executar alterações…",
    detail: "Pipeline em progresso.",
    lastEventAt: "2026-05-17T12:00:00.000Z",
    hasHumanAction: false,
    isStalled: false,
    completedSteps: [],
    ...overrides,
  };
}

describe("resolveActiveStepBannerView", () => {
  it("running usa headline do ux sem rótulo estratégia", () => {
    const v = resolveActiveStepBannerView(
      base({ activeStep: "strategy", visualStep: "execution", status: "running" }),
    );
    assert.equal(v.variant, "running");
    assert.equal(v.stepLabel, "Execução");
    assert.equal(v.showObservabilityFooter, false);
  });

  it("waiting_user_action prioriza attentionHint", () => {
    const v = resolveActiveStepBannerView(
      base({
        activeStep: "approval",
        visualStep: "refined_plan",
        status: "waiting_user_action",
        hasHumanAction: true,
        detail: "fallback",
      }),
      { attentionHint: "Depende de si: aprove o plano refinado." },
    );
    assert.equal(v.variant, "waiting_user_action");
    assert.equal(v.headline, "Ação necessária");
    assert.equal(v.detail, "Depende de si: aprove o plano refinado.");
    assert.equal(v.stepLabel, "Aguardando ação");
  });

  it("stall não é erro e mostra footer de observabilidade", () => {
    const v = resolveActiveStepBannerView(
      base({ isStalled: true, status: "running" }),
    );
    assert.equal(v.variant, "stalled");
    assert.match(v.headline, /processando/i);
    assert.equal(v.showObservabilityFooter, true);
  });

  it("waiting vence stall", () => {
    const v = resolveActiveStepBannerView(
      base({
        isStalled: true,
        status: "waiting_user_action",
        hasHumanAction: true,
        activeStep: "clarification",
        visualStep: "clarification",
      }),
    );
    assert.equal(v.variant, "waiting_user_action");
  });

  it("completed e failed", () => {
    const done = resolveActiveStepBannerView(
      base({ status: "completed", activeStep: "completed", visualStep: "completed" }),
    );
    assert.equal(done.variant, "completed");
    assert.equal(done.headline, "Corrida concluída");

    const fail = resolveActiveStepBannerView(
      base({
        status: "failed",
        activeStep: "review",
        visualStep: "failed",
        detail: "Falha durante review.",
      }),
    );
    assert.equal(fail.variant, "failed");
    assert.match(fail.detail, /review/i);
    assert.equal(fail.stepLabel, "Falhou");
  });

  it("versionamento com CTA preparar branch", () => {
    const v = resolveActiveStepBannerView(
      base({
        activeStep: "git",
        visualStep: "versioning",
        headline: "Branch ainda não preparada",
      }),
      {
        versioning: { executeBlockCode: "git_branch_required" },
      },
    );
    assert.equal(v.stepLabel, "Versionamento");
    assert.equal(v.showPrepareBranchCta, true);
  });
});
