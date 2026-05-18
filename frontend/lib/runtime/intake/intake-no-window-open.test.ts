import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

test("módulos de intake/governança não usam window.open", () => {
  const root = fileURLToPath(new URL("../../..", import.meta.url));
  const files = [
    "lib/runtime/intake/intake-timeout-error.ts",
    "components/features/governance/GovernanceStatusCard.tsx",
    "components/features/intake/IntakeTimeoutErrorPanel.tsx",
    "hooks/use-create-run.ts",
  ];
  for (const rel of files) {
    const src = readFileSync(`${root}/${rel}`, "utf8");
    assert.ok(!/\bwindow\.open\s*\(/.test(src), `${rel} não deve chamar window.open()`);
  }
});
