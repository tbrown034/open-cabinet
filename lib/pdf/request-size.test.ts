import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { assertClaudeRequestSize, CLAUDE_MAX_REQUEST_BYTES, PdfRequestTooLargeError } from "./request-size";

const { stream } = vi.hoisted(() => ({
  stream: vi.fn((request: unknown) => {
    void request;
    return {
      finalMessage: async () => ({
        stop_reason: "end_turn",
        content: [{ type: "text", text: "[]" }],
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
    };
  }),
}));
vi.mock("@anthropic-ai/sdk", () => ({ default: class { messages = { stream }; } }));
const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

function pdfFile(bytes: Buffer): string {
  const dir = mkdtempSync(path.join(tmpdir(), "oc-request-size-"));
  dirs.push(dir);
  const file = path.join(dir, "filing.pdf");
  writeFileSync(file, bytes);
  return file;
}

describe("Claude PDF request size", () => {
  it("measures UTF-8 bytes including the JSON envelope", () => {
    const fitting = "é".repeat((CLAUDE_MAX_REQUEST_BYTES - 2) / 2);
    expect(() => assertClaudeRequestSize(fitting, "example.pdf")).not.toThrow();
    expect(() => assertClaudeRequestSize(fitting + "é", "example.pdf")).toThrow(PdfRequestTooLargeError);
  });

  it("rejects a PDF below 32 MB when its base64 request exceeds the limit, without contacting Claude", async () => {
    const { parsePdf } = await import("../../scripts/parse-pdf");
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    const file = pdfFile(Buffer.alloc(24_000_000));
    await expect(parsePdf(file)).rejects.toThrow("after encoding");
    expect(stream).not.toHaveBeenCalled();
  });

  it("keeps the document before the prompt and sends a fitting request normally", async () => {
    const { parsePdf } = await import("../../scripts/parse-pdf");
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    const file = pdfFile(Buffer.from("%PDF fixture; provider is mocked"));
    await expect(parsePdf(file)).resolves.toMatchObject({ transactions: [] });
    expect(stream).toHaveBeenCalledOnce();
    const request = stream.mock.calls[0][0];
    expect(request).toMatchObject({ messages: [{ content: [{ type: "document" }, { type: "text" }] }] });
  });
});
