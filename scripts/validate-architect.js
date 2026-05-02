const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "..");

const REQUIRED_SECTIONS = [
  "## Arquivos prováveis",
  "## Plano",
  "## Critério de parada",
];

const BLOCKED_RULES = [
  {
    label: "reestruturação",
    pattern:
      /\b(?:nova|ampla)\s+reestruturação\b|\breestruturação\s+arquitetural\b|\breestrutur(ar|ação)\b(?!\s+(?:para\s+)?(?:o|a|os|as)?\s*(?:html|conte[uú]do|markdown|landing|jsx|tsx|seo|copy)\b)(?=[\s\S]{0,120}?\b(?:projeto|código|código.?base|codebase|aplica[cç][aã]o|sistema|arquitetura|pastas|diret[oó]rios|m[oó]dulos|mono.?repo|estrutura(?:\s+de\s+)?pastas)\b)/i,
  },
  {
    label: "nova arquitetura",
    pattern: /nova arquitetura/i,
  },
  {
    label: "migração de stack",
    pattern: /migrar para/i,
  },
  {
    label: "troca de stack",
    pattern: /trocar stack/i,
  },
  {
    label: "nova dependência",
    pattern: /adicionar depend[eê]ncia/i,
  },
  {
    label: "instalação de pacote",
    pattern: /instalar pacote/i,
  },
  {
    label: "refatoração total",
    pattern: /refatorar tudo/i,
  },
  {
    label: "reescrita",
    pattern: /reescrever/i,
  },
];

const NEGATION_PATTERNS = [
  /\bnão\b/i,
  /\bnao\b/i,
  /\bsem\b/i,
  /\bevitar\b/i,
  /\bnunca\b/i,
  /\bproibido\b/i,
  /\bnão deve\b/i,
  /\bnão será\b/i,
  /\bnão propor\b/i,
  /\bnão criar\b/i,
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

const SECTIONS_EXCLUDED_FROM_BLOCKED_RULES = ["Riscos", "Critério de parada"];

function escapeRegexFragment(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Remove headings + body dessas seções só para aplicar BLOCKED_RULES —
 * descrevem risco/gatilho hipotético, não proposta efetiva.
 */
function markdownForBlockedRuleScan(markdown) {
  let out = markdown;
  for (const prefix of SECTIONS_EXCLUDED_FROM_BLOCKED_RULES) {
    const esc = escapeRegexFragment(prefix);
    const re = new RegExp(
      `(^|\\r?\\n)##\\s*${esc}\\b[^\\r\\n]*\\r?\\n([\\s\\S]*?)(?=\\r?\\n##\\s|$)`,
      "gi"
    );
    out = out.replace(re, "$1");
  }
  return out;
}

function getLineContext(content, matchIndex) {
  const before = content.lastIndexOf("\n", matchIndex);
  const after = content.indexOf("\n", matchIndex);

  const start = before === -1 ? 0 : before + 1;
  const end = after === -1 ? content.length : after;

  return content.slice(start, end).trim();
}

function isNegatedContext(line) {
  return NEGATION_PATTERNS.some((pattern) => pattern.test(line));
}

/** Linhas que descrevem condição/risco (“se X então Y”), não adoção direta da proibição. */
function isRiskOrConditionalLine(line) {
  if (/^\s*-\s*(?:Se|Caso|Quando)\b/i.test(line)) return true;
  if (/^\s*-\s*[Aa]\s+.+\bexigir\b/i.test(line)) return true;

  const exigeCriacao =
    /\bexigir\s+(?:a\s+)?(?:criação|implementação|introdução|adição)/i.test(
      line
    );

  const listaHipotetica =
    /\bou\b/i.test(line) ||
    /\b(?:nova\s+arquitetura|novas?\s+dependências)\b/i.test(line);

  if (exigeCriacao && listaHipotetica) {
    return true;
  }

  return false;
}

function findBlockedMentions(content) {
  const violations = [];

  for (const rule of BLOCKED_RULES) {
    const regex = new RegExp(rule.pattern.source, rule.pattern.flags);

    let match;
    while ((match = regex.exec(content)) !== null) {
      const line = getLineContext(content, match.index);

      if (isNegatedContext(line)) {
        continue;
      }

      if (isRiskOrConditionalLine(line)) {
        continue;
      }

      violations.push(
        `Possível violação arquitetural detectada (${rule.label}): "${line}"`
      );

      if (!regex.global) break;
    }
  }

  return violations;
}

function validateArchitectOutput(content) {
  const violations = [];

  violations.push(
    ...findBlockedMentions(markdownForBlockedRuleScan(content))
  );

  for (const section of REQUIRED_SECTIONS) {
    if (!content.includes(section)) {
      violations.push(`Architect output precisa conter seção: ${section}`);
    }
  }

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