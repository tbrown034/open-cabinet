import { scaleTime } from "d3-scale";
import type { SourceDocumentEntry } from "@/lib/source-docs";
import { formatDate } from "@/lib/format";

interface Props {
  documents: SourceDocumentEntry[];
}

const KIND_COLOR: Record<SourceDocumentEntry["kind"], string> = {
  nominee_278: "#1e40af",            // blue-800 — entry baseline
  ethics_agreement: "#7e22ce",       // purple-700 — promises
  compliance_cert: "#374151",        // stone-700 — OGE certification
  transaction_278t: "#dc2626",       // red-600 — sales (matches site convention)
  certificate_of_divestiture: "#a16207", // amber-700 — Form 201 only
  conflict_waiver: "#a16207",        // amber-700 — Form 201 only
  other: "#a8a29e",                  // stone-400
};

const KIND_LABEL: Record<SourceDocumentEntry["kind"], string> = {
  nominee_278: "Nominee 278",
  ethics_agreement: "Ethics Agreement",
  compliance_cert: "Compliance Cert",
  transaction_278t: "278-T",
  certificate_of_divestiture: "Cert. of Divestiture",
  conflict_waiver: "Conflict Waiver",
  other: "Other",
};

export default function DocumentTimeline({ documents }: Props) {
  if (documents.length === 0) return null;

  const dates = documents
    .map((d) => new Date(d.filedDate))
    .filter((d) => !isNaN(d.getTime()));

  if (dates.length === 0) return null;

  const minDate = new Date(Math.min(...dates.map((d) => +d)));
  const maxDate = new Date(Math.max(...dates.map((d) => +d)));
  // Add small padding on both sides
  const pad = (maxDate.getTime() - minDate.getTime()) * 0.04 || 86400000 * 30;
  const domainStart = new Date(minDate.getTime() - pad);
  const domainEnd = new Date(maxDate.getTime() + pad);

  const W = 720;
  const H = 96;
  const margin = { top: 16, right: 16, bottom: 24, left: 16 };
  const innerW = W - margin.left - margin.right;
  const innerH = H - margin.top - margin.bottom;

  const x = scaleTime()
    .domain([domainStart, domainEnd])
    .range([0, innerW]);

  // Vertical jitter so multiple docs on the same date don't overlap
  // We assign each doc a row 0-3 based on kind, then jitter within the row
  const ROWS = 4;
  const rowForKind: Record<string, number> = {
    nominee_278: 0,
    ethics_agreement: 0,
    compliance_cert: 1,
    transaction_278t: 2,
    certificate_of_divestiture: 3,
    conflict_waiver: 3,
    other: 3,
  };
  const rowY = (i: number) => (innerH / (ROWS - 0.5)) * i + 8;

  // Build month tick marks
  const ticks: { date: Date; label: string }[] = [];
  const cur = new Date(domainStart.getFullYear(), domainStart.getMonth(), 1);
  const end = new Date(domainEnd.getFullYear(), domainEnd.getMonth(), 1);
  // Find a stride that gives ~5-7 ticks
  const monthsSpan =
    (end.getFullYear() - cur.getFullYear()) * 12 +
    (end.getMonth() - cur.getMonth());
  const stride = Math.max(1, Math.ceil(monthsSpan / 6));
  while (cur <= end) {
    ticks.push({
      date: new Date(cur),
      label: cur.toLocaleString("en-US", { month: "short", year: "2-digit" }),
    });
    cur.setMonth(cur.getMonth() + stride);
  }

  return (
    <div className="mb-6">
      <div className="text-xs uppercase tracking-wider text-neutral-500 font-medium mb-2">
        Document timeline
      </div>
      <div className="border border-neutral-200 bg-white p-3">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          height="auto"
          className="block"
          role="img"
          aria-label="Chronology of disclosure documents filed with OGE"
        >
          <g transform={`translate(${margin.left},${margin.top})`}>
            {/* X-axis line */}
            <line
              x1={0}
              x2={innerW}
              y1={innerH}
              y2={innerH}
              stroke="#e7e5e4"
              strokeWidth={1}
            />

            {/* Tick marks */}
            {ticks.map((t, i) => (
              <g key={i} transform={`translate(${x(t.date)},${innerH})`}>
                <line y2={4} stroke="#a8a29e" strokeWidth={1} />
                <text
                  y={16}
                  textAnchor="middle"
                  className="fill-neutral-500"
                  style={{ fontSize: 10 }}
                >
                  {t.label}
                </text>
              </g>
            ))}

            {/* Document dots */}
            {documents.map((doc, i) => {
              const date = new Date(doc.filedDate);
              if (isNaN(date.getTime())) return null;
              const cx = x(date);
              const cy = rowY(rowForKind[doc.kind] ?? 3);
              return (
                <g key={i}>
                  <circle
                    cx={cx}
                    cy={cy}
                    r={5}
                    fill={KIND_COLOR[doc.kind]}
                    opacity={doc.publiclyDownloadable ? 0.9 : 0.45}
                    stroke="white"
                    strokeWidth={1.5}
                  >
                    <title>
                      {`${KIND_LABEL[doc.kind]} — filed ${formatDate(doc.filedDate)}${!doc.publiclyDownloadable ? " (Form 201 only)" : ""}`}
                    </title>
                  </circle>
                </g>
              );
            })}
          </g>
        </svg>

        {/* Legend */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[10px] text-neutral-500">
          {(
            [
              "nominee_278",
              "ethics_agreement",
              "compliance_cert",
              "transaction_278t",
              "certificate_of_divestiture",
            ] as const
          ).map((k) => (
            <span key={k} className="inline-flex items-center gap-1.5">
              <span
                className="inline-block w-2 h-2 rounded-full"
                style={{ backgroundColor: KIND_COLOR[k] }}
              />
              {KIND_LABEL[k]}
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5 text-neutral-400">
            <span className="inline-block w-2 h-2 rounded-full opacity-45 bg-neutral-400" />
            faded = Form 201 only
          </span>
        </div>
      </div>
    </div>
  );
}
