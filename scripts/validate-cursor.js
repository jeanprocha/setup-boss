const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "..");

function read(file) {
  return fs.readFileSync(file, "utf-8");
}

function ensureFile(file, label) {
  if (!fs.existsSync(file)) {
    console.log(`❌ ${label} não encontrado: ${file}`);
    process.exit(1);
  }
}

function normalizeRelPath(value) {
  return value
    .trim()
    .replace(/^[-*]\s*/, "")
    .replace(/^`|`$/g, "")
    .replace(/\\/g, "/");
}

function extractAllowedFiles(architectOutput) {
  const sectionMatch = architectOutput.match(
    /## Arquivos prováveis([\s\S]*?)(\n## |\n# |$)/
  );

  if (!sectionMatch) return [];

  return sectionMatch[1]
    .split("\n")
    .map(normalizeRelPath)
    .filter(Boolean)
    .filter((line) => !line.startsWith("Se "))
    .filter((line) => !line.includes(":"))
    .filter((line) => !line.startsWith("Não "))
    .filter((line) => line.includes("."));
}

function extractChangedFiles(cursorOutput) {
  const patterns = [
    /(?:arquivo|file)\s*:\s*`?([^`\n]+)`?/gi,
    /(?:alterado|criado|modificado)\s*:\s*`?([^`\n]+)`?/gi,
    /^[-*]\s*`([^`]+)`/gm
  ];

  const files = new Set();

  for (const pattern of patterns) {
    let match;

    while ((match = pattern.exec(cursorOutput)) !== null) {
      const value = normalizeRelPath(match[1] || "");
      if (value && value.includes(".")) {
        files.add(value);
      }
    }
  }

  return Array.from(files);
}

function isAllowedFile(file, allowedFiles) {
  if (allowedFiles.length === 0) return false;

  return allowedFiles.some((allowed) => {
    return file === allowed || file.startsWith(`${allowed}/`);
  });
}

function validateCursorOutput({ architectOutput, cursorOutput }) {
  const allowedFiles = extractAllowedFiles(architectOutput);
  const changedFiles = extractChangedFiles(cursorOutput);

  const violations = [];

  if (allowedFiles.length === 0) {
    violations.push(
      "Nenhum arquivo permitido foi encontrado no Architect output."
    );
  }

  for (const file of changedFiles) {
    if (!isAllowedFile(file, allowedFiles)) {
      violations.push(`Arquivo fora do escopo declarado: ${file}`);
    }
  }

  return {
    allowedFiles,
    changedFiles,
    violations
  };
}

function main() {
  const outputArg = process.argv[2];

  if (!outputArg) {
    console.log("Uso: node scripts/validate-cursor.js <outputName|outputDir>");
    process.exit(1);
  }

  const outputDir = path.isAbsolute(outputArg)
    ? outputArg
    : path.join(ROOT_DIR, "outputs", outputArg);

  const architectOutputPath = path.join(outputDir, "architect-output.md");
  const cursorOutputPath = path.join(outputDir, "cursor-output.md");
  const validationPath = path.join(outputDir, "cursor-validation.json");

  ensureFile(outputDir, "Pasta de output");
  ensureFile(architectOutputPath, "architect-output.md");
  ensureFile(cursorOutputPath, "cursor-output.md");

  const result = validateCursorOutput({
    architectOutput: read(architectOutputPath),
    cursorOutput: read(cursorOutputPath)
  });

  const payload = {
    status: result.violations.length === 0 ? "approved" : "blocked",
    allowed_files: result.allowedFiles,
    changed_files: result.changedFiles,
    violations: result.violations,
    checked_at: new Date().toISOString()
  };

  fs.writeFileSync(validationPath, JSON.stringify(payload, null, 2), "utf-8");

  if (result.violations.length > 0) {
    console.log("❌ Cursor bloqueado por enforcement:");
    for (const violation of result.violations) {
      console.log(`- ${violation}`);
    }
    process.exit(1);
  }

  console.log("✅ Cursor validado por enforcement");
}

if (require.main === module) {
  main();
}

module.exports = {
  validateCursorOutput,
  extractAllowedFiles,
  extractChangedFiles
};