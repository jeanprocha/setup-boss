"use strict";

const path = require("path");
const fs = require("fs");
const { ROOT_DIR } = require("./run-resolver");

const ERROR_PROJECT_ROOT_UNRESOLVED =
  "Não foi possível resolver a pasta local do projeto-alvo.\n\n" +
  "A validação docs/.IA precisa ser feita no repositório do projeto baixado do Bitbucket, não na pasta do Setup-Boss.";

/**
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function pathsEqual(a, b) {
  const na = path.normalize(path.resolve(String(a || "")));
  const nb = path.normalize(path.resolve(String(b || "")));
  if (process.platform === "win32") {
    return na.toLowerCase() === nb.toLowerCase();
  }
  return na === nb;
}

/**
 * Raiz do repositório Setup-Boss (runtime).
 * @returns {string}
 */
function resolveSetupBossRepoRoot() {
  return path.resolve(ROOT_DIR);
}

/**
 * Resolve e valida o `projectRoot` do projeto-alvo (checkout Bitbucket / workspace).
 *
 * @param {string} projectRoot
 * @param {{
 *   setupBossRoot?: string,
 *   forbidSetupBossRoot?: boolean,
 * }} [options]
 * @returns {{
 *   ok: true,
 *   targetProjectRoot: string,
 *   setupBossRoot: string,
 *   expectedKnowledgePath: string,
 * } | {
 *   ok: false,
 *   code: "PROJECT_ROOT_UNRESOLVED",
 *   title: string,
 *   message: string,
 *   description: string,
 * }}
 */
function resolveTargetProjectRoot(projectRoot, options = {}) {
  const setupBossRoot = path.resolve(
    options.setupBossRoot != null && String(options.setupBossRoot).trim()
      ? String(options.setupBossRoot).trim()
      : resolveSetupBossRepoRoot(),
  );

  const raw = projectRoot != null ? String(projectRoot).trim() : "";
  if (!raw) {
    return {
      ok: false,
      code: "PROJECT_ROOT_UNRESOLVED",
      title: "Projeto-alvo não resolvido",
      message: "Projeto-alvo não resolvido",
      description: ERROR_PROJECT_ROOT_UNRESOLVED,
    };
  }

  const targetProjectRoot = path.resolve(raw);

  try {
    if (!fs.existsSync(targetProjectRoot) || !fs.statSync(targetProjectRoot).isDirectory()) {
      return {
        ok: false,
        code: "PROJECT_ROOT_UNRESOLVED",
        title: "Projeto-alvo não resolvido",
        message: "Projeto-alvo não resolvido",
        description: `${ERROR_PROJECT_ROOT_UNRESOLVED}\n\nCaminho inválido ou inexistente: ${targetProjectRoot}`,
      };
    }
  } catch {
    return {
      ok: false,
      code: "PROJECT_ROOT_UNRESOLVED",
      title: "Projeto-alvo não resolvido",
      message: "Projeto-alvo não resolvido",
      description: ERROR_PROJECT_ROOT_UNRESOLVED,
    };
  }

  const forbidSetupBossRoot = options.forbidSetupBossRoot !== false;
  if (forbidSetupBossRoot && pathsEqual(targetProjectRoot, setupBossRoot)) {
    return {
      ok: false,
      code: "PROJECT_ROOT_UNRESOLVED",
      title: "Projeto-alvo não resolvido",
      message: "Projeto-alvo não resolvido",
      description: ERROR_PROJECT_ROOT_UNRESOLVED,
    };
  }

  return {
    ok: true,
    targetProjectRoot,
    setupBossRoot,
    expectedKnowledgePath: path.join(targetProjectRoot, "docs", ".IA"),
  };
}

module.exports = {
  ERROR_PROJECT_ROOT_UNRESOLVED,
  pathsEqual,
  resolveSetupBossRepoRoot,
  resolveTargetProjectRoot,
};
