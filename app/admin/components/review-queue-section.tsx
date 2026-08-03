import type { ReviewItem } from "../types";

/** Low-confidence transactions awaiting an approve/delete decision. */
export function ReviewQueueSection({
  items,
  count,
  onReview,
}: {
  items: ReviewItem[];
  count: number;
  onReview: (id: number, action: "approve" | "delete") => void;
}) {
  return (
    <section className="mb-12">
      <h2 className="text-xs uppercase tracking-wider text-neutral-500 font-medium mb-4">
        Review Queue
        {count > 0 && (
          <span className="ml-2 bg-amber-100 text-amber-800 px-2 py-0.5 rounded-sm text-[10px]">
            {count}
          </span>
        )}
      </h2>

      {items.length > 0 ? (
        <div className="space-y-3">
          {items.map((item) => (
            <div
              key={item.id}
              className="border border-neutral-200 px-4 py-3 text-sm"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="font-medium text-neutral-900 truncate">
                    {item.description}
                  </div>
                  <div className="text-xs text-neutral-400 mt-0.5">
                    {item.officialName} · {item.date} · {item.type} ·{" "}
                    {item.amount}
                    {item.confidence !== null && (
                      <span
                        className={
                          item.confidence < 0.8
                            ? "text-amber-700 ml-1"
                            : "text-neutral-400 ml-1"
                        }
                      >
                        conf: {item.confidence}
                      </span>
                    )}
                  </div>
                  {item.pdfSource && (
                    <a
                      href={item.pdfSource}
                      className="text-[10px] text-neutral-400 hover:text-neutral-600 underline mt-0.5 block"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      View source PDF
                    </a>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => onReview(item.id, "approve")}
                    className="text-xs text-emerald-700 hover:text-emerald-900 cursor-pointer"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => onReview(item.id, "delete")}
                    className="text-xs text-red-700 hover:text-red-900 cursor-pointer"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-neutral-400">No transactions need review.</p>
      )}
    </section>
  );
}
