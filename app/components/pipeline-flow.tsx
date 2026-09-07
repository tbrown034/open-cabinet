/**
 * The publication pipeline as one diagram: what a program does, what a
 * model does, where a person is required. Static SVG, server-rendered,
 * monochrome with the site's amber for the human steps, so it prints and
 * screenshots like a graphics-desk chart rather than a flowchart tool.
 *
 * Trevor, Sep 6, 2026: boxes with colors for human review, program and
 * model; ingest, read, lane, compare, and the branch to a person.
 */

type Kind = "program" | "model" | "human" | "publish";

interface Box {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  kind: Kind;
  lines: string[];
}

const STYLE: Record<Kind, { fill: string; stroke: string; text: string; dash?: string }> = {
  program: { fill: "#f5f5f4", stroke: "#57534e", text: "#1c1917" },
  model: { fill: "#ffffff", stroke: "#57534e", text: "#1c1917", dash: "4 3" },
  human: { fill: "#fef3c7", stroke: "#b45309", text: "#78350f" },
  publish: { fill: "#e7e5e4", stroke: "#1c1917", text: "#1c1917" },
};

const W = 760;
const boxes: Box[] = [
  { id: "oge", x: 40, y: 20, w: 236, h: 44, kind: "program", lines: ["OGE posts a 278-T", "daily check, weekly ingest"] },
  { id: "read1", x: 40, y: 96, w: 236, h: 44, kind: "model", lines: ["Read 1: vision model", "reads every page into rows"] },
  { id: "shape", x: 40, y: 172, w: 236, h: 44, kind: "program", lines: ["Shape gate", "dates, ranges, types valid?"] },
  { id: "text", x: 40, y: 248, w: 236, h: 44, kind: "program", lines: ["Text layer or OCR", "compares type, date, amount, late flag"] },
  { id: "read2", x: 40, y: 324, w: 236, h: 44, kind: "model", lines: ["Read 2: second company's model", "only when no program could read the page"] },
  { id: "audit", x: 40, y: 400, w: 236, h: 44, kind: "model", lines: ["Page audit: third company's model", "shown each row beside the page"] },
  { id: "flag", x: 40, y: 476, w: 236, h: 44, kind: "program", lines: ["Impossible-value check", "flags a row for a person; it stays published"] },
  { id: "asset", x: 40, y: 552, w: 236, h: 44, kind: "program", lines: ["Asset lane", "ticker only on exact evidence, else name only"] },
  { id: "publish", x: 40, y: 628, w: 236, h: 44, kind: "publish", lines: ["Publish", "site, CSV, JSON, filing alert"] },
  { id: "human", x: 480, y: 248, w: 240, h: 120, kind: "human", lines: ["A person", "reads the page, rules row by row;", "every ruling recorded with the", "page and printed row"] },
  { id: "amend", x: 480, y: 96, w: 240, h: 44, kind: "human", lines: ["Amended filing", "always held for a person"] },
];

function Arrow({ from, to, label, dashed }: { from: [number, number]; to: [number, number]; label?: string; dashed?: boolean }) {
  const [x1, y1] = from;
  const [x2, y2] = to;
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  return (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#78716c" strokeWidth={1.2} markerEnd="url(#arrow)" strokeDasharray={dashed ? "3 3" : undefined} />
      {label ? (
        <text x={mx + (x1 === x2 ? 6 : 0)} y={my - (x1 === x2 ? 0 : 5)} fontSize={10} fill="#57534e" textAnchor={x1 === x2 ? "start" : "middle"}>
          {label}
        </text>
      ) : null}
    </g>
  );
}

export default function PipelineFlow() {
  const by = Object.fromEntries(boxes.map((b) => [b.id, b]));
  const bottom = (id: string): [number, number] => [by[id].x + by[id].w / 2, by[id].y + by[id].h];
  const top = (id: string): [number, number] => [by[id].x + by[id].w / 2, by[id].y];
  const right = (id: string, dy = 0): [number, number] => [by[id].x + by[id].w, by[id].y + by[id].h / 2 + dy];
  const left = (id: string, dy = 0): [number, number] => [by[id].x, by[id].y + by[id].h / 2 + dy];
  const chain = ["oge", "read1", "shape", "text", "read2", "audit", "flag", "asset", "publish"];
  return (
    <figure className="my-6">
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} 700`} width="100%" role="img" aria-label="How a filing becomes published rows: a program fetches and checks, two models read, a third audits, a person rules on every disagreement, then the rows publish." className="max-w-[760px] block mx-auto" style={{ fontFamily: "var(--font-dm-sans), system-ui, sans-serif" }}>
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#78716c" />
            </marker>
          </defs>
          {chain.slice(0, -1).map((id, i) => (
            <Arrow key={id} from={bottom(id)} to={top(chain[i + 1])} label={id === "text" ? "agree (skips read 2)" : id === "read2" ? "every row agrees" : id === "audit" ? "confirms" : id === "shape" ? "valid" : undefined} />
          ))}
          <Arrow from={right("shape")} to={left("human", -40)} label="invalid" dashed />
          <Arrow from={right("text")} to={left("human", -20)} label="disagree, or scan unreadable" dashed />
          <Arrow from={right("read2")} to={left("human", 0)} label="any row differs" dashed />
          <Arrow from={right("audit")} to={left("human", 20)} label="disputes a row" dashed />
          <Arrow from={right("flag")} to={left("human", 40)} label="flag (row stays up, marked)" dashed />
          <Arrow from={right("asset", 8)} to={left("human", 56)} label="no exact match: name only, queue" dashed />
          <Arrow from={right("oge", -8)} to={left("amend")} label="OGE marks it amended" dashed />
          <Arrow from={[by.human.x + 120, by.human.y + by.human.h]} to={[by.publish.x + by.publish.w + 6, by.publish.y + 6]} label="ruling recorded, rows continue" dashed />
          {boxes.map((b) => {
            const s = STYLE[b.kind];
            return (
              <g key={b.id}>
                <rect x={b.x} y={b.y} width={b.w} height={b.h} fill={s.fill} stroke={s.stroke} strokeWidth={1.2} strokeDasharray={s.dash} />
                {b.lines.map((line, i) => (
                  <text key={i} x={b.x + 10} y={b.y + 17 + i * 13} fontSize={i === 0 ? 12 : 10} fontWeight={i === 0 ? 600 : 400} fill={s.text}>
                    {line}
                  </text>
                ))}
              </g>
            );
          })}
          <g transform="translate(480, 600)">
            <rect x={0} y={0} width={14} height={14} fill={STYLE.program.fill} stroke={STYLE.program.stroke} />
            <text x={20} y={11} fontSize={10} fill="#44403c">Program (deterministic, no model)</text>
            <rect x={0} y={22} width={14} height={14} fill={STYLE.model.fill} stroke={STYLE.model.stroke} strokeDasharray="4 3" />
            <text x={20} y={33} fontSize={10} fill="#44403c">Model (reads pages; never decides alone)</text>
            <rect x={0} y={44} width={14} height={14} fill={STYLE.human.fill} stroke={STYLE.human.stroke} />
            <text x={20} y={55} fontSize={10} fill="#44403c">Person (required; every ruling on record)</text>
            <rect x={0} y={66} width={14} height={14} fill={STYLE.publish.fill} stroke={STYLE.publish.stroke} />
            <text x={20} y={77} fontSize={10} fill="#44403c">Published</text>
          </g>
        </svg>
      </div>
      <figcaption className="text-xs text-neutral-500 mt-2 max-w-3xl mx-auto">
        Every filing takes the left path; a program that confirms the read skips the second model. A dashed exit from the shape gate, the lanes or the audit holds a new filing until a person rules. The two lower exits do not hold: an impossible value marks the row for review while it stays published, and an unresolved asset name publishes under the printed name with no ticker. Rows already published that a later check disputes stay up marked under review.
      </figcaption>
    </figure>
  );
}
