import type { RowNote } from "@/lib/row-notes";

/** A numbered mark after a cell value: "¹" style, rendered as text. */
export function NoteMark({ numbers }: { numbers: number[] }) {
  if (numbers.length === 0) return null;
  return (
    <sup className="ml-0.5 text-[10px] text-neutral-500" aria-label={`see note ${numbers.join(", ")}`}>
      {numbers.map((n) => `*${n}`).join(" ")}
    </sup>
  );
}

/** The Notes list under a table: one line per mark, in order. */
export default function RowNotesList({ notes }: { notes: RowNote[] }) {
  if (notes.length === 0) return null;
  return (
    <div className="mt-4 text-xs text-neutral-600 max-w-2xl">
      <div className="uppercase tracking-wider text-neutral-500 font-medium mb-1">Notes</div>
      <ol className="space-y-1">
        {notes.map((n) => (
          <li key={n.n} id={`note-${n.n}`}>
            <span className="font-medium text-neutral-800">*{n.n}</span> {n.text}
          </li>
        ))}
      </ol>
    </div>
  );
}
