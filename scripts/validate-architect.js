const fs = require("fs");
const path = require("path");
const { resolveOutputDir } = require("../core/run-resolver");
const { appendProblemHistoryEntry } = require("../core/problem-history");
const { extractSectionBodyAtMarkdownH2 } = require("./shared-utils");

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
 * Extrai o objeto JSON de decisão do architect (primeiro bloco ```json ... ``` ou objeto iniciando em {).
 */
function extractArchitectDecisionJson(content) {
  const text = String(content || "");
  const trimmed = text.trimStart();

  const fenceMatch = trimmed.match(/^```(?:json)?\s*\r?\n([\s\S]*?)\r?\n```/i);
  if (fenceMatch) {
    try {
      const parsed = JSON.parse(fenceMatch[1].trim());
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return { ok: true, decision: parsed };
      }
      return { ok: false, reason: "JSON inicial não é um objeto." };
    } catch (err) {
      const detail = err && err.message ? err.message : String(err);
      return { ok: false, reason: `JSON inicial ilegível: ${detail}` };
    }
  }

  const brace = trimmed.indexOf("{");
  if (brace === -1) {
    return { ok: false, reason: "Bloco JSON inicial ausente." };
  }

  let depth = 0;
  for (let i = brace; i < trimmed.length; i += 1) {
    const c = trimmed[i];
    if (c === "{") depth += 1;
    else if (c === "}") {
      depth -= 1;
      if (depth === 0) {
        const slice = trimmed.slice(brace, i + 1);
        try {
          const parsed = JSON.parse(slice);
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            return { ok: true, decision: parsed };
          }
          return { ok: false, reason: "JSON inicial não é um objeto." };
        } catch (err) {
          const detail = err && err.message ? err.message : String(err);
          return { ok: false, reason: `JSON inicial ilegível: ${detail}` };
        }
      }
    }
  }

  return { ok: false, reason: "Bloco JSON inicial incompleto ou ausente." };
}

/**
 * Monta mensagem operacional quando task_valid === false (não é erro de sintaxe do runner).
 */
function buildInvalidTaskOperationalMessage(decision) {
  const lines = [
    "Task inválida para execução automática.",
    "",
    "Architect marcou task_valid=false:",
  ];

  const risks = Array.isArray(decision.risks) ? decision.risks : [];
  const missing = Array.isArray(decision.missing_definitions)
    ? decision.missing_definitions
    : [];
  const summary =
    decision.summary != null && String(decision.summary).trim()
      ? String(decision.summary).trim()
      : null;

  if (risks.length === 0 && missing.length === 0 && !summary) {
    lines.push("- (sem detalhes adicionais no JSON do architect)");
  } else {
    for (const r of risks) {
      lines.push(`- ${String(r)}`);
    }
    for (const m of missing) {
      lines.push(`- Missing definition: ${String(m)}`);
    }
    if (summary) {
      lines.push(`- Resumo: ${summary}`);
    }
  }

  return lines.join("\n");
}

function evaluateTaskValidGate(decision) {
  if (!("task_valid" in decision)) {
    return {
      blocked: true,
      invalidTask: false,
      violations: [
        "Campo obrigatório `task_valid` ausente no JSON inicial do architect.",
      ],
      message: null,
      decisionSnapshot: null,
    };
  }

  const tv = decision.task_valid;

  if (tv === true) {
    return {
      blocked: false,
      invalidTask: false,
      violations: [],
      message: null,
      decisionSnapshot: {
        task_valid: true,
        risks: Array.isArray(decision.risks) ? decision.risks : [],
        missing_definitions: Array.isArray(decision.missing_definitions)
          ? decision.missing_definitions
          : [],
        summary:
          decision.summary != null ? String(decision.summary).trim() : "",
      },
    };
  }

  if (tv === false) {
    const message = buildInvalidTaskOperationalMessage(decision);
    return {
      blocked: true,
      invalidTask: true,
      violations: [message],
      message,
      decisionSnapshot: {
        task_valid: false,
        risks: Array.isArray(decision.risks) ? decision.risks : [],
        missing_definitions: Array.isArray(decision.missing_definitions)
          ? decision.missing_definitions
          : [],
        summary:
          decision.summary != null ? String(decision.summary).trim() : "",
      },
    };
  }

  return {
    blocked: true,
    invalidTask: false,
    violations: [
      `Campo task_valid inválido (esperado boolean true/false, recebido: ${JSON.stringify(tv)}).`,
    ],
    message: null,
    decisionSnapshot: null,
  };
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

  const extracted = extractArchitectDecisionJson(content);

  if (!extracted.ok) {
    console.log("[VALIDATE_ARCHITECT] end");
    return {
      violations: [
        `Task / architect output ilegível (${extracted.reason}). Corrija o JSON inicial (inclua task_valid).`,
      ],
      invalid_task: false,
      architect_decision: null,
    };
  }

  const gate = evaluateTaskValidGate(extracted.decision);

  if (gate.invalidTask) {
    console.log("[VALIDATE_ARCHITECT] end");
    return {
      violations: gate.violations,
      invalid_task: true,
      architect_decision: gate.decisionSnapshot,
    };
  }

  if (gate.blocked) {
    console.log("[VALIDATE_ARCHITECT] end");
    return {
      violations: gate.violations,
      invalid_task: false,
      architect_decision: gate.decisionSnapshot,
    };
  }

  const violations = [];

  for (const section of REQUIRED_SECTIONS) {
    if (!content.includes(section)) {
      violations.push(`Seção obrigatória ausente: ${section}`);
    }
  }

  const filesSection = extractSectionBodyAtMarkdownH2(content, "Arquivos prováveis");

  if (!filesSection.trim()) {
    violations.push("Seção Arquivos prováveis está vazia.");
  } else {
    violations.push(...collectArchitectConcreteFileViolations(filesSection));
  }

  console.log("[VALIDATE_ARCHITECT] end");

  return {
    violations,
    invalid_task: false,
    architect_decision: gate.decisionSnapshot,
  };
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
  const validated = validateArchitectOutput(content);
  const violations = validated.violations;

  const result = {
    status: violations.length === 0 ? "approved" : "blocked",
    violations,
    checked_at: new Date().toISOString(),
    invalid_task: Boolean(validated.invalid_task),
    task_valid:
      validated.architect_decision &&
      typeof validated.architect_decision.task_valid === "boolean"
        ? validated.architect_decision.task_valid
        : null,
    architect_decision: validated.architect_decision || null,
  };

  fs.writeFileSync(validationPath, JSON.stringify(result, null, 2), "utf-8");

  if (violations.length > 0) {
    if (result.invalid_task) {
      try {
        appendProblemHistoryEntry({
          outputDir,
          step: "validate_architect",
          status: "blocked",
          severity: "medium",
          type: "invalid_task",
          title: "Task inválida para execução automática (task_valid=false)",
          summary: String(violations[0] || "").slice(0, 1200),
          cause: "task_valid_false",
          evidence: [String(violations[0] || "").slice(0, 2000)].slice(0, 25),
          files: [],
          extra: {
            invalid_task: true,
            architect_decision: result.architect_decision || null,
          },
        });
      } catch (_) {
        /* não bloqueia o exit code do validador */
      }

      console.log("\n" + violations[0]);
      console.log(
        "\nEscopo inconsistente, definições em falta ou impossível validar/executar com segurança. Corrija a task antes de prosseguir."
      );
    } else {
      console.log("❌ Architect bloqueado por enforcement:");
      for (const violation of violations) {
        console.log(`- ${violation}`);
      }
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
  extractArchitectDecisionJson,
  evaluateTaskValidGate,
};
