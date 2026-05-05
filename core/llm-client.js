const OpenAI = require("openai");

function normalizeStep(step) {
  return String(step || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, "_");
}

function getModelForStep(step) {
  const key = `${normalizeStep(step)}_MODEL`;

  return (
    process.env[key] ||
    process.env.OPENAI_MODEL ||
    "gpt-5.4-mini"
  );
}

function createLLMClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY não encontrada no .env");
  }

  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
}

module.exports = {
  createLLMClient,
  getModelForStep,
};