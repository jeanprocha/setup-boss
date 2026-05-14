const test = require("node:test");
const assert = require("node:assert/strict");
const { resolveInspectSelection } = require("./semantic-inspect");

test("resolveInspectSelection — latest e índice", () => {
  const entries = [
    { run_id: "new", output_dir: "/o/new" },
    { run_id: "old", output_dir: "/o/old" },
  ];
  assert.equal(resolveInspectSelection(entries, "latest").entry.run_id, "new");
  assert.equal(resolveInspectSelection(entries, "1").entry.run_id, "old");
});
