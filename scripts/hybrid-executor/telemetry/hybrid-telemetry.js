/**
 * Eventos de telemetria compactos para hybrid-shadow-runtime.json (Fase 4.9.1).
 */

function shadowRunStart({ outputDir, projectRoot, allowedFileCount }) {
  return {
    event: "hybrid.shadow.run_start",
    ts: new Date().toISOString(),
    output_dir: outputDir,
    project_root: projectRoot,
    allowed_file_count: allowedFileCount,
  };
}

function shadowRunFinish({ durationMs, parsedOk, parsedFail, skippedUnsupported, skippedLanguageFlag }) {
  return {
    event: "hybrid.shadow.run_finish",
    ts: new Date().toISOString(),
    duration_ms: durationMs,
    parsed_ok: parsedOk,
    parsed_fail: parsedFail,
    skipped_unsupported_extension: skippedUnsupported,
    skipped_language_flag: skippedLanguageFlag,
  };
}

function fileEvent({ relativePath, phase, language, ok, detail }) {
  return {
    event: "hybrid.shadow.file",
    ts: new Date().toISOString(),
    path: relativePath,
    phase,
    language: language || null,
    ok,
    detail: detail || null,
  };
}

module.exports = {
  shadowRunStart,
  shadowRunFinish,
  fileEvent,
};
