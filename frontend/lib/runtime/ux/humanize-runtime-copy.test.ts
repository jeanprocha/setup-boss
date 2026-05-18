import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  humanizeRawTypeLabel,
  isTechnicalLookingCopy,
  sanitizeHumanMessage,
  sanitizeHumanTitle,
} from "./humanize-runtime-copy.ts";

describe("humanize-runtime-copy", () => {
  it("remove jargão técnico de mensagens", () => {
    assert.equal(sanitizeHumanMessage("strategy_completed skipped=true"), "");
    assert.equal(sanitizeHumanMessage("workspace_run_sync.tick"), "");
    assert.equal(
      sanitizeHumanMessage("Nenhuma decomposição adicional necessária."),
      "Nenhuma decomposição adicional necessária.",
    );
  });

  it("humaniza títulos governance", () => {
    assert.equal(
      sanitizeHumanTitle(humanizeRawTypeLabel("governance.ia_warning")),
      "Base .IA com avisos",
    );
    assert.equal(
      humanizeRawTypeLabel("governance.ia_ok"),
      "Base .IA validada",
    );
  });

  it("detecta copy técnica", () => {
    assert.equal(isTechnicalLookingCopy("runtime.output_dir_resolved"), true);
    assert.equal(isTechnicalLookingCopy("Estratégia concluída"), false);
  });

  it("trunca mensagens longas", () => {
    const long = "a".repeat(200);
    const out = sanitizeHumanMessage(long);
    assert.equal(out.endsWith("…"), true);
    assert.equal(out.length <= 140, true);
  });
});
