import assert from "node:assert";
import { describe, it } from "node:test";
import { artifactDownloadFilename } from "./artifact-adapters.ts";

describe("artifactDownloadFilename", () => {
  it("não duplica extensão quando o nome já termina com .json", () => {
    assert.equal(
      artifactDownloadFilename("metadata.json", "json"),
      "metadata.json",
    );
  });

  it("adiciona extensão quando o nome não tem sufixo", () => {
    assert.equal(artifactDownloadFilename("metadata", "json"), "metadata.json");
  });

  it("preserva extensão existente mesmo quando difere do viewer", () => {
    assert.equal(
      artifactDownloadFilename("report.pdf", "text"),
      "report.pdf",
    );
  });
});
