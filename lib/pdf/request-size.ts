/** Claude's direct Messages API limit covers the entire JSON request, including
 * base64 data and prompt text, not just the PDF bytes.
 * https://platform.claude.com/docs/en/build-with-claude/pdf-support */
export const CLAUDE_MAX_REQUEST_BYTES = 32_000_000;

export class PdfRequestTooLargeError extends Error {
  constructor(public readonly bytes: number, public readonly pdfPath: string) {
    super(
      `PDF request for ${pdfPath} is ${(bytes / 1_000_000).toFixed(2)} MB after encoding; ` +
      `the limit is ${CLAUDE_MAX_REQUEST_BYTES / 1_000_000} MB. ` +
      "Split the PDF into smaller page ranges. If one page is too large, review its image size before retrying."
    );
    this.name = "PdfRequestTooLargeError";
  }
}

/** Call before contacting Claude. Includes the stream flag added by the SDK. */
export function assertClaudeRequestSize(request: unknown, pdfPath: string): void {
  const bytes = Buffer.byteLength(JSON.stringify(request), "utf8");
  if (bytes > CLAUDE_MAX_REQUEST_BYTES) throw new PdfRequestTooLargeError(bytes, pdfPath);
}
