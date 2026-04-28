import { scaleTime } from "d3-scale";
import type { PromiseEvidence } from "@/lib/divestiture";
import { formatDate } from "@/lib/format";

interface Props {
  evidence: PromiseEvidence[];
  confirmedDate: string;
  deadline90Days: string;
  certifiedDate: string;
}

const ROW_H = 28;

export default function DivestitureTimelineStrip({
  evidence,
  confirmedDate,
  deadline90Days,
  certifiedDate,
}: Props) {
  // Time domain: from confirmation date to the latest known date
  const allDates: Date[] = [
    new Date(confirmedDate),
    new Date(deadline90Days),
    new Date(certifiedDate),
  ];
  for (const ev of evidence) {
    for (const s of ev.matchingSales) allDates.push(new Date(s.date));
  }
  const validDates = allDates.filter((d) => !isNaN(d.getTime()));
  const minDate = new Date(Math.min(...validDates.map((d) => +d)));
  const maxDate = new Date(Math.max(...validDates.map((d) => +d)));
  const pad = (maxDate.getTime() - minDate.getTime()) * 0.04 || 86400000 * 30;
  const domainStart = new Date(minDate.getTime() - pad);
  const domainEnd = new Date(maxDate.getTime() + pad);

  const W = 720;
  const labelW = 200; // left column width for entity name
  const stripW = W - labelW - 16;
  const H = ROW_H * evidence.length + 36;

  const x = scaleTime().domain([domainStart, domainEnd]).range([0, stripW]);

  // Month ticks
  const ticks: { date: Date; label: string }[] = [];
  const cur = new Date(domainStart.getFullYear(), domainStart.getMonth(), 1);
  const end = new Date(domainEnd.getFullYear(), domainEnd.getMonth(), 1);
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
        Promise timeline
      </div>
      <div className="border border-neutral-200 bg-white p-3">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          height="auto"
          className="block"
          role="img"
          aria-label="Per-promise timeline of disclosed sales"
        >
          {/* Vertical reference lines that span ALL rows */}
          {/* Confirmation */}
          <line
            x1={labelW + x(new Date(confirmedDate))}
            x2={labelW + x(new Date(confirmedDate))}
            y1={0}
            y2={H - 28}
            stroke="#a8a29e"
            strokeWidth={1}
            strokeDasharray="2,3"
          />
          {/* 90-day deadline */}
          <line
            x1={labelW + x(new Date(deadline90Days))}
            x2={labelW + x(new Date(deadline90Days))}
            y1={0}
            y2={H - 28}
            stroke="#d97706"
            strokeWidth={1}
            strokeDasharray="3,3"
          />
          {/* OGE certified */}
          <line
            x1={labelW + x(new Date(certifiedDate))}
            x2={labelW + x(new Date(certifiedDate))}
            y1={0}
            y2={H - 28}
            stroke="#44403c"
            strokeWidth={1}
          />

          {/* Per-promise rows */}
          {evidence.map((ev, i) => {
            const cy = i * ROW_H + ROW_H / 2;
            return (
              <g key={ev.promise.entity}>
                {/* Row separator */}
                {i > 0 && (
                  <line
                    x1={0}
                    x2={W}
                    y1={i * ROW_H}
                    y2={i * ROW_H}
                    stroke="#f5f5f4"
                    strokeWidth={1}
                  />
                )}
                {/* Entity label (left column) */}
                <text
                  x={labelW - 8}
                  y={cy + 3}
                  textAnchor="end"
                  className="fill-neutral-800"
                  style={{ fontSize: 11 }}
                >
                  {ev.promise.entity.length > 28
                    ? ev.promise.entity.slice(0, 26) + "…"
                    : ev.promise.entity}
                </text>
                {/* Strip baseline */}
                <line
                  x1={labelW}
                  x2={labelW + stripW}
                  y1={cy}
                  y2={cy}
                  stroke="#e7e5e4"
                  strokeWidth={1}
                />
                {/* Sale dots */}
                {ev.matchingSales.map((sale, si) => (
                  <circle
                    key={si}
                    cx={labelW + x(new Date(sale.date))}
                    cy={cy}
                    r={3.5}
                    fill="#dc2626"
                    opacity={0.85}
                    stroke="white"
                    strokeWidth={0.8}
                  >
                    <title>
                      {`${ev.promise.entity}: ${sale.type} — ${formatDate(sale.date)}`}
                    </title>
                  </circle>
                ))}
                {/* "No sale on file" indicator */}
                {ev.matchingSales.length === 0 && (
                  <text
                    x={labelW + 8}
                    y={cy + 3}
                    className="fill-amber-700"
                    style={{ fontSize: 9 }}
                  >
                    no 278-T sale on file
                  </text>
                )}
              </g>
            );
          })}

          {/* X-axis ticks */}
          <g transform={`translate(${labelW}, ${H - 24})`}>
            <line x1={0} x2={stripW} y1={0} y2={0} stroke="#e7e5e4" />
            {ticks.map((t, i) => (
              <g key={i} transform={`translate(${x(t.date)},0)`}>
                <line y2={4} stroke="#a8a29e" />
                <text
                  y={14}
                  textAnchor="middle"
                  className="fill-neutral-500"
                  style={{ fontSize: 9 }}
                >
                  {t.label}
                </text>
              </g>
            ))}
          </g>
        </svg>

        {/* Legend */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[10px] text-neutral-500">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-red-600" />
            278-T sale on file
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-3 border-t border-dashed border-stone-400" />
            Confirmed ({formatDate(confirmedDate)})
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-3 border-t border-dashed border-amber-600" />
            90-day deadline ({formatDate(deadline90Days)})
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-3 border-t border-stone-700" />
            OGE certified ({formatDate(certifiedDate)})
          </span>
        </div>
      </div>
    </div>
  );
}
