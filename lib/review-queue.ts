/**
 * The review queue: what a person has to decide, written down and sent.
 *
 * When a gate trips, the pipeline used to print a line and stop. Now it
 * also writes an item here, data/meta/review-queue.json, and emails it.
 * The item names the official, the filing (with its OGE link), the page
 * and printed row where the problem is, and what each lane saw. A person
 * opens the PDF at that page, decides, and records the decision. Nothing
 * from the filing publishes in between.
 *
 * Kinds of item:
 *   lane_disagreement   the model and the text layer read a row differently
 *   validation          scripts/validate.ts found something fatal or review-required
 *   summary_stale       new rows changed the facts under a published summary
 *   ticker_withheld     a filed symbol was withheld as not a ticker
 *   amount_unknown      a row's value could not be read; it is published as unknown
 */
import { existsSync, readFileSync, renameSync, writeFileSync } from "fs";
import { execFileSync } from "child_process";
import path from "path";
import { notify } from "./notify";

export const REVIEW_QUEUE_PATH = path.resolve("data/meta/review-queue.json");

export type ReviewKind =
  | "lane_disagreement"
  | "validation"
  | "summary_stale"
  | "ticker_withheld"
  | "amount_unknown";

export interface ReviewLocation {
  /** 1-based page in the PDF, when it could be found. */
  page: number | null;
  /** The row number printed on the form, when known. */
  printedRow: number | null;
  /** Position in the model's reading, 1-based, when the form prints no numbers. */
  parsedRow: number | null;
  /** The asset name on that row, as filed. */
  description: string | null;
}

export interface ReviewProblem {
  location: ReviewLocation;
  /** What the model read. */
  modelSaid: string | null;
  /** What the text layer (or OCR) read. */
  textLayerSaid: string | null;
  /** The problem in one line, as the checker phrased it. */
  detail: string;
}

export interface ReviewItem {
  id: string;
  kind: ReviewKind;
  slug: string;
  officialName: string;
  filing: { url: string | null; pdfFile: string | null; date: string | null };
  problems: ReviewProblem[];
  /** What is being held back until a person decides. */
  holding: string;
  status: "open" | "decided";
  createdAt: string;
  decidedAt?: string;
  decidedBy?: string;
  decision?: string;
  emailSentAt?: string;
}

function readQueue(file = REVIEW_QUEUE_PATH): ReviewItem[] {
  if (!existsSync(file)) return [];
  try {
    return JSON.parse(readFileSync(file, "utf-8")) as ReviewItem[];
  } catch {
    return [];
  }
}

function writeQueue(items: ReviewItem[], file = REVIEW_QUEUE_PATH): void {
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(items, null, 2) + "\n");
  renameSync(tmp, file);
}

export function listOpenReviews(file = REVIEW_QUEUE_PATH): ReviewItem[] {
  return readQueue(file).filter((i) => i.status === "open");
}

/**
 * Which page of the PDF prints a given row number. Splits the text layer
 * on form feeds and looks for a line that starts with the number. Returns
 * null for scans and for rows the text layer does not show.
 */
export function locatePrintedRow(pdfPath: string, printedRow: number): number | null {
  if (!existsSync(pdfPath)) return null;
  let text: string;
  try {
    text = execFileSync("pdftotext", ["-layout", pdfPath, "-"], {
      encoding: "utf-8",
      timeout: 30_000,
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch {
    return null;
  }
  const pages = text.split("\f");
  const re = new RegExp(`^\\s{0,4}${printedRow}\\s{2,}\\S`);
  for (let i = 0; i < pages.length; i++) {
    if (pages[i].split("\n").some((line) => re.test(line))) return i + 1;
  }
  return null;
}

/** Turn the comparator's problem lines into located problems. */
export function problemsFromCrosscheck(
  pdfPath: string,
  problems: string[],
  parsedRows: Array<{ description: string }>
): ReviewProblem[] {
  return problems.map((p) => {
    const rowMatch = p.match(/^(?:printed )?row (\d+)/);
    const printedRow = rowMatch ? Number(rowMatch[1]) : null;
    const lanes = p.match(/text layer \[([^\]]*)\] vs AI parse \[([^\]]*)\]/);
    const parsedRow = printedRow;
    const description = parsedRow && parsedRows[parsedRow - 1] ? parsedRows[parsedRow - 1].description : null;
    return {
      location: {
        page: printedRow ? locatePrintedRow(pdfPath, printedRow) : null,
        printedRow,
        parsedRow,
        description,
      },
      modelSaid: lanes ? lanes[2] : null,
      textLayerSaid: lanes ? lanes[1] : null,
      detail: p,
    };
  });
}

/** The email and the queue item share one plain-text rendering. */
export function renderReviewRequest(item: ReviewItem): { subject: string; body: string } {
  const who = item.officialName;
  const when = item.filing.date ? ` posted ${item.filing.date}` : "";
  const subject = `Review needed: ${who}, ${item.kind.replace(/_/g, " ")}`;
  const lines: string[] = [];
  lines.push(`${who}, 278-T${when}.`);
  if (item.filing.url) lines.push(`Open the filing: ${item.filing.url}`);
  else if (item.filing.pdfFile) lines.push(`Filing: ${item.filing.pdfFile}`);
  lines.push("");
  for (const p of item.problems) {
    const where = [
      p.location.page ? `page ${p.location.page}` : null,
      p.location.printedRow ? `printed row ${p.location.printedRow}` : null,
      !p.location.printedRow && p.location.parsedRow ? `row ${p.location.parsedRow} of the model's reading` : null,
    ]
      .filter(Boolean)
      .join(", ");
    if (where || p.location.description) {
      lines.push(`${where ? `Look at ${where}` : "Row"}${p.location.description ? `: "${p.location.description}"` : ""}`);
    }
    if (p.textLayerSaid && p.modelSaid) {
      lines.push(`  The text layer reads: ${p.textLayerSaid}`);
      lines.push(`  The model read:       ${p.modelSaid}`);
    } else {
      lines.push(`  ${p.detail}`);
    }
    lines.push("");
  }
  lines.push(`Held back: ${item.holding}`);
  lines.push("");
  lines.push(
    "Decide: accept the model's reading, accept the text layer, or correct the row by hand from the PDF. Record it with:"
  );
  lines.push(`  npx tsx scripts/review.ts decide ${item.id} "<what you decided>"`);
  return { subject, body: lines.join("\n") };
}

/** Write the item and send the email. Returns the stored item. */
export async function openReviewItem(
  input: Omit<ReviewItem, "id" | "status" | "createdAt">,
  options: { send?: boolean; file?: string } = {}
): Promise<ReviewItem> {
  const file = options.file ?? REVIEW_QUEUE_PATH;
  const items = readQueue(file);
  const stamp = new Date().toISOString();
  const id = `${input.slug}-${input.kind}-${stamp.slice(0, 10)}-${String(items.length + 1).padStart(3, "0")}`;
  const item: ReviewItem = { id, status: "open", createdAt: stamp, ...input };
  if (options.send !== false) {
    const { subject, body } = renderReviewRequest(item);
    const sent = await notify({ type: "review_request", headline: subject, summary: body });
    if (sent) item.emailSentAt = new Date().toISOString();
  }
  items.push(item);
  writeQueue(items, file);
  return item;
}

export function decideReview(
  id: string,
  decision: string,
  decidedBy: string,
  file = REVIEW_QUEUE_PATH
): ReviewItem | null {
  const items = readQueue(file);
  const item = items.find((i) => i.id === id);
  if (!item || item.status !== "open") return null;
  item.status = "decided";
  item.decision = decision;
  item.decidedBy = decidedBy;
  item.decidedAt = new Date().toISOString();
  writeQueue(items, file);
  return item;
}
