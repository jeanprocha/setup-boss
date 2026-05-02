const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "..");

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
  }

  console.log("[VALIDATE_ARCHITECT] end");

  return violations;
}

function main() {
  const outputArg = process.argv[2];

  if (!outputArg) {
    console.log("Uso: node scripts/validate-architect.js <outputName|outputDir>");
    process.exit(1);
  }

  const outputDir = path.isAbsolute(outputArg)
    ? outputArg
    : path.join(ROOT_DIR, "outputs", outputArg);

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
};
