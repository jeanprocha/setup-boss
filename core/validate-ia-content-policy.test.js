"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const {
  validateIaContentPolicy,
  buildSensitiveDataFailure,
  redactSecretSample,
  languageHeuristicStats,
} = require("./validate-ia-content-policy");

function tmpRoot(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeFile(root, rel, content) {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, "utf-8");
}

test("validateIaContentPolicy: sem issues", () => {
  const root = tmpRoot("sb-policy-ok-");
  writeFile(
    root,
    "docs/.IA/system/seed-rules.md",
    "# Seed rules\n\nUse English for governance documentation.\n",
  );
  const tracked = ["docs/.IA/system/seed-rules.md"];
  const r = validateIaContentPolicy(root, tracked);
  assert.strictEqual(r.policyValid, true);
  assert.strictEqual(r.secretScan.ok, true);
  assert.strictEqual(r.languageScan.ok, true);
  assert.strictEqual(r.policyWarnings.length, 0);
  fs.rmSync(root, { recursive: true, force: true });
});

test("validateIaContentPolicy: password detectado bloqueia", () => {
  const root = tmpRoot("sb-policy-pwd-");
  const rel = "docs/.IA/environment/access.md";
  writeFile(root, rel, "password = SuperSecret123!\n");
  const r = validateIaContentPolicy(root, [rel]);
  assert.strictEqual(r.policyValid, false);
  assert.ok(r.secretScan.ruleIds.includes("password_assignment"));
  assert.ok(r.secretScan.matchedFiles.includes(rel));
  fs.rmSync(root, { recursive: true, force: true });
});

test("validateIaContentPolicy: token detectado", () => {
  const root = tmpRoot("sb-policy-tok-");
  const rel = "docs/.IA/environment/access.md";
  writeFile(
    root,
    rel,
    'access_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9payload"',
  );
  const r = validateIaContentPolicy(root, [rel]);
  assert.strictEqual(r.policyValid, false);
  assert.ok(r.secretScan.ruleIds.includes("access_token_assignment"));
  fs.rmSync(root, { recursive: true, force: true });
});

test("validateIaContentPolicy: private key detectada", () => {
  const root = tmpRoot("sb-policy-key-");
  const rel = "docs/.IA/environment/access.md";
  writeFile(
    root,
    rel,
    "-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA\n-----END RSA PRIVATE KEY-----\n",
  );
  const r = validateIaContentPolicy(root, [rel]);
  assert.strictEqual(r.policyValid, false);
  assert.ok(r.secretScan.ruleIds.includes("private_key_pem"));
  fs.rmSync(root, { recursive: true, force: true });
});

test("redactSecretSample: samples mascarados", () => {
  const masked = redactSecretSample("password=MyVerySecretValue");
  assert.ok(!masked.includes("MyVerySecretValue"));
  assert.ok(masked.includes("*"));
  const failure = buildSensitiveDataFailure(
    {
      policyValid: false,
      secretScan: {
        ok: false,
        matchedFiles: ["docs/.IA/x.md"],
        ruleIds: ["password_assignment"],
        redactedSamples: ["docs/.IA/x.md: pass****ue [password_assignment]"],
      },
      languageScan: { ok: true, suspectedFiles: [], confidence: null, sampleReason: null },
      policyWarnings: [],
    },
    "docs/.IA",
  );
  assert.strictEqual(failure.code, "KNOWLEDGE_BASE_SENSITIVE_DATA");
  assert.ok(
    failure.redactedSamples.every((s) => !String(s).includes("MyVerySecretValue")),
  );
});

test("validateIaContentPolicy: language warning PT", () => {
  const root = tmpRoot("sb-policy-lang-");
  const rel = "docs/.IA/architecture/overview.md";
  const ptText =
    "Esta documentação descreve a arquitetura do sistema para o projeto. " +
    "O objetivo é explicar como os componentes se relacionam entre si e também " +
    "como a configuração deve ser mantida para que não haja problemas quando " +
    "o utilizador precisar de entender o fluxo completo da aplicação no ambiente.";
  writeFile(root, rel, ptText.repeat(3));
  const r = validateIaContentPolicy(root, [rel]);
  assert.strictEqual(r.policyValid, true);
  assert.strictEqual(r.languageScan.ok, false);
  assert.ok(r.languageScan.suspectedFiles.includes(rel));
  assert.ok(r.policyWarnings.some((w) => w.code === "KNOWLEDGE_BASE_LANGUAGE_WARNING"));
  fs.rmSync(root, { recursive: true, force: true });
});

test("validateIaContentPolicy: language warning não bloqueia", () => {
  const root = tmpRoot("sb-policy-lang-ok-");
  const rel = "docs/.IA/architecture/overview.md";
  const ptText =
    "Esta documentação descreve a arquitetura do sistema para o projeto. " +
    "O objetivo é explicar como os componentes se relacionam entre si e também " +
    "como a configuração deve ser mantida para que não haja problemas quando " +
    "o utilizador precisar de entender o fluxo completo da aplicação no ambiente.";
  writeFile(root, rel, ptText.repeat(3));
  const r = validateIaContentPolicy(root, [rel]);
  assert.strictEqual(r.policyValid, true);
  assert.strictEqual(r.secretScan.ok, true);
  fs.rmSync(root, { recursive: true, force: true });
});

test("languageHeuristicStats: ignora blocos de código", () => {
  const stats = languageHeuristicStats(
    "```\nconst que = 'não para com uma'\n```\n\nEnglish overview only.",
  );
  assert.ok(stats.wordCount >= 1);
});
