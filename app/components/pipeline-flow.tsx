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
          <p><strong>Readable PDF:</strong> <code>pdftotext</code> + column parser. <strong>Scanned PDF:</strong> Tesseract OCR. Code compares the result with Claude&rsquo;s rows.</p>
        </Step>
        <Arrow label="Does the comparison confirm the rows?" />

        <div className="grid gap-3 sm:grid-cols-2">
          <Step kind="program" title="Yes: continue to the audit">
            <p>The program confirms the rows. Skip the fallback model.</p>
          </Step>
          <Step kind="model" title="OCR disagrees or cannot compare: fallback">
            <p>Another provider&rsquo;s model independently reads the PDF.</p>
            <p className="mt-2"><strong>Agrees with Claude:</strong> continue to the audit.</p>
            <p className="mt-2"><strong>Disagrees or fails:</strong> hold for a person.</p>
          </Step>
        </div>
        <p className="mt-3 text-sm text-amber-900">A readable-PDF text mismatch goes directly to human review.</p>
        <Arrow label="Corroborated rows, or a recorded human resolution" />

        <Step kind="model" title="5. Check the completed rows against the page">
          <p>A separate model checks each proposed row beside the source page and looks for missing or extra rows.</p>
        </Step>
        <Arrow label="Is the verification complete?" />

        <div className="grid gap-3 sm:grid-cols-2">
          <Step kind="program" title="Yes: prepare the update">
            <p>The rows have corroborating evidence and a confirming page audit, or recorded human decisions resolving the exceptions.</p>
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
        <p><strong>Planned confidence safeguard:</strong> when a fallback model is used, both extraction models must report at least 0.8 confidence for each row; lower or missing scores require human review. This threshold is not yet enforced. Confidence does not replace the comparison or page-image audit.</p>
        <p>OCR does not have to agree when a fallback model provides corroboration. Unresolved differences and audit problems require human review.</p>
        <p>Publication always requires owner approval.</p>
      </figcaption>
    </figure>
  );
}
