import type { Metadata } from "next";
import { rebuildRowStates, recordHeldDecision, recordRowDecision } from "./actions";
import { loadReviewData } from "./data";
import { requireLocalReview } from "./local-only";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const metadata: Metadata = { title: "Local review", robots: { index: false, follow: false } };

const button = "rounded border border-neutral-400 px-3 py-2 text-sm font-medium hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2";
const input = "block w-full rounded border border-neutral-400 p-2 text-sm";
const panel = "space-y-3 rounded border border-neutral-300 p-4";

function FilingLink({ url }: { url: string | null | undefined }) {
  return url ? <a href={url} target="_blank" rel="noreferrer" className="underline">Open OGE PDF</a>
    : <span>OGE PDF link unavailable.</span>;
}

export default async function ReviewPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireLocalReview();
  const { held, groups, disputedCount, decisionCount, verificationAvailable } = await loadReviewData();
  const params = await searchParams;
  return (
    <main className="mx-auto max-w-5xl space-y-8 px-4 py-8">
      <header className="space-y-3">
        <h1 className="text-3xl font-semibold">Local review</h1>
        <p>{held.length} held filings · {disputedCount} disputed rows · {decisionCount} decisions recorded so far</p>
        <p className="text-sm text-neutral-600">Compare the evidence with the OGE PDF, then record what you saw. Decisions are saved in this local repository.</p>
      </header>

      {typeof params.message === "string" && <p role="status" className={panel}>{params.message}</p>}
      {typeof params.error === "string" && <p role="alert" className={`${panel} whitespace-pre-wrap`}>{params.error}</p>}

      <section aria-labelledby="held-filings" className="space-y-4">
        <h2 id="held-filings" className="text-2xl font-semibold">Held filings</h2>
        {held.length === 0 && <p>No open held filings.</p>}
        {held.map((item) => (
          <article key={item.id} className={panel}>
            <h3 className="text-lg font-semibold">{item.officialName}</h3>
            <p>Filing date: {item.filing.date ?? "unavailable"} · <FilingLink url={item.filing.url} /></p>
            <p>Held back: {item.holding}</p>
            {item.problems.map((problem, index) => (
              <div key={index} className="space-y-2 border-t border-neutral-200 pt-3">
                <p className="font-medium">Page {problem.location.page ?? "unknown"}, printed row {problem.location.printedRow ?? "unknown"}
                  {problem.location.parsedRow && !problem.location.printedRow ? ` (model row ${problem.location.parsedRow})` : ""}
                  {problem.location.description ? `: ${problem.location.description}` : ""}
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {problem.textLayerSaid && <div><h4 className="font-medium">{problem.lane ?? "text layer"} read</h4><p>{problem.textLayerSaid}</p></div>}
                  {problem.modelSaid && <div><h4 className="font-medium">Model read</h4><p>{problem.modelSaid}</p></div>}
                </div>
                <p>{problem.detail}</p>
              </div>
            ))}
            <form action={recordHeldDecision} className="space-y-3">
              <input type="hidden" name="id" value={item.id} />
              <label className="block space-y-1">
                <span className="font-medium">Decision and evidence</span>
                <textarea name="decision" required rows={2} className={input} />
              </label>
              <button type="submit" className={button}>Record decision</button>
            </form>
          </article>
        ))}
      </section>

      <section aria-labelledby="disputed-rows" className="space-y-5">
        <h2 id="disputed-rows" className="text-2xl font-semibold">Disputed rows</h2>
        {!verificationAvailable ? <p>Row verification file unavailable. Rebuild row states to create it.</p>
          : disputedCount === 0 && <p>No disputed rows.</p>}
        {groups.map((group) => (
          <section key={group.slug} aria-labelledby={`official-${group.slug}`} className="space-y-3">
            <h3 id={`official-${group.slug}`} className="text-xl font-semibold">{group.name}</h3>
            {group.rows.map(({ verification, transaction, detail, decision }) => (
              <article key={verification.id} className={panel}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <h4 className="font-semibold">As published</h4>
                    {transaction ? <>
                      <p>{transaction.description}</p>
                      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                        <dt>Type</dt><dd>{transaction.type}{transaction.typeNote ? ` (${transaction.typeNote})` : ""}</dd>
                        <dt>Date</dt><dd>{transaction.date}</dd>
                        <dt>Amount</dt><dd>{transaction.amount ?? "Unknown"}{transaction.amountNote ? ` (${transaction.amountNote})` : ""}</dd>
                        <dt>Late flag</dt><dd>{transaction.lateFilingFlag ? "Yes" : "No"}</dd>
                      </dl>
                      <FilingLink url={transaction.sourceUrl ?? verification.sourceUrl} />
                    </> : <p>Published row or official unavailable. Rebuild row states before deciding.</p>}
                  </div>
                  <div className="space-y-2">
                    <h4 className="font-semibold">Check evidence</h4>
                    <p>{verification.note}</p>
                    {detail?.audit && <p><strong>Page audit: </strong>{detail.audit}</p>}
                    {detail?.second && <p><strong>Second model: </strong>{detail.second}</p>}
                    {detail?.unavailable && <p>{detail.unavailable}</p>}
                    {detail && !detail.audit && !detail.second && !detail.unavailable && <p>No audit or second-model detail was recorded for this row.</p>}
                  </div>
                </div>
                {decision && <p className="text-sm"><strong>Recorded: {decision.decision}</strong> by {decision.decidedBy} on {decision.decidedAt}. {decision.evidence} {decision.decision === "rejected" ? "Needs a patch." : "Rebuild row states to apply."}</p>}
                {transaction && <form action={recordRowDecision} className="space-y-3">
                  <input type="hidden" name="slug" value={group.slug} />
                  <input type="hidden" name="recordId" value={verification.id} />
                  <label className="block space-y-1">
                    <span className="font-medium">Evidence: page N, printed row M, what you saw</span>
                    <textarea name="evidence" required rows={2} placeholder="page N, printed row M, what you saw" className={input} />
                  </label>
                  <div className="flex flex-wrap gap-3">
                    <button type="submit" name="decision" value="confirmed" className={button}>Confirm as published</button>
                    <button type="submit" name="decision" value="rejected" className={button}>Reject (needs a patch)</button>
                  </div>
                </form>}
              </article>
            ))}
          </section>
        ))}
      </section>

      <section aria-labelledby="rebuild-states" className="space-y-3 border-t border-neutral-300 pt-5">
        <h2 id="rebuild-states" className="text-xl font-semibold">Apply recorded row decisions</h2>
        <p>Confirmed rows become human verified after rebuilding. Rejected rows need a patch and remain under review.</p>
        <form action={rebuildRowStates}><button type="submit" className={button}>Rebuild row states</button></form>
        {typeof params.output === "string" && <div role="status" className={panel}>
          <h3 className="font-medium">Rebuild output (last lines)</h3>
          <pre className="overflow-x-auto whitespace-pre-wrap text-sm">{params.output}</pre>
        </div>}
      </section>
    </main>
  );
}
