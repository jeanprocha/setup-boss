"use strict";

const test = require("node:test");
const assert = require("node:assert");
const {
  assertSafeRunKeySegment,
  _test: {
    sanitizeLogBlock,
    logBlockMatchesRun,
    parseDaemonLogTail,
    isGlobalDaemonLogEvent,
    capDaemonLogDetail,
    MAX_DETAIL_CHARS,
  },
} = require("./run-observability-bundle");

test("assertSafeRunKeySegment rejeita traversal", () => {
  assert.strictEqual(assertSafeRunKeySegment("ok-run-id"), "ok-run-id");
  assert.strictEqual(assertSafeRunKeySegment("../x"), null);
  assert.strictEqual(assertSafeRunKeySegment("a/b"), null);
});

test("sanitizeLogBlock remove repo root e tokens", () => {
  const root = "D:/acme/proj";
  const raw = `${root}/out/x\nBearer secret-token\n`;
  const s = sanitizeLogBlock(raw, root);
  assert.ok(s.includes("[repo]"));
  assert.ok(s.includes("[redacted]"));
});

test("logBlockMatchesRun por runId/jobId flatten", () => {
  const b = "[ts] INFO ev\nrunId=run_abc\n";
  assert.strictEqual(logBlockMatchesRun(b, "run_abc", null), true);
  assert.strictEqual(logBlockMatchesRun(b, "other", null), false);
  const b2 = "jobId=job_99\n";
  assert.strictEqual(logBlockMatchesRun(b2, "x", "job_99"), true);
});

test("parseDaemonLogTail extrai nível e mensagem", () => {
  const tail =
    "[2026-05-15 10:00:00.000] INFO runtime.test\nrunId=r1\nx=1\n\n[2026-05-15 10:00:01.000] WARN other\nrunId=r2\n";
  const out = parseDaemonLogTail(tail, "r1", null, "/tmp/repo");
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].level, "INFO");
  assert.strictEqual(out[0].message, "runtime.test");
  assert.ok(out[0].detail && out[0].detail.includes("runId=r1"));
});

test("isGlobalDaemonLogEvent identifica eventos de projects", () => {
  assert.strictEqual(isGlobalDaemonLogEvent("runtime.projects.pipeline"), true);
  assert.strictEqual(isGlobalDaemonLogEvent("runtime.projects.list"), true);
  assert.strictEqual(isGlobalDaemonLogEvent("runtime.test"), false);
});

test("parseDaemonLogTail exclui runtime.projects.pipeline mesmo com runId no bloco", () => {
  const huge = "x".repeat(5000);
  const tail = `[2026-05-15 10:00:00.000] INFO runtime.projects.pipeline\nrunId=r1\nfinalProjects=${huge}\n\n[2026-05-15 10:00:01.000] INFO run.intake\nrunId=r1\nok=true\n`;
  const out = parseDaemonLogTail(tail, "r1", null, "/tmp/repo");
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].message, "run.intake");
});

test("capDaemonLogDetail trunca detail grande", () => {
  const big = "a".repeat(MAX_DETAIL_CHARS + 500);
  const capped = capDaemonLogDetail(big);
  assert.strictEqual(capped.detailTruncated, true);
  assert.ok(capped.detailBytes > MAX_DETAIL_CHARS);
  assert.ok(capped.detail && capped.detail.length <= MAX_DETAIL_CHARS + 120);
});

test("parseDaemonLogTail aplica cap em detail", () => {
  const huge = "z".repeat(MAX_DETAIL_CHARS + 2000);
  const tail = `[2026-05-15 10:00:00.000] INFO run.worker\nrunId=r1\nbody=${huge}\n`;
  const out = parseDaemonLogTail(tail, "r1", null, "/tmp/repo");
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].detailTruncated, true);
  assert.ok(out[0].detailBytes > MAX_DETAIL_CHARS);
  assert.ok(out[0].detail && out[0].detail.includes("detail truncated"));
});
