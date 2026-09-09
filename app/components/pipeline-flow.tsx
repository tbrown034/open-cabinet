/** The box-and-arrow view of the current filing pipeline. */
type Kind = "program" | "model" | "human" | "publish";
type Point = [number, number];

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
  program: { fill: "#f5f5f4", stroke: "#78716c", text: "#1c1917" },
  model: { fill: "#ffffff", stroke: "#78716c", text: "#1c1917", dash: "5 4" },
  human: { fill: "#fef3c7", stroke: "#b45309", text: "#78350f" },
  publish: { fill: "#e7e5e4", stroke: "#57534e", text: "#1c1917" },
};

const boxes: Box[] = [
  { id: "oge", x: 298, y: 20, w: 304, h: 56, kind: "program", lines: ["Check OGE for new filings", "Cron job runs daily; emails owner if found"] },
  { id: "owner", x: 298, y: 110, w: 304, h: 56, kind: "human", lines: ["Owner confirms it is a new filing", "Owner starts ingest; never automatic"] },
  { id: "claude", x: 298, y: 200, w: 304, h: 70, kind: "model", lines: ["First read: Claude reads the PDF", "PDF support reads text and page images", "Claude proposes transaction rows"] },
  { id: "text", x: 70, y: 320, w: 300, h: 70, kind: "program", lines: ["If the PDF has readable text", "pdftotext + column parser", "Compare with Claude's rows"] },
  { id: "ocr", x: 530, y: 320, w: 300, h: 70, kind: "program", lines: ["If the PDF is scanned", "Tesseract OCR reads page images", "Compare with Claude's rows"] },
  { id: "human", x: 40, y: 490, w: 300, h: 142, kind: "human", lines: ["A person resolves the problem", "Hold the filing.", "Read the source PDF and", "record the decision.", "", "Then continue the checks."] },
  { id: "fallback", x: 560, y: 490, w: 300, h: 70, kind: "model", lines: ["Fallback: another provider's model", "Only if OCR cannot confirm", "Every row must agree"] },
  { id: "prepare", x: 298, y: 680, w: 304, h: 70, kind: "program", lines: ["Prepare the data update", "Validate dataset; rebuild verification labels", "Resolve tickers; generate downloads"] },
  { id: "approve", x: 298, y: 790, w: 304, h: 60, kind: "human", lines: ["A person approves publication", "Review and merge the proposed update"] },
  { id: "publish", x: 298, y: 890, w: 304, h: 70, kind: "publish", lines: ["Publish", "Website, CSV and JSON", "Subscriber emails: separate review and send"] },
];

const plainSteps = [
  { title: "Check OGE and alert the owner", who: "Cron job", text: "Every morning, a cron job checks OGE for new transaction reports. When it finds one, it emails the owner right away. It does not import or publish the filing." },
  { title: "Confirm the filing and start ingest", who: "Owner", text: "The owner opens the filing, confirms it is new and belongs on the site, then starts ingest. Ingest never starts automatically." },
  { title: "First read: Claude", who: "Model", text: "The import downloads the PDF and keeps its OGE source link. Claude PDF support reads the document and proposes transaction rows. Code checks their fields, dates, types and amount ranges." },
  { title: "Second read: programmatic check", who: "Program", text: "If the PDF has readable text, code parses that text and compares it with Claude’s rows. If the filing is scanned, OCR reads the page images instead. Agreement skips the fallback model. A readable-text disagreement holds the filing for a person." },
  { title: "Fallback read when code cannot confirm", who: "Second provider’s model", text: "Another provider’s model reads the pages independently only when the programmatic text or OCR check cannot confirm the rows. Every row must agree before the filing continues." },
  { title: "Prepare the data update", who: "Program", text: "Add accepted rows, validate the dataset, rebuild verification labels and generate downloads. Attach a public ticker only when the asset and name checks support it; otherwise show the name." },
  { title: "Review and approve publication", who: "Person", text: "The workflow opens a proposed data update. A person reviews and merges it before deployment publishes the changes. Resolving a held filing does not bypass the remaining checks." },
  { title: "Publish the site and downloads", who: "Published", text: "Readers can browse the rows, open source filings and download CSV or JSON. Subscriber emails require a separate review and send action." },
];

function Arrow({ points, label, labelAt, dashed = false, anchor = "middle" }: {
  points: Point[];
  label?: string[];
  labelAt?: Point;
  dashed?: boolean;
  anchor?: "start" | "middle";
}) {
  return (
    <g>
      <polyline points={points.map((p) => p.join(",")).join(" ")} fill="none" stroke="#78716c" strokeWidth={1.4} strokeDasharray={dashed ? "4 4" : undefined} markerEnd="url(#pipeline-arrow)" />
      {labelAt && label?.map((line, i) => (
        <text key={line} x={labelAt[0]} y={labelAt[1] + i * 15} fontSize={12} fill="#57534e" textAnchor={anchor} stroke="white" strokeWidth={5} strokeLinejoin="round" paintOrder="stroke">{line}</text>
      ))}
    </g>
  );
}

export default function PipelineFlow() {
  return (
    <figure className="my-6" aria-label="How a filing gets added to the site">
      <p className="sm:hidden mb-3 text-sm text-neutral-500">Scroll sideways to follow the full diagram.</p>
      <div role="region" aria-label="Scrollable filing pipeline diagram" tabIndex={0} className="overflow-x-auto focus-visible:outline-2 focus-visible:outline-offset-4">
        <svg viewBox="0 0 900 980" width="100%" role="img" aria-labelledby="pipeline-title" aria-describedby="pipeline-description" className="block min-w-[800px] max-w-[900px] mx-auto print:min-w-0" style={{ fontFamily: "var(--font-dm-sans), system-ui, sans-serif" }}>
          <title id="pipeline-title">How a filing gets added to the site</title>
          <desc id="pipeline-description">Every morning, a cron job checks OGE and emails the owner when it finds a possible new filing. The owner confirms it is new and belongs on the site, then starts ingest. Ingest never starts automatically. Claude PDF support reads the document first. Code then compares Claude&rsquo;s rows with PDF text or OCR. If OCR cannot confirm them, another provider&rsquo;s model reads the pages independently. Failed checks and amendments stop for a person&rsquo;s review. The prepared data update also needs human approval before publication.</desc>
          <defs>
            <marker id="pipeline-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#78716c" />
            </marker>
          </defs>

          <Arrow points={[[450, 76], [450, 110]]} label={["Email alert"]} labelAt={[460, 98]} anchor="start" />
          <Arrow points={[[450, 166], [450, 200]]} label={["Start import"]} labelAt={[460, 188]} anchor="start" />
          <Arrow points={[[450, 270], [450, 292], [220, 292], [220, 320]]} label={["Readable text"]} labelAt={[320, 287]} />
          <Arrow points={[[450, 270], [450, 292], [680, 292], [680, 320]]} label={["Scanned PDF"]} labelAt={[580, 287]} />

          <Arrow points={[[220, 390], [220, 440], [390, 680]]} label={["Agrees"]} labelAt={[270, 438]} />
          <Arrow points={[[70, 355], [28, 355], [28, 490], [40, 490]]} label={["Disagrees"]} labelAt={[38, 430]} anchor="start" dashed />
          <Arrow points={[[680, 390], [680, 490]]} label={["Cannot confirm"]} labelAt={[690, 445]} anchor="start" />
          <Arrow points={[[830, 355], [880, 355], [880, 650], [540, 680]]} label={["Agrees:", "skip fallback"]} labelAt={[790, 640]} anchor="start" />
          <Arrow points={[[710, 560], [710, 620], [510, 680]]} label={["Every row agrees"]} labelAt={[650, 612]} />
          <Arrow points={[[340, 600], [360, 680]]} label={["Resolved"]} labelAt={[330, 650]} />
          <Arrow points={[[560, 525], [340, 560]]} label={["Rows differ"]} labelAt={[450, 530]} dashed />
          <Arrow points={[[450, 750], [450, 790]]} label={["Validation passes"]} labelAt={[460, 776]} anchor="start" />
          <Arrow points={[[450, 850], [450, 890]]} label={["Merge + deploy"]} labelAt={[460, 876]} anchor="start" />

          {boxes.map((b) => {
            const s = STYLE[b.kind];
            return (
              <g key={b.id}>
                <rect x={b.x} y={b.y} width={b.w} height={b.h} fill={s.fill} stroke={s.stroke} strokeWidth={1.3} strokeDasharray={s.dash} />
                {b.lines.map((line, i) => (
                  <text key={i} x={b.x + 12} y={b.y + 21 + i * 17} fontSize={i === 0 ? 14.5 : 12.5} fontWeight={i === 0 ? 600 : 400} fill={s.text}>{line}</text>
                ))}
              </g>
            );
          })}

          <g transform="translate(650, 735)">
            <text y={0} fontSize={13} fontWeight={600} fill="#44403c">Who does what</text>
            {(["program", "model", "human", "publish"] as const).map((kind, i) => (
              <g key={kind} transform={`translate(0, ${20 + i * 28})`}>
                <rect width={16} height={16} fill={STYLE[kind].fill} stroke={STYLE[kind].stroke} strokeDasharray={STYLE[kind].dash} />
                <text x={25} y={13} fontSize={12.5} fill="#44403c">{{ program: "Program", model: "Model", human: "Person", publish: "Published" }[kind]}</text>
              </g>
            ))}
          </g>
        </svg>
      </div>
      <details className="mt-5 border border-neutral-200 p-4 text-sm leading-relaxed text-neutral-600">
        <summary className="cursor-pointer font-semibold text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-4">
          Read the steps in plain English
        </summary>
        <ol role="list" className="mt-5 list-none space-y-5">
          {plainSteps.map((step, i) => (
            <li key={step.title} className={step.who === "Person" ? "border-l-2 border-amber-600 pl-3" : ""}>
              <h3 className="font-semibold text-neutral-900">{i + 1}. {step.title}</h3>
              <p className="text-xs text-neutral-500 mt-1 mb-2">{step.who}</p>
              <p>{step.text}</p>
            </li>
          ))}
        </ol>
      </details>
      <details className="mt-4 border-t border-neutral-200 pt-4 text-sm leading-relaxed text-neutral-600">
        <summary className="cursor-pointer font-medium text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-4">
          What stops a filing, and what can publish with a note?
        </summary>
        <div className="mt-3 space-y-3">
          <p><strong className="text-neutral-900">Stop before adding new rows:</strong> invalid row fields, amended filings, a trade dated after the filing&rsquo;s posting date, a text-layer mismatch or unresolved second-model differences. Tool failures can also stop processing.</p>
          <p><strong className="text-neutral-900">Stop before publication:</strong> dataset validation failures or repeats across filings that need review. A review decision does not bypass the remaining checks.</p>
          <p><strong className="text-neutral-900">Can remain visible:</strong> some unusual values get a review note; unresolved assets show their names without public tickers. Already-published rows can remain visible while marked under review.</p>
          <p><strong className="text-neutral-900">What the comparison checks:</strong> transaction type, date, amount range, late flag and row count. Name checks are separate and have limits; agreement between models is not a guarantee of accuracy.</p>
        </div>
      </details>
      <figcaption className="mt-4 space-y-2 text-sm leading-relaxed text-neutral-500">
        <p>The first model read uses <a href="https://platform.claude.com/docs/en/build-with-claude/pdf-support" className="underline hover:text-neutral-900">Claude PDF support</a>, which analyzes the document&rsquo;s text and page images.</p>
        <p>This diagram describes new-filing ingest. The second provider is a conditional fallback, not a routine third read. Older rows have their own recorded verification results. Some unusual values can remain visible with a note; unresolved assets show their names without public tickers.</p>
      </figcaption>
    </figure>
  );
}
