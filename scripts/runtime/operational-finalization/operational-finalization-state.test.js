"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");
const {
  buildOperationalFinalizationState,
  writeOperationalFinalizationState,
  loadOperationalFinalizationState,
  validateOperationalFinalizationState,
} = require("./operational-finalization-state");

describe("operational-finalization-state", () => {
  it("valida e persiste estado finalizado", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sb-final-"));
    const doc = buildOperationalFinalizationState({
      status: "finalized",
      operatorNotes: "Concluído",
    });
    writeOperationalFinalizationState(dir, doc);
    const loaded = loadOperationalFinalizationState(dir);
    assert.equal(loaded.ok, true);
    assert.equal(loaded.doc.status, "finalized");
    assert.equal(validateOperationalFinalizationState(loaded.doc).ok, true);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
