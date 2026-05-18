import assert from "node:assert/strict";
import test from "node:test";
import { parseIaValidation } from "./ia-validation.ts";

test("parseIaValidation: inclui policy com secretScan", () => {
  const ia = parseIaValidation({
    valid: false,
    specVersion: "1.0",
    checks: [
      { id: "policy", label: "Content Policy", status: "fail" },
    ],
    errors: [],
    warnings: [],
    git: { ok: true },
    seed: { ok: true },
    version: { ok: true },
    structure: { ok: true },
    drift: { ok: true },
    policy: {
      ok: false,
      matchedFiles: ["docs/.IA/environment/access.md"],
      ruleIds: ["password_assignment"],
      redactedSamples: ["docs/.IA/environment/access.md: pass****ue"],
    },
  });
  assert.ok(ia);
  assert.ok(ia!.policy.matchedFiles);
  assert.strictEqual(
    (ia!.policy.matchedFiles as string[])[0],
    "docs/.IA/environment/access.md",
  );
});
