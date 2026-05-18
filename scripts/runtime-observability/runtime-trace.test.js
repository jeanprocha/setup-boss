"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  appendRuntimeTrace,
  mergeTraceContext,
  runWithTraceContext,
  generateRequestId,
  safeSerializeError,
} = require("./runtime-trace.js");

test("safeSerializeError cobre objectos sem message", () => {
  const e = { code: "X", foo: 1 };
  const s = safeSerializeError(e);
  assert.ok(s && typeof s.message === "string");
});

test("appendRuntimeTrace não lança com diretório temporário", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sb-trace-"));
  const prev = process.env.SETUP_BOSS_DATA_DIR;
  process.env.SETUP_BOSS_DATA_DIR = dir;
  try {
    await runWithTraceContext({ requestId: generateRequestId(), outputDir: null }, async () => {
      mergeTraceContext({ projectId: "p-test", runId: "20260101-000000-test" });
      appendRuntimeTrace({
        component: "test",
        event: "smoke",
        message: "hello",
        outputDir: path.join(dir, "fake-out"),
      });
    });
    const tracesDir = path.join(dir, "traces");
    assert.ok(fs.existsSync(tracesDir));
    const globFile = path.join(tracesDir, "runtime-trace.jsonl");
    assert.ok(fs.existsSync(globFile));
    const raw = fs.readFileSync(globFile, "utf8");
    assert.match(raw, /"event":"smoke"/);
  } finally {
    if (prev == null) delete process.env.SETUP_BOSS_DATA_DIR;
    else process.env.SETUP_BOSS_DATA_DIR = prev;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
