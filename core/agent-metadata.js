const fs = require("fs");

function parseAgentMetadata(content) {
  const lines = content.split("\n").slice(0, 10);

  const meta = {
    name: null,
    version: null,
    updated: null
  };

  for (const line of lines) {
    if (line.startsWith("# Agent:")) {
      meta.name = line.replace("# Agent:", "").trim();
    }

    if (line.startsWith("# Version:")) {
      meta.version = line.replace("# Version:", "").trim();
    }

    if (line.startsWith("# Updated:")) {
      meta.updated = line.replace("# Updated:", "").trim();
    }
  }

  return meta;
}

function loadAgent(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Agent não encontrado: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, "utf-8");
  const metadata = parseAgentMetadata(content);

  if (!metadata.version) {
    throw new Error(`Agent sem versão definida: ${filePath}`);
  }

  return {
    content,
    metadata
  };
}

module.exports = {
  loadAgent
};