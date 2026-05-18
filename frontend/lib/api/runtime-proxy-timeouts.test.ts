import assert from "node:assert/strict";
import test from "node:test";
import { resolveRuntimeProxyTimeoutMs } from "./runtime-proxy-timeouts.ts";

test("POST /runs usa timeout alinhado ao intake (>=120s)", () => {
  const ms = resolveRuntimeProxyTimeoutMs("POST", ["runs"]);
  assert.ok(ms >= 120_000);
});

test("POST /projects/git/register mantém timeout longo", () => {
  const ms = resolveRuntimeProxyTimeoutMs("POST", [
    "projects",
    "git",
    "register",
  ]);
  assert.strictEqual(ms, 180_000);
});

test("GET governance tem timeout generoso", () => {
  const ms = resolveRuntimeProxyTimeoutMs("GET", [
    "projects",
    "proj_x",
    "governance",
  ]);
  assert.ok(ms >= 45_000);
});
