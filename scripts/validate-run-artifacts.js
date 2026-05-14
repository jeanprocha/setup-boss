#!/usr/bin/env node
/**
 * Validador CLI de artefactos de uma run.
 * Uso: node scripts/validate-run-artifacts.js <outputDir|runId> [--json] [--report-json=caminho] [--no-strict-project-root]
 *
 * Se <target> for um directório existente que contenha metadata.json, aceita qualquer caminho
 * (útil para fixtures / auditorias). Caso contrário usa resolveOutputDir (índice, legado, etc.).
 */

require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { resolveOutputDir } = require("../core/run-resolver");
const { validateRunArtifacts } = require("./runtime/validation/run-artifacts-validator");
const { validateLifecycleConsistency } = require("./runtime/validation/lifecycle-consistency");

function resolveValidationOutputDir(target) {
  const a = String(target || "").trim();
  const candidates = [path.resolve(a), path.resolve(process.cwd(), a)];
  for (const c of candidates) {
    try {
      if (
        fs.existsSync(c) &&
        fs.statSync(c).isDirectory() &&
        fs.existsSync(path.join(c, "metadata.json"))
      ) {
        return c;
      }
    } catch (_) {
      /* continuar */
    }
  }
  return resolveOutputDir(a, { warnLegacy: true });
}

function parseArgs(argv) {
  const positional = argv.filter((x) => !x.startsWith("--"));
  const json = argv.includes("--json");
  const strictProjectRoot = !argv.includes("--no-strict-project-root");
  const rp = argv.find((a) => /^--report-json=/i.test(a));
  const reportJsonPath = rp
    ? String(rp.replace(/^[^=]+=/i, "")).trim() || null
    : null;
  return { target: positional[0], json, strictProjectRoot, reportJsonPath };
}

function main() {
  const argv = process.argv.slice(2);
  const { target, json, strictProjectRoot, reportJsonPath } = parseArgs(argv);

  if (!target) {
    console.error(
      "Uso: node scripts/validate-run-artifacts.js <outputDir|runId> [--json] [--report-json=caminho] [--no-strict-project-root]",
    );
    process.exitCode = 2;
    return;
  }

  let outputDir;

  try {
    outputDir = resolveValidationOutputDir(target);
  } catch (e) {
    console.error(String(e.message || e));
    process.exitCode = 2;
    return;
  }

  const artifactReport = validateRunArtifacts(outputDir, { strictProjectRoot });
  const lifeReport = validateLifecycleConsistency(outputDir);

  const payload = {
    output_dir: path.resolve(outputDir),
    artifacts: artifactReport,
    lifecycle: lifeReport,
    ok: artifactReport.ok && lifeReport.ok,
  };

  if (reportJsonPath) {
    const rpResolved = path.resolve(reportJsonPath);
    try {
      fs.mkdirSync(path.dirname(rpResolved), { recursive: true });
    } catch (_) {
      /* ficheiro só no cwd */
    }
    fs.writeFileSync(rpResolved, JSON.stringify(payload, null, 2), "utf-8");
  }

  if (json && !reportJsonPath) {
    console.log(JSON.stringify(payload, null, 2));
  } else if (!json) {
    console.log(`Validação: ${payload.output_dir}`);
    const printList = (label, arr) => {
      if (!arr.length) return;
      console.log(`\n${label}`);
      for (const x of arr) console.log(`  - ${x}`);
    };
    printList("Erros (artefactos):", artifactReport.errors);
    printList("Avisos (artefactos):", artifactReport.warnings);
    printList("Info (artefactos):", artifactReport.infos);
    if (lifeReport.issues.length) {
      console.log("\nConsistência de ciclo de vida");
      for (const i of lifeReport.issues) {
        console.log(`  [${i.severity}] ${i.code}: ${i.message}`);
      }
    }
    console.log(payload.ok ? "\n✅ OK" : "\n❌ FALHOU");
  }

  process.exitCode = payload.ok ? 0 : 1;
}

main();
