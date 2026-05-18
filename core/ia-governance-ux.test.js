"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");

const {
  validateProjectKnowledgeBase,
  REQUIRED_SEED_FILES,
} = require("./validate-project-knowledge-base");
const { REQUIRED_INDEX_FILES } = require("./validate-ia-governance-structure");
const {
  resolveExecutionReadiness,
  buildHumanValidationSummary,
  buildGovernanceTimeline,
  formatGovernanceReport,
  buildGovernanceUxPayload,
  buildOnboardingUx,
} = require("./ia-governance-ux");

function tmpRoot(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function initGitRepo(root) {
  execFileSync("git", ["init"], { cwd: root, stdio: "pipe" });
  execFileSync("git", ["config", "user.email", "t@local"], { cwd: root, stdio: "pipe" });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: root, stdio: "pipe" });
}

function gitTrack(root, relPath, content = "# test\n") {
  const full = path.join(root, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, "utf-8");
  execFileSync("git", ["add", "--", relPath], { cwd: root, stdio: "pipe" });
  execFileSync("git", ["commit", "-m", "test"], { cwd: root, stdio: "pipe" });
}

const INDEX_MD = "Version: 1.0\n# .IA\n";

function gitTrackCompliantIa(root) {
  for (const rel of REQUIRED_SEED_FILES) {
    gitTrack(root, rel, rel.endsWith("index.md") ? INDEX_MD : "# seed\n");
  }
  for (const rel of REQUIRED_INDEX_FILES) {
    gitTrack(root, rel);
  }
}

test("governance ready state", () => {
  const root = tmpRoot("sb-gov-ux-ready-");
  initGitRepo(root);
  gitTrackCompliantIa(root);
  const r = validateProjectKnowledgeBase(root, { skipTargetRootGuard: true });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(resolveExecutionReadiness(r), "ready");
  const ux = buildGovernanceUxPayload(r);
  assert.strictEqual(ux.readiness, "ready");
  assert.match(String(ux.summary), /validated successfully/i);
  assert.strictEqual(ux.errorsCount, 0);
});

test("governance warning state (drift)", () => {
  const root = tmpRoot("sb-gov-ux-warn-");
  initGitRepo(root);
  gitTrackCompliantIa(root);
  gitTrack(root, "docs/.IA/extra-folder/readme.md", "# extra\n");
  const r = validateProjectKnowledgeBase(root, { skipTargetRootGuard: true });
  assert.strictEqual(r.ok, true);
  assert.ok((r.driftWarnings || []).length > 0);
  assert.strictEqual(resolveExecutionReadiness(r), "warning");
  const ux = buildGovernanceUxPayload(r);
  assert.strictEqual(ux.readiness, "warning");
  assert.match(String(ux.headline), /warnings/i);
});

test("governance blocked state (missing .IA)", () => {
  const root = tmpRoot("sb-gov-ux-block-");
  initGitRepo(root);
  const r = validateProjectKnowledgeBase(root, { skipTargetRootGuard: true });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(resolveExecutionReadiness(r), "blocked");
  const onboarding = buildOnboardingUx(r);
  assert.ok(onboarding);
  assert.match(String(onboarding.title), /not ready/i);
});

test("onboarding without .IA lists seed files", () => {
  const root = tmpRoot("sb-gov-ux-onb-");
  const r = validateProjectKnowledgeBase(root, { skipTargetRootGuard: true });
  const onboarding = buildOnboardingUx(r);
  assert.ok(onboarding);
  assert.ok(onboarding.requiredSeedFiles.includes("docs/.IA/index.md"));
});

test("validation summary rendering", () => {
  const root = tmpRoot("sb-gov-ux-sum-");
  initGitRepo(root);
  gitTrackCompliantIa(root);
  const r = validateProjectKnowledgeBase(root, { skipTargetRootGuard: true });
  const summary = buildHumanValidationSummary(r);
  assert.match(summary, /SPEC v1\.0/);
  assert.match(summary, /passed/i);
});

test("governance timeline rendering", () => {
  const root = tmpRoot("sb-gov-ux-tl-");
  initGitRepo(root);
  gitTrackCompliantIa(root);
  const r = validateProjectKnowledgeBase(root, { skipTargetRootGuard: true });
  const timeline = buildGovernanceTimeline(r);
  assert.strictEqual(timeline.length, 6);
  assert.strictEqual(timeline[0].id, "git");
  assert.strictEqual(timeline[0].status, "ok");
  assert.ok(timeline.some((t) => t.id === "seed" && t.status === "ok"));
});

test("copy governance report includes snapshot sections", () => {
  const root = tmpRoot("sb-gov-ux-copy-");
  initGitRepo(root);
  gitTrackCompliantIa(root);
  const r = validateProjectKnowledgeBase(root, { skipTargetRootGuard: true });
  const report = formatGovernanceReport(r, { projectId: "proj_test" });
  assert.match(report, /Governance Report/);
  assert.match(report, /validationSnapshot/);
  assert.match(report, /Timeline/);
  assert.match(report, /proj_test/);
});

test("blocked seed produces timeline fail at seed", () => {
  const root = tmpRoot("sb-gov-ux-seed-");
  initGitRepo(root);
  gitTrack(root, "docs/.IA/index.md", INDEX_MD);
  const r = validateProjectKnowledgeBase(root, { skipTargetRootGuard: true });
  assert.strictEqual(r.ok, false);
  const timeline = buildGovernanceTimeline(r);
  const seed = timeline.find((t) => t.id === "seed");
  assert.ok(seed);
  assert.strictEqual(seed.status, "fail");
});
