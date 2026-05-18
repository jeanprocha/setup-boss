import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  composeAwaitingInitialSubmit,
  projectGovernanceEnabledForIntake,
} from "./compose-governance-gate.ts";

describe("compose-governance-gate", () => {
  it("compose idle → sem governança", () => {
    assert.equal(composeAwaitingInitialSubmit(true, "idle"), true);
    assert.equal(
      projectGovernanceEnabledForIntake({
        projectId: "p1",
        composeOnly: true,
        runInIntake: false,
        intakeUiPhase: "idle",
      }),
      false,
    );
  });

  it("creating_run → governança activa", () => {
    assert.equal(
      projectGovernanceEnabledForIntake({
        projectId: "p1",
        composeOnly: true,
        runInIntake: false,
        intakeUiPhase: "creating_run",
      }),
      true,
    );
  });

  it("run em intake → governança activa", () => {
    assert.equal(
      projectGovernanceEnabledForIntake({
        projectId: "p1",
        composeOnly: false,
        runInIntake: true,
        intakeUiPhase: "idle",
      }),
      true,
    );
  });
});
