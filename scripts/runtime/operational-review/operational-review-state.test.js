"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");
const {
  buildOperationalReviewState,
  writeOperationalReviewState,
  loadOperationalReviewState,
  validateOperationalReviewState,
} = require("./operational-review-state");

describe("operational-review-state", () => {
  it("valida e persiste estado confirmado", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sb-review-"));
    const doc = buildOperationalReviewState({
      status: "confirmed",
      operatorNotes: "OK",
    });
    writeOperationalReviewState(dir, doc);
    const loaded = loadOperationalReviewState(dir);
    assert.equal(loaded.ok, true);
    assert.equal(loaded.doc.status, "confirmed");
    assert.equal(validateOperationalReviewState(loaded.doc).ok, true);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
