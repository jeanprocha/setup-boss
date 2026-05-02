const fs = require("fs");
const path = require("path");
require("dotenv").config();

const OpenAI = require("openai");
const { loadAgent } = require("../core/agent-metadata");

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const ROOT_DIR = path.resolve(__dirname, "..");

const CORRECTION_EXECUTION_PREFIX = `## EXECUTION MODE (OBRIGATÓRIO)

Execute esta task agora.

NÃO explique o prompt.
NÃO descreva o que deveria ser feito.
NÃO responda em modo teórico.

Você deve:

1. aplicar a correção no projeto real
2. validar o resultado
3. retornar evidência objetiva
`;

/** Evita duplicar o bloco se o modelo repetir o mesmo preâmbulo. */
function stripLeadingExecutionModeDuplicate(text) {
  const t = String(text).trim();
  if (!t.startsWith("## EXECUTION MODE (OBRIGATÓRIO)")) {
    return t;
  }

  const separator = "\n---\n";
  const sepIdx = t.indexOf(separator, 10);
  if (sepIdx !== -1) {
    return t.slice(sepIdx + separator.length).trim();
  }

  const endMarker = "3. retornar evidência objetiva";
  const mIdx = t.indexOf(endMarker);
  if (mIdx !== -1) {
    return t.slice(mIdx + endMarker.length).replace(/^\s*[\r\n]+/, "").trim();
  }

  return t;
}

function ensureFile(file, label) {
  if (!fs.existsSync(file)) {
    console.log(`❌ ${label} não encontrado: ${file}`);
    process.exit(1);
  }
}

async function main() {
  const outputArg = process.argv[2];

  if (!outputArg) {
    console.log("Uso: npm run correction <outputName>");
    process.exit(1);
  }

  const outputDir = path.join(ROOT_DIR, "outputs", outputArg);

  ensureFile(outputDir, "Pasta de output");

  const reviewJsonPath = path.join(outputDir, "review-output.json");
  const reviewMdPath = path.join(outputDir, "review-output.md");
  const taskPath = path.join(outputDir, "task.md");

  ensureFile(reviewJsonPath, "review-output.json");
  ensureFile(taskPath, "task.md");

  const review = JSON.parse(fs.readFileSync(reviewJsonPath, "utf-8"));
  const reviewMd = fs.existsSync(reviewMdPath)
    ? fs.readFileSync(reviewMdPath, "utf-8")
    : "";

  if (review.status === "approved") {
    console.log("⚠️ Review já aprovado. Nenhuma correção necessária.");
    process.exit(0);
  }

  if (!review.requires_correction) {
    console.log("❌ Review não aprovou, mas não pediu correção.");
    process.exit(1);
  }

  const task = fs.readFileSync(taskPath, "utf-8");

  const agentPath = path.join(ROOT_DIR, "agents", "correction.md");
  const { content: agent, metadata: agentMeta } = loadAgent(agentPath);

  const prompt = `${CORRECTION_EXECUTION_PREFIX}

---

${agent}

## TASK
${task}

## REVIEW STRUCTURED
${JSON.stringify(review, null, 2)}

## REVIEW EXPLANATION (HUMAN)
${reviewMd}
`;

  const response = await client.responses.create({
    model: process.env.OPENAI_MODEL || "gpt-5.5",
    input: prompt,
  });

  const generated = stripLeadingExecutionModeDuplicate(
    response.output_text || ""
  );

  const correctionMarkdown = `${CORRECTION_EXECUTION_PREFIX.trim()}

---

${generated}
`;

  fs.writeFileSync(
    path.join(outputDir, "correction-prompt.md"),
    correctionMarkdown,
    "utf-8"
  );

  const metadataPath = path.join(outputDir, "metadata.json");

  if (fs.existsSync(metadataPath)) {
    const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf-8"));

    metadata.agents = {
      ...metadata.agents,
      correction: agentMeta,
    };

    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
  }

  console.log("✅ Correction gerado");
}

main().catch((err) => {
  console.error("❌ Erro no correction:", err.message || err);
  process.exit(1);
});