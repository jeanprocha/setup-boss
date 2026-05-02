const fs = require("fs");
const path = require("path");
require("dotenv").config();

const OpenAI = require("openai");
const { loadAgent } = require("../core/agent-metadata");

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const ROOT_DIR = path.resolve(__dirname, "..");

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

  const prompt = `${agent}

## TASK
${task}

## REVIEW STRUCTURED
${JSON.stringify(review, null, 2)}

## REVIEW EXPLANATION (HUMAN)
${reviewMd}

---

Gere o documento em Markdown seguindo o formato obrigatório do agente.
As instruções serão lidas automaticamente pelo Executor na próxima rodada (sem intervenção humana).
`;

  const response = await client.responses.create({
    model: process.env.OPENAI_MODEL || "gpt-5.5",
    input: prompt,
  });

  const generated = String(response.output_text || "").trim();

  fs.writeFileSync(
    path.join(outputDir, "correction-instructions.md"),
    generated,
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

  console.log("✅ correction-instructions.md gerado");
}

main().catch((err) => {
  console.error("❌ Erro no correction:", err.message || err);
  process.exit(1);
});
