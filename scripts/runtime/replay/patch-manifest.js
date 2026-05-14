/**
 * Formaliza patch_manifest.json — ligação determinística a executor-changes.json.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const {
  normalizeRelativePath,
  assertSafeProjectPath,
} = require("../../shared-utils");

const MANIFEST_NAME = "patch-manifest.json";
const SCHEMA_VERSION = 1;

function sha256Utf8(content) {
  return crypto
    .createHash("sha256")
    .update(String(content ?? ""), "utf8")
    .digest("hex");
}

function sha256File(filePath) {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function uniquePathsOrdered(applied) {
  const seen = new Set();
  const order = [];
  if (!Array.isArray(applied)) return order;
  for (const item of applied) {
    const p = normalizeRelativePath(item?.path || "");
    if (!p || seen.has(p)) continue;
    seen.add(p);
    order.push(p);
  }
  return order;
}

/**
 * Captura baseline no disco (dry-run: igual ao estado pré-patch físico).
 */
function buildPatchManifest({ outputDir, projectRoot, runId, appliedChanges }) {
  const changesPath = path.join(outputDir, "executor-changes.json");
  if (!fs.existsSync(changesPath)) {
    throw new Error("patch_manifest: executor-changes.json ausente.");
  }

  const changesBuf = fs.readFileSync(changesPath);
  const executor_changes_sha256 = crypto
    .createHash("sha256")
    .update(changesBuf)
    .digest("hex");

  const applied = Array.isArray(appliedChanges)
    ? appliedChanges
    : JSON.parse(changesBuf.toString("utf-8"));

  const files = {};
  for (const rel of uniquePathsOrdered(applied)) {
    const safe = assertSafeProjectPath(projectRoot, rel);
    if (!fs.existsSync(safe.absolutePath)) {
      throw new Error(
        `patch_manifest: ficheiro baseline ausente no projeto: ${rel}`,
      );
    }
    const raw = fs.readFileSync(safe.absolutePath, "utf-8");
    files[rel] = {
      pre_apply_sha256: sha256Utf8(raw),
      pre_apply_byte_length: Buffer.byteLength(raw, "utf8"),
    };
  }

  const operations = Array.isArray(applied)
    ? applied.map((ch, index) => ({
        index,
        path: normalizeRelativePath(ch.path),
        operation: ch.operation || "patch",
        search_sha256: sha256Utf8(ch.search),
        replace_sha256: sha256Utf8(ch.replace),
        reason: ch.reason ? String(ch.reason).slice(0, 500) : "",
      }))
    : [];

  const overlayPath = path.join(outputDir, "virtual-project-overlay.json");
  let virtual_overlay_sha256 = null;
  if (fs.existsSync(overlayPath)) {
    virtual_overlay_sha256 = sha256File(overlayPath);
  }

  return {
    schema_version: SCHEMA_VERSION,
    generated_at: new Date().toISOString(),
    run_id: runId,
    project_root: path.resolve(projectRoot),
    artifacts: {
      executor_changes: "executor-changes.json",
      executor_changes_sha256,
      patch_preview: "patch-preview.md",
      virtual_overlay: fs.existsSync(overlayPath)
        ? "virtual-project-overlay.json"
        : null,
      virtual_overlay_sha256,
    },
    validation: {
      deterministic_apply_only: true,
      notes:
        "Apply-later deve usar apenas executor-changes.json; operações não devem ser regeneradas.",
    },
    files,
    operations,
    metadata: {
      patch_operations: operations.length,
      files_touched: Object.keys(files).length,
    },
  };
}

function writePatchManifestToOutput(outputDir, manifest) {
  const p = path.join(outputDir, MANIFEST_NAME);
  fs.writeFileSync(p, JSON.stringify(manifest, null, 2), "utf-8");
}

function readPatchManifest(outputDir) {
  const p = path.join(outputDir, MANIFEST_NAME);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch (_) {
    return null;
  }
}

module.exports = {
  MANIFEST_NAME,
  SCHEMA_VERSION,
  buildPatchManifest,
  writePatchManifestToOutput,
  readPatchManifest,
  sha256Utf8,
};
