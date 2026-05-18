import assert from "node:assert/strict";
import test from "node:test";
import {
  parseProjectGovernanceUx,
  readinessBadgeClass,
  readinessShortLabel,
  timelineStatusClass,
} from "./ia-governance-ux.ts";

test("parseProjectGovernanceUx: ready state", () => {
  const ux = parseProjectGovernanceUx({
    ok: true,
    readiness: "ready",
    headline: "Ready for execution",
    summary: "Knowledge Base validated successfully.",
    specVersion: "1.0",
    warningsCount: 0,
    errorsCount: 0,
    timeline: [{ id: "git", label: "Git", status: "ok", durationMs: 2, message: null, details: null }],
    performance: {},
    reportText: "report",
    validatedAt: "2026-05-16T12:00:00.000Z",
  });
  assert.ok(ux);
  assert.strictEqual(ux!.readiness, "ready");
  assert.strictEqual(readinessShortLabel(ux!.readiness), "Ready");
});

test("parseProjectGovernanceUx: warning state", () => {
  const ux = parseProjectGovernanceUx({
    ok: true,
    readiness: "warning",
    headline: "Execution allowed with warnings",
    summary: "warnings",
    warningsCount: 2,
    errorsCount: 0,
    timeline: [],
    performance: {},
    reportText: "",
    validatedAt: "",
  });
  assert.strictEqual(ux?.readiness, "warning");
  assert.ok(readinessBadgeClass("warning").includes("amber"));
});

test("parseProjectGovernanceUx: blocked state", () => {
  const ux = parseProjectGovernanceUx({
    ok: false,
    readiness: "blocked",
    headline: "Blocked",
    summary: "blocked",
    warningsCount: 0,
    errorsCount: 1,
    timeline: [],
    performance: {},
    reportText: "",
    validatedAt: "",
    onboarding: {
      title: "not ready",
      requiredStructure: [],
      requiredSeedFiles: [],
      bootstrapDoc: "x",
      nextSteps: [],
      docsLinks: [],
    },
  });
  assert.strictEqual(ux?.readiness, "blocked");
  assert.ok(ux?.onboarding);
});

test("timelineStatusClass observability states", () => {
  assert.ok(timelineStatusClass("ok").includes("emerald"));
  assert.ok(timelineStatusClass("warn").includes("amber"));
  assert.ok(timelineStatusClass("fail").includes("destructive"));
});
