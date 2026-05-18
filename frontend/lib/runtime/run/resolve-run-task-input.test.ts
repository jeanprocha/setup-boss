import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveRunTaskInput } from "./resolve-run-task-input.ts";

describe("resolveRunTaskInput", () => {
  it("prioriza intakeTaskText em metadata", () => {
    assert.equal(
      resolveRunTaskInput({
        taskArg: "proj/.setup-boss/inbox/run-task.md",
        metadata: { intakeTaskText: "Criar chat na tela de integrações" },
      }),
      "Criar chat na tela de integrações",
    );
  });

  it("usa taskArg quando é texto inline", () => {
    assert.equal(
      resolveRunTaskInput({
        taskArg: "Fechar o chat lateral",
        metadata: null,
      }),
      "Fechar o chat lateral",
    );
  });

  it("ignora taskArg que é path para ficheiro", () => {
    assert.equal(
      resolveRunTaskInput({
        taskArg: "demo/.setup-boss/inbox/20260517-fechar-chat-task.md",
        metadata: null,
      }),
      null,
    );
  });
});
