/**
 * Registo de adapters e mapeamento desde inferência 4.1.2 (Fase 4.2).
 */

const json = require("./adapters/json-validator");
const yaml = require("./adapters/yaml-validator");
const eslint = require("./adapters/eslint-validator");
const typescript = require("./adapters/typescript-validator");
const markdown = require("./adapters/markdown-validator");
const gofmt = require("./adapters/gofmt-validator");
const golangci = require("./adapters/golangci-validator");
const phpstan = require("./adapters/phpstan-validator");

const ADAPTERS = {
  json,
  yaml,
  eslint,
  typescript,
  markdown,
  gofmt,
  golangci,
  phpstan,
};

/** @type {Record<string, string>} */
const INFERRED_TO_ADAPTER = {
  eslint: "eslint",
  typescript: "typescript",
  typescript_project_refs: "typescript",
  json_parse: "json",
  yaml_parse: "yaml",
  markdown_lint: "markdown",
  gofmt: "gofmt",
  "golangci-lint": "golangci",
  golangci: "golangci",
  phpstan: "phpstan",
};

function normalizeInferredKey(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

/**
 * @param {string|null|undefined} inferred
 * @returns {string|null}
 */
function mapInferredToAdapterId(inferred) {
  const k = normalizeInferredKey(inferred);
  if (!k) return null;
  if (INFERRED_TO_ADAPTER[k]) return INFERRED_TO_ADAPTER[k];
  const dashed = k.replace(/_/g, "-");
  return INFERRED_TO_ADAPTER[dashed] || null;
}

/**
 * @param {string} adapterId
 */
function getAdapter(adapterId) {
  const id = String(adapterId || "");
  return ADAPTERS[id] || null;
}

/**
 * @param {string} adapterId
 */
function getAdapterMeta(adapterId) {
  const a = getAdapter(adapterId);
  if (!a) return null;
  return {
    stage: a.stage,
    order_tier: a.order_tier,
    id: a.id,
  };
}

module.exports = {
  ADAPTERS,
  mapInferredToAdapterId,
  getAdapter,
  getAdapterMeta,
};
