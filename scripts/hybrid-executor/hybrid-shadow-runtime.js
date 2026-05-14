const fs = require("fs");
const path = require("path");

const { assertSafeProjectPath, normalizeRelativePath } = require("../shared-utils");
const {
  isHybridShadowReadonlyActive,
  isLanguageEnabledForStructural,
  isHybridExecutorEnabled,
  isStructuralAstReadonlyEnabled,
  getStructuralLanguagesEnabled,
} = require("./feature-flags");
const { detectStructuralLanguage } = require("./languages/language-detector");
const { parseJavaScript } = require("./languages/javascript/js-parser");
const { validateJavaScriptAst } = require("./languages/javascript/js-ast-validator");
const { parseTypeScript } = require("./languages/typescript/ts-parser");
const { validateTypeScriptAst } = require("./languages/typescript/ts-ast-validator");
const { buildStructuralAstSummary, buildParserErrorsManifest } = require("./diagnostics/hybrid-diagnostics");
const { shadowRunStart, shadowRunFinish, fileEvent } = require("./telemetry/hybrid-telemetry");
function fileHeadLooksBinary(absolutePath) {
  let fd;
  try {
    fd = fs.openSync(absolutePath, "r");
    const buf = Buffer.allocUnsafe(512);
    const n = fs.readSync(fd, buf, 0, 512, 0);
    for (let j = 0; j < n; j++) {
      if (buf[j] === 0) return true;
    }
    return false;
  } catch (_) {
    return false;
  } finally {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd);
      } catch (_) {}
    }
  }
}

/**
 * @param {object} opts
 * @param {string} opts.outputDir
 * @param {*} opts.data
 * @param {{ writeJson?: Function }|null} opts.outputFs
 */
function safeWriteJson(opts) {
  const full = path.join(opts.outputDir, opts.name);
  try {
    if (opts.outputFs && typeof opts.outputFs.writeJson === "function") {
      opts.outputFs.writeJson(full, opts.data);
    } else {
      fs.writeFileSync(full, JSON.stringify(opts.data, null, 2), "utf-8");
    }
  } catch (_) {}
}

/**
 * Analisa um ficheiro permitido (read-only). Nunca lança.
 * @returns {{ summaryRow: object|null, parserError: object|null, telemetry: object[] }}
 */
function analyzeOneAllowedFile(projectRoot, relativePath) {
  /** @type {object[]} */
  const telemetry = [];
  const normalized = normalizeRelativePath(relativePath);

  const detected = detectStructuralLanguage(normalized);

  if (!detected) {
    telemetry.push(
      fileEvent({
        relativePath: normalized,
        phase: "detect",
        language: null,
        ok: true,
        detail: "unsupported_extension",
      }),
    );
    return {
      summaryRow: null,
      parserError: null,
      telemetry,
      skippedUnsupported: { path: normalized, reason: "unsupported_extension" },
      skippedLanguageFlag: null,
    };
  }

  if (!isLanguageEnabledForStructural(detected)) {
    telemetry.push(
      fileEvent({
        relativePath: normalized,
        phase: "flag",
        language: detected,
        ok: true,
        detail: "language_disabled_in_env",
      }),
    );
    return {
      summaryRow: null,
      parserError: null,
      telemetry,
      skippedUnsupported: null,
      skippedLanguageFlag: { path: normalized, reason: "language_disabled_in_env", detected_language: detected },
    };
  }

  let safe;
  try {
    safe = assertSafeProjectPath(projectRoot, normalized);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    telemetry.push(fileEvent({ relativePath: normalized, phase: "path", language: detected, ok: false, detail: msg }));
    return {
      summaryRow: {
        path: normalized,
        detected_language: detected,
        language_flag_enabled: true,
        skipped: true,
        skip_reason: "unsafe_path",
        parse_ok: false,
        validate_ok: false,
        program_body_count: null,
        source_chars: null,
      },
      parserError: { path: normalized, language: detected, phase: "path", message: msg },
      telemetry,
      skippedUnsupported: null,
      skippedLanguageFlag: null,
    };
  }

  if (!fs.existsSync(safe.absolutePath)) {
    telemetry.push(
      fileEvent({ relativePath: normalized, phase: "read", language: detected, ok: false, detail: "missing_file" }),
    );
    return {
      summaryRow: {
        path: normalized,
        detected_language: detected,
        language_flag_enabled: true,
        skipped: true,
        skip_reason: "missing_file",
        parse_ok: false,
        validate_ok: false,
        program_body_count: null,
        source_chars: null,
      },
      parserError: null,
      telemetry,
      skippedUnsupported: null,
      skippedLanguageFlag: null,
    };
  }

  if (fileHeadLooksBinary(safe.absolutePath)) {
    telemetry.push(
      fileEvent({ relativePath: normalized, phase: "read", language: detected, ok: false, detail: "binary_skipped" }),
    );
    return {
      summaryRow: {
        path: normalized,
        detected_language: detected,
        language_flag_enabled: true,
        skipped: true,
        skip_reason: "binary_head",
        parse_ok: false,
        validate_ok: false,
        program_body_count: null,
        source_chars: null,
      },
      parserError: null,
      telemetry,
      skippedUnsupported: null,
      skippedLanguageFlag: null,
    };
  }

  let source = "";
  try {
    source = fs.readFileSync(safe.absolutePath, "utf-8");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    telemetry.push(fileEvent({ relativePath: normalized, phase: "read", language: detected, ok: false, detail: msg }));
    return {
      summaryRow: {
        path: normalized,
        detected_language: detected,
        language_flag_enabled: true,
        skipped: true,
        skip_reason: "read_error",
        parse_ok: false,
        validate_ok: false,
        program_body_count: null,
        source_chars: null,
      },
      parserError: { path: normalized, language: detected, phase: "read", message: msg },
      telemetry,
      skippedUnsupported: null,
      skippedLanguageFlag: null,
    };
  }

  const ext = path.extname(normalized).toLowerCase();

  let ast = null;
  let parseErr = null;

  if (detected === "javascript") {
    const r = parseJavaScript(source, { isJsx: ext === ".jsx" });
    ast = r.ast;
    parseErr = r.error;
  } else {
    const r = parseTypeScript(source, normalized);
    ast = r.ast;
    parseErr = r.error;
  }

  if (parseErr) {
    telemetry.push(
      fileEvent({
        relativePath: normalized,
        phase: "parse",
        language: detected,
        ok: false,
        detail: parseErr.message,
      }),
    );
    return {
      summaryRow: {
        path: normalized,
        detected_language: detected,
        language_flag_enabled: true,
        skipped: false,
        skip_reason: null,
        parse_ok: false,
        validate_ok: false,
        program_body_count: null,
        source_chars: source.length,
      },
      parserError: {
        path: normalized,
        language: detected,
        phase: "parse",
        message: parseErr.message,
      },
      telemetry,
      skippedUnsupported: null,
      skippedLanguageFlag: null,
    };
  }

  const validator = detected === "typescript" ? validateTypeScriptAst : validateJavaScriptAst;
  const v = validator(ast);

  if (!v.ok) {
    telemetry.push(
      fileEvent({
        relativePath: normalized,
        phase: "validate",
        language: detected,
        ok: false,
        detail: v.reason || "validation_failed",
      }),
    );
    return {
      summaryRow: {
        path: normalized,
        detected_language: detected,
        language_flag_enabled: true,
        skipped: false,
        skip_reason: null,
        parse_ok: true,
        validate_ok: false,
        program_body_count: null,
        source_chars: source.length,
        validation_reason: v.reason || null,
      },
      parserError: {
        path: normalized,
        language: detected,
        phase: "validate",
        message: v.reason || "validation_failed",
      },
      telemetry,
      skippedUnsupported: null,
      skippedLanguageFlag: null,
    };
  }

  const bodyCount = ast && ast.program && Array.isArray(ast.program.body) ? ast.program.body.length : 0;

  telemetry.push(
    fileEvent({
      relativePath: normalized,
      phase: "validate",
      language: detected,
      ok: true,
      detail: `body=${bodyCount}`,
    }),
  );

  return {
    summaryRow: {
      path: normalized,
      detected_language: detected,
      language_flag_enabled: true,
      skipped: false,
      skip_reason: null,
      parse_ok: true,
      validate_ok: true,
      program_body_count: bodyCount,
      source_chars: source.length,
    },
    parserError: null,
    telemetry,
    skippedUnsupported: null,
    skippedLanguageFlag: null,
  };
}

/**
 * @param {{
 *   outputDir: string,
 *   projectRoot: string,
 *   allowedFiles: string[],
 *   outputFs?: { writeJson: Function }|null,
 *   force?: boolean,
 * }} args
 */
function runHybridShadowReadonly(args) {
  const { outputDir, projectRoot, allowedFiles } = args;
  const outputFs = args.outputFs || null;

  if (!args.force && !isHybridShadowReadonlyActive()) {
    return { ran: false, reason: "flags_off" };
  }

  const t0 = Date.now();
  const startedAt = new Date().toISOString();

  /** @type {object[]} */
  const allTelemetry = [];

  /** @typedef {{ path: string, reason: string, detected_language?: string|null }} Skipped */
  /** @type {Skipped[]} */
  const skippedUnsupported = [];
  /** @type {Skipped[]} */
  const skippedLanguageFlag = [];
  /** @type {object[]} */
  const fileRows = [];
  /** @type {object[]} */
  const parserErrors = [];

  allTelemetry.push(
    shadowRunStart({
      outputDir,
      projectRoot,
      allowedFileCount: Array.isArray(allowedFiles) ? allowedFiles.length : 0,
    }),
  );

  let parsedOk = 0;
  let parsedFail = 0;

  const list = Array.isArray(allowedFiles) ? allowedFiles : [];
  for (const raw of list) {
    try {
      const one = analyzeOneAllowedFile(projectRoot, raw);
      for (const ev of one.telemetry) allTelemetry.push(ev);

      if (one.skippedUnsupported) {
        skippedUnsupported.push(one.skippedUnsupported);
      } else if (one.skippedLanguageFlag) {
        skippedLanguageFlag.push(one.skippedLanguageFlag);
      } else if (one.summaryRow) {
        fileRows.push(one.summaryRow);
        if (one.summaryRow.parse_ok && one.summaryRow.validate_ok) parsedOk += 1;
        else if (!one.summaryRow.skipped) parsedFail += 1;
      }

      if (one.parserError) parserErrors.push(one.parserError);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      parserErrors.push({
        path: normalizeRelativePath(raw),
        language: null,
        phase: "unexpected",
        message: msg,
      });
    }
  }

  const durationMs = Date.now() - t0;
  const finishedAt = new Date().toISOString();

  allTelemetry.push(
    shadowRunFinish({
      durationMs,
      parsedOk,
      parsedFail,
      skippedUnsupported: skippedUnsupported.length,
      skippedLanguageFlag: skippedLanguageFlag.length,
    }),
  );

  const langs = [...getStructuralLanguagesEnabled()];

  const runtimePayload = {
    schema_version: 1,
    phase: "4.9.1",
    hybrid_executor_enabled: isHybridExecutorEnabled(),
    structural_ast_readonly_enabled: isStructuralAstReadonlyEnabled(),
    structural_languages_enabled: langs,
    started_at: startedAt,
    finished_at: finishedAt,
    duration_ms: durationMs,
    telemetry_events: allTelemetry,
    counts: {
      allowed_files: list.length,
      summary_rows: fileRows.length,
      parser_errors: parserErrors.length,
      skipped_unsupported_extension: skippedUnsupported.length,
      skipped_language_disabled: skippedLanguageFlag.length,
      parse_validate_ok: parsedOk,
      parse_or_validate_failed: parsedFail,
    },
  };

  safeWriteJson({ outputDir, name: "hybrid-shadow-runtime.json", data: runtimePayload, outputFs });
  safeWriteJson({
    outputDir,
    name: "structural-ast-summary.json",
    data: buildStructuralAstSummary({
      fileRows,
      skippedUnsupported,
      skippedLanguageFlag,
    }),
    outputFs,
  });
  safeWriteJson({
    outputDir,
    name: "structural-parser-errors.json",
    data: buildParserErrorsManifest({ errors: parserErrors }),
    outputFs,
  });

  return { ran: true, durationMs };
}

function runHybridShadowReadonlyIfEnabled(args) {
  try {
    return runHybridShadowReadonly({ ...args, force: false });
  } catch (e) {
    return { ran: false, reason: "internal_error", error: e instanceof Error ? e.message : String(e) };
  }
}

module.exports = {
  runHybridShadowReadonly,
  runHybridShadowReadonlyIfEnabled,
  analyzeOneAllowedFile,
};
