const fs = require("fs");
const path = require("path");
const { resolveOutputDir } = require("../core/run-resolver");

const REQUIRED_SECTIONS = [
  "## Entendimento",
  "## Riscos",
  "## Arquivos prováveis",
  "## Plano",
  "## Critério de parada",
];

function read(file) {
  return fs.readFileSync(file, "utf-8");
}

function ensureFile(file, label) {
  if (!fs.existsSync(file)) {
    console.log(`❌ ${label} não encontrado: ${file}`);
    process.exit(1);
  }
}

/**
 * Extrai o corpo de uma seção ## Título até a próxima linha que começa com "## " (markdown H2).
 * Sem regex pesada.
 */
function extractSection(content, sectionTitle) {
  const marker = `## ${sectionTitle}`;
  const idx = content.indexOf(marker);
  if (idx === -1) {
    return "";
  }

  let bodyStart = content.indexOf("\n", idx);
  if (bodyStart === -1) {
    return "";
  }
  bodyStart += 1;

  const nextIdx = content.indexOf("\n## ", bodyStart);
  if (nextIdx === -1) {
    return content.slice(bodyStart).trim();
  }

  return content.slice(bodyStart, nextIdx).trim();
}

function collectArchitectConcreteFileViolations(filesSection) {
  const violations = [];
  const lines = String(filesSection || "").split("\n");

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const item = line
      .replace(/^[-*]\s*/, "")
      .replace(/^`/, "")
      .replace(/`$/, "")
      .trim();

    if (!item) continue;

    const posixPath = item.replace(/\\/g, "/");

    if (item.endsWith("\\") || posixPath.endsWith("/")) {
      violations.push(
        `Arquivos prováveis deve conter apenas arquivos concretos, não diretórios: ${item}`
      );
      continue;
    }

    if (posixPath === ".IA/outputs/" || posixPath === ".setup-boss/runs/") {
      violations.push(
        `Arquivos prováveis deve conter apenas arquivos concretos, não diretórios: ${item}`
      );
    }
  }

  return violations;
}

function validateArchitectOutput(content) {
  console.log("[VALIDATE_ARCHITECT] start");

  const violations = [];

  for (const section of REQUIRED_SECTIONS) {
    if (!content.includes(section)) {
      violations.push(`Seção obrigatória ausente: ${section}`);
    }
  }

  const filesSection = extractSection(content, "Arquivos prováveis");

  if (!filesSection.trim()) {
    violations.push("Seção Arquivos prováveis está vazia.");
  } else {
    violations.push(...collectArchitectConcreteFileViolations(filesSection));
  }

  console.log("[VALIDATE_ARCHITECT] end");

  return violations;
}

function main() {
  const outputArg = process.argv[2];

  if (!outputArg) {
    console.log("Uso: node scripts/validate-architect.js <runId|outputDir>");
    process.exit(1);
  }

  let outputDir;

  try {
    outputDir = resolveOutputDir(outputArg);
  } catch (err) {
    console.error(err.message || err);
    process.exit(1);
  }

  const architectOutputPath = path.join(outputDir, "architect-output.md");
  const validationPath = path.join(outputDir, "architect-validation.json");

  ensureFile(outputDir, "Pasta de output");
  ensureFile(architectOutputPath, "architect-output.md");

  const content = read(architectOutputPath);
  const violations = validateArchitectOutput(content);

  const result = {
    status: violations.length === 0 ? "approved" : "blocked",
    violations,
    checked_at: new Date().toISOString(),
  };

  fs.writeFileSync(validationPath, JSON.stringify(result, null, 2), "utf-8");

  if (violations.length > 0) {
    console.log("❌ Architect bloqueado por enforcement:");
    for (const violation of violations) {
      console.log(`- ${violation}`);
    }
    process.exit(1);
  }

  console.log("✅ Architect validado por enforcement");
}

if (require.main === module) {
  main();
}

module.exports = {
  validateArchitectOutput,
  collectArchitectConcreteFileViolations,
};
