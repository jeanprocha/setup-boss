import assert from "node:assert/strict";
import test from "node:test";
import {
  governanceRuntimeLogDedupeKey,
  logGovernanceWarningToRuntime,
} from "./log-governance-runtime-observation.ts";
import type { ProjectGovernanceUx } from "./ia-governance-ux.ts";
import { useUiDiagnosticsStore } from "../../../stores/ui-diagnostics-store.ts";

function sampleUx(
  readiness: ProjectGovernanceUx["readiness"],
): ProjectGovernanceUx {
  return {
    ok: readiness !== "blocked",
    readiness,
    headline: "Execution allowed with warnings",
    summary: "12 warnings",
    specVersion: "1.0",
    supportedVersions: ["1.0"],
    validationDurationMs: 38,
    warningsCount: 12,
    errorsCount: 0,
    timeline: [],
    onboarding: null,
    performance: {
      validationDurationMs: 38,
      fileCount: 31,
      contentLoadMs: null,
      gitListMs: null,
    },
    reportText: "=== report ===",
    validationSnapshot: null,
    iaValidation: null,
    code: null,
    phase: null,
    validatedAt: "2026-05-17T12:00:00.000Z",
  };
}

test("logGovernanceWarningToRuntime só regista readiness warning", () => {
  useUiDiagnosticsStore.setState({ entries: [] });
  logGovernanceWarningToRuntime("proj_a", sampleUx("warning"));
  logGovernanceWarningToRuntime("proj_a", sampleUx("ready"));
  logGovernanceWarningToRuntime("proj_a", sampleUx("blocked"));
  const entries = useUiDiagnosticsStore.getState().entries;
  assert.equal(entries.length, 1);
  assert.equal(entries[0]!.level, "WARN");
  assert.equal(entries[0]!.category, "validation");
  assert.match(entries[0]!.message, /warnings/i);
});

test("governanceRuntimeLogDedupeKey estável sem validatedAt", () => {
  const ux = sampleUx("warning");
  const a = governanceRuntimeLogDedupeKey("p1", ux);
  const b = governanceRuntimeLogDedupeKey("p1", {
    ...ux,
    validatedAt: "2026-05-17T16:47:19.000Z",
  });
  assert.equal(a, b);
});

test("logGovernanceWarningToRuntime não duplica no mesmo projeto", () => {
  useUiDiagnosticsStore.setState({ entries: [] });
  const ux = sampleUx("warning");
  logGovernanceWarningToRuntime("proj_dup", ux);
  logGovernanceWarningToRuntime("proj_dup", {
    ...ux,
    validatedAt: "2026-05-17T16:47:19.000Z",
  });
  assert.equal(useUiDiagnosticsStore.getState().entries.length, 1);
});
