type Kind = "program" | "model" | "human" | "publish";

const STYLE: Record<Kind, string> = {
  program: "border-stone-400 bg-stone-50 text-stone-900",
  model: "border-dashed border-stone-400 bg-white text-stone-900",
  human: "border-amber-600 bg-amber-50 text-amber-900",
  publish: "border-stone-600 bg-stone-200 text-stone-900",
};

function Step({ kind, title, children }: { kind: Kind; title: string; children: React.ReactNode }) {
  return (
    <div className={`border px-5 py-4 ${STYLE[kind]}`}>
      <h3 className="font-semibold">{title}</h3>
      <div className="mt-1 text-sm leading-relaxed">{children}</div>
    </div>
  );
}

function Arrow({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center py-1 text-stone-500" aria-hidden="true">
      {label ? <span className="text-xs">{label}</span> : null}
      <span className="text-xl leading-none">↓</span>
    </div>
  );
}

export default function PipelineFlow() {
  return (
    <figure className="my-6" aria-labelledby="pipeline-title">
      <h3 id="pipeline-title" className="sr-only">How a filing gets added to the site</h3>
      <div className="mx-auto max-w-xl">
        <Step kind="program" title="1. Check OGE">
          <p>A daily cron job emails the owner when it finds a possible new filing. It does not ingest anything.</p>
        </Step>
        <Arrow label="Email alert" />

        <Step kind="human" title="2. Owner starts ingest">
          <p>The owner confirms the filing is new and relevant, then manually starts ingest.</p>
        </Step>
        <Arrow />

        <Step kind="model" title="3. Claude extracts the rows">
          <p><a href="https://platform.claude.com/docs/en/build-with-claude/pdf-support" className="underline hover:text-stone-700">Claude PDF support</a> reads the filing and proposes transaction rows.</p>
        </Step>
        <Arrow />

        <Step kind="program" title="4. A second reader checks the rows">
          <p><strong>Readable PDF:</strong> <code>pdftotext</code> + column parser. <strong>Scanned PDF:</strong> Tesseract OCR. If neither can confirm the page, a second provider&rsquo;s model reads it independently.</p>
        </Step>
        <Arrow />

        <Step kind="model" title="5. Check the completed rows against the page">
          <p>A separate model checks each proposed row beside the source page and looks for missing or extra rows.</p>
        </Step>
        <Arrow label="Do the checks agree?" />

        <div className="grid gap-3 sm:grid-cols-2">
          <Step kind="program" title="Yes: prepare the update">
            <p>Continue only when every checked field and row count agree.</p>
          </Step>
          <Step kind="human" title="No: hold for a person">
            <p>Read the source PDF, check the disagreement, record a visual decision and rerun the checks.</p>
          </Step>
        </div>
        <Arrow />

        <Step kind="human" title="6. Owner approves publication">
          <p>Review and merge the proposed data update.</p>
        </Step>
        <Arrow />

        <Step kind="publish" title="7. Publish">
          <p>Publish the website, CSV and JSON. Subscriber email has a separate review and send step.</p>
        </Step>
      </div>

      <figcaption className="mx-auto mt-5 max-w-xl space-y-2 text-sm leading-relaxed text-neutral-500">
        <p>Any disagreement, missing row, extra row or failed check holds the filing for a person.</p>
        <p>Three independent checks support each row. Any disagreement goes to human review, and publication always requires owner approval.</p>
      </figcaption>
    </figure>
  );
}
