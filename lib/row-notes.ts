/**
 * One convention for every row that carries a note.
 *
 * When a filing leaves a field blank or prints something that cannot be
 * right, the site shows exactly that and never a filled-in guess: type
 * "Unstated", amount "Not ascertainable", date "N/A", or the impossible
 * value as printed. The cell gets a numbered mark, and a Notes list under
 * the table prints the filing's wording for each mark and, where a person
 * decided, who and when. The same numbering runs through the official
 * page, the company page and the all-trades page; the downloads carry
 * the note text in its own column.
 */
import type { Transaction } from "./types";

export interface RowNote {
  /** 1-based footnote number, in order of first appearance on the page. */
  n: number;
  field: "date" | "type" | "amount" | "row";
  text: string;
}

export type NotesByRow = Map<Transaction, RowNote[]>;

/** Which fields of a row carry a note, in display order. */
export function notesOf(tx: Pick<Transaction, "dateNote" | "typeNote" | "amountNote" | "notes" | "type" | "amount" | "date">): Array<{ field: RowNote["field"]; text: string }> {
  const out: Array<{ field: RowNote["field"]; text: string }> = [];
  if (tx.dateNote) out.push({ field: "date", text: tx.dateNote });
  else if (tx.date === null) out.push({ field: "date", text: "The filing prints no date for this row." });
  if (tx.typeNote) out.push({ field: "type", text: `The filing's type column reads "${tx.typeNote}".` });
  else if (tx.type === "Unstated") out.push({ field: "type", text: "The filing states no transaction type for this row." });
  if (tx.amount === null) out.push({ field: "amount", text: tx.amountNote ? `The filing says: ${tx.amountNote}.` : "The filing states no value for this row." });
  if (tx.notes) out.push({ field: "row", text: tx.notes });
  return out;
}

/**
 * Number the notes of the rows shown, in order. Identical note text gets
 * one number, so three rows with the same wording share a footnote.
 */
export function numberNotes(rows: Transaction[]): { byRow: NotesByRow; list: RowNote[] } {
  const byText = new Map<string, RowNote>();
  const list: RowNote[] = [];
  const byRow: NotesByRow = new Map();
  for (const tx of rows) {
    const here: RowNote[] = [];
    for (const note of notesOf(tx)) {
      let entry = byText.get(note.text);
      if (!entry) {
        entry = { n: list.length + 1, field: note.field, text: note.text };
        byText.set(note.text, entry);
        list.push(entry);
      }
      here.push(entry);
    }
    if (here.length) byRow.set(tx, here);
  }
  return { byRow, list };
}

/** The footnote numbers for one field of one row, e.g. "1" or "1, 3". */
export function marksFor(notes: RowNote[] | undefined, field: RowNote["field"]): number[] {
  return (notes ?? []).filter((n) => n.field === field).map((n) => n.n);
}
