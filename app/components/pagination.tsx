/**
 * Server-rendered pagination — pure <Link> elements, no JS bundle.
 * Preserves all other search params so range/type/month filters stick
 * across page jumps. Render once above the table, once below.
 */
import Link from "next/link";

interface Props {
  page: number;
  totalPages: number;
  perPage: number;
  totalCount: number;
  basePath: string;
  // Existing search params to preserve as the user paginates.
  searchParams: Record<string, string | undefined>;
}

function buildHref(
  basePath: string,
  searchParams: Record<string, string | undefined>,
  page: number
): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(searchParams)) {
    if (v && k !== "page") params.set(k, v);
  }
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `${basePath}?${qs}#trades` : `${basePath}#trades`;
}

export default function Pagination({
  page,
  totalPages,
  perPage,
  totalCount,
  basePath,
  searchParams,
}: Props) {
  if (totalPages <= 1) return null;

  const start = (page - 1) * perPage + 1;
  const end = Math.min(page * perPage, totalCount);

  const prev = page > 1 ? buildHref(basePath, searchParams, page - 1) : null;
  const next =
    page < totalPages ? buildHref(basePath, searchParams, page + 1) : null;

  // Render a compact page-number row: 1, …, page-1, page, page+1, …, last
  const pageNumbers = new Set<number>([1, totalPages, page]);
  if (page > 1) pageNumbers.add(page - 1);
  if (page < totalPages) pageNumbers.add(page + 1);
  const sortedPages = Array.from(pageNumbers).sort((a, b) => a - b);

  return (
    <nav
      aria-label="Trade table pagination"
      className="flex flex-wrap items-center justify-between gap-3 text-xs text-neutral-600 my-3"
    >
      <span className="text-neutral-500 tabular-nums">
        Showing{" "}
        <span className="text-neutral-900 font-medium">
          {start.toLocaleString()}–{end.toLocaleString()}
        </span>{" "}
        of {totalCount.toLocaleString()} trades
      </span>
      <div className="flex items-center gap-1">
        {prev ? (
          <Link
            href={prev}
            scroll={false}
            className="border border-neutral-200 px-2 py-1 hover:bg-neutral-100 transition-colors"
          >
            ← Prev
          </Link>
        ) : (
          <span className="border border-neutral-100 px-2 py-1 text-neutral-300 cursor-not-allowed">
            ← Prev
          </span>
        )}
        {sortedPages.map((n, i) => {
          const prevN = sortedPages[i - 1];
          const gap = prevN !== undefined && n - prevN > 1;
          return (
            <span key={n} className="flex items-center gap-1">
              {gap && <span className="text-neutral-300">…</span>}
              {n === page ? (
                <span className="border border-neutral-900 bg-neutral-900 text-white px-2 py-1 tabular-nums">
                  {n}
                </span>
              ) : (
                <Link
                  href={buildHref(basePath, searchParams, n)}
                  scroll={false}
                  className="border border-neutral-200 px-2 py-1 hover:bg-neutral-100 transition-colors tabular-nums"
                >
                  {n}
                </Link>
              )}
            </span>
          );
        })}
        {next ? (
          <Link
            href={next}
            scroll={false}
            className="border border-neutral-200 px-2 py-1 hover:bg-neutral-100 transition-colors"
          >
            Next →
          </Link>
        ) : (
          <span className="border border-neutral-100 px-2 py-1 text-neutral-300 cursor-not-allowed">
            Next →
          </span>
        )}
      </div>
    </nav>
  );
}
