import assert from "node:assert";
import { describe, it } from "node:test";
import {
  classifyRuntimeLogTier,
  normalizeRuntimeLogForUi,
  runtimeLogDedupeKey,
  strategyActivityLabel,
} from "./normalize-runtime-log-for-ui";

describe("normalizeRuntimeLogForUi", () => {
  it("compacta runtime.projects.pipeline", () => {
    const n = normalizeRuntimeLogForUi({
      tsIso: new Date().toISOString(),
      message: "runtime.projects.pipeline",
      detail: "finalCount=5\ndemosRemoved=26",
      type: "runtime.projects.pipeline",
    });
    assert.equal(n.tier, "technical");
    assert.match(n.displayMessage, /5 projetos/);
    assert.equal(n.omitRawPayload, false);
  });

  it("omite payload truncado do servidor", () => {
    const n = normalizeRuntimeLogForUi({
      tsIso: new Date().toISOString(),
      message: "runtime.big",
      detailTruncated: true,
      detailBytes: 393059,
    });
    assert.equal(n.omitRawPayload, true);
    assert.match(n.compactDetail ?? "", /Payload técnico grande \(384 KB\)/);
  });

  it("suprime strategy_waiting_user_action (hint POST legado)", () => {
    assert.equal(
      classifyRuntimeLogTier({
        type: "strategy_waiting_user_action",
        message: "POST /runs/:runId/strategy",
      }),
      "noise",
    );
  });

  it("classifica strategy_started como important", () => {
    assert.equal(
      classifyRuntimeLogTier({ type: "strategy_started", message: "x" }),
      "important",
    );
  });

  it("dedupe por id estável", () => {
    const a = runtimeLogDedupeKey({ id: "dlog_abc", tsIso: "t", message: "m" });
    const b = runtimeLogDedupeKey({ id: "dlog_abc", tsIso: "t2", message: "m2" });
    assert.equal(a, b);
  });

  it("strategyActivityLabel humaniza eventos", () => {
    assert.equal(strategyActivityLabel("strategy_decomposition_started"), "Decomposição iniciada");
  });
});
