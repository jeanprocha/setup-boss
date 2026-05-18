"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const { collectArchitectConcreteFileViolations } = require("../../validate-architect");
const { readProblemHistoryTail } = require("./historical-intelligence");
const { collectProjectLite } = require("./project-lite");
const { computeScanCacheFingerprint } = require("../scan-cache");

test("historical-intelligence: lê 09 em docs/.IA quando é o iaDir ativo", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sb-hist03-"));
  fs.mkdirSync(path.join(root, "docs", ".IA"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "docs", ".IA", "09-problem-history.jsonl"),
    '{"status":"error","severity":"high"}\n',
    "utf-8",
  );
  try {
    const r = readProblemHistoryTail(root, 10);
    assert.strictEqual(r.entries, 1);
    assert.strictEqual(r.recent_errors, 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("historical-intelligence: legado .IA na raiz quando só esse existe", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sb-histleg-"));
  fs.mkdirSync(path.join(root, ".IA"), { recursive: true });
  fs.writeFileSync(
    path.join(root, ".IA", "09-problem-history.jsonl"),
    '{"status":"ok"}\n',
    "utf-8",
  );
  try {
    const r = readProblemHistoryTail(root, 10);
    assert.strictEqual(r.entries, 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("project-lite: ignora docs/.IA mas conta docs/README e src", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sb-lite03-"));
  fs.mkdirSync(path.join(root, "docs", ".IA"), { recursive: true });
  fs.writeFileSync(path.join(root, "docs", ".IA", "hidden.md"), "x", "utf-8");
  fs.writeFileSync(path.join(root, "docs", "README.md"), "# hi", "utf-8");
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.writeFileSync(path.join(root, "src", "a.js"), "//x", "utf-8");
  try {
    const acc = collectProjectLite(root, { maxDepth: 6, maxFiles: 5000 });
    assert.ok(
      acc.fileCount >= 2,
      `esperado >=2 ficheiros fora de .IA; obtido ${acc.fileCount}`,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("validate-architect: rejeita docs/.IA/outputs/ como entrada de diretório", () => {
  const v = collectArchitectConcreteFileViolations("- docs/.IA/outputs/\n");
  assert.ok(v.length > 0);
});

test("validate-architect: ainda rejeita .IA/outputs/ legado", () => {
  const v = collectArchitectConcreteFileViolations("- .IA/outputs/\n");
  assert.ok(v.length > 0);
});

test("scan-cache: digest IA segue docs/.IA quando ativo", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sb-sc03-"));
  const setupRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sb-scb-"));
  fs.mkdirSync(path.join(root, "docs", ".IA"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "docs", ".IA", "00-project-profile.md"),
    "v1",
    "utf-8",
  );
  try {
    const a = computeScanCacheFingerprint(root, setupRoot);
    fs.writeFileSync(
      path.join(root, "docs", ".IA", "00-project-profile.md"),
      "v2",
      "utf-8",
    );
    const b = computeScanCacheFingerprint(root, setupRoot);
    assert.notStrictEqual(a.fingerprint, b.fingerprint);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(setupRoot, { recursive: true, force: true });
  }
});

test("architect.js não usa path.join(projectRoot, \".IA\")", () => {
  const src = fs.readFileSync(
    path.join(__dirname, "../../architect.js"),
    "utf-8",
  );
  assert.ok(
    !src.includes('path.join(projectRoot, ".IA")'),
    "operacional deve usar o resolver",
  );
});

test("scan.js não usa path.join(projectRoot, \".IA\")", () => {
  const src = fs.readFileSync(path.join(__dirname, "../../scan.js"), "utf-8");
  assert.ok(!src.includes('path.join(projectRoot, ".IA")'));
});
