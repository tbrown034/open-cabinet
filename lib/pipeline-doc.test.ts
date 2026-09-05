import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import path from "path";

/**
 * research/pipeline.md is the page Trevor rehearses from. It names the
 * stage functions in scripts/ingest-new-filings.ts. If a stage is renamed
 * or removed and the page is not updated, this fails, so the explanation
 * and the code cannot drift apart the way the methodology page once did.
 */
describe("research/pipeline.md matches the code", () => {
  const doc = readFileSync(path.join(process.cwd(), "research", "pipeline.md"), "utf-8");
  // The stages live in two files: the shared library and the CLI that wires them.
  const ingest =
    readFileSync(path.join(process.cwd(), "scripts", "ingest-new-filings.ts"), "utf-8") +
    readFileSync(path.join(process.cwd(), "lib", "ingest-stages.ts"), "utf-8");

  it("names all seven stages and each exists as a function in the ingest", () => {
    for (const fn of [
      "findNewFilings",
      "fetchFiling",
      "readFiling",
      "checkFiling",
      "mergeRows",
      "validateDataset",
      "handOffForPublish",
    ]) {
      expect(doc, `doc names ${fn}`).toContain(`\`${fn}\``);
      expect(ingest, `code defines ${fn}`).toMatch(new RegExp(`function ${fn}\\(`));
    }
  });

  it("points validate and publish at the files that implement them", () => {
    expect(doc).toContain("scripts/validate.ts");
    expect(doc).toContain(".github/workflows/oge-pipeline.yml");
    expect(readFileSync(path.join(process.cwd(), ".github", "workflows", "oge-pipeline.yml"), "utf-8")).toMatch(
      /create-pull-request/
    );
  });

  it("uses only the three check words", () => {
    // Every stage must classify its checks with the agreed vocabulary.
    for (const word of ["Enforced", "Recorded", "Advisory"]) expect(doc).toContain(word);
    expect(doc).not.toMatch(/\bfoolproof\b/i);
    expect(doc).not.toMatch(/\bguarantee/i);
  });

  it("names the log and validation modules the stages depend on", () => {
    for (const mod of ["lib/filing-validation.ts", "lib/parse-cache.ts", "data/meta/crosscheck-log.json"]) {
      expect(doc).toContain(mod);
    }
  });
});
