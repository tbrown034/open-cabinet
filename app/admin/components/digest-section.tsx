import Link from "next/link";
import { formatDate } from "@/lib/format";
import type { DigestPreview, DigestSendResult } from "../types";

/**
 * Filing digest draft preview plus the test-send and real-send flows.
 * All state lives in the page; this component renders and calls back.
 */
export function DigestSection({
  digest,
  digestError,
  confirming,
  sending,
  result,
  testing,
  testResult,
  testOfficial,
  onRetryLoad,
  onSend,
  onTest,
  onSetConfirming,
  onSetTestOfficial,
}: {
  digest: DigestPreview | null;
  digestError: boolean;
  confirming: boolean;
  sending: boolean;
  result: DigestSendResult | null;
  testing: boolean;
  testResult: DigestSendResult | null;
  testOfficial: string;
  onRetryLoad: () => void;
  onSend: () => void;
  onTest: () => void;
  onSetConfirming: (confirming: boolean) => void;
  onSetTestOfficial: (slug: string) => void;
}) {
  return (
    <section className="mb-12">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs uppercase tracking-wider text-neutral-500 font-medium">
          Filing Digest
          {digest && (
            <span className="ml-2 bg-neutral-100 text-neutral-700 px-2 py-0.5 rounded-sm text-[10px]">
              {digest.recipientCount} confirmed · {digest.follows.allFollowers}{" "}
              follow all
            </span>
          )}
        </h2>
      </div>
      <div className="bg-stone-50 border border-neutral-200 p-4 text-sm">
        {digestError ? (
          <div className="text-xs">
            <p className="text-red-700 mb-2">Could not load the digest draft.</p>
            <button
              type="button"
              onClick={onRetryLoad}
              className="border border-neutral-300 text-neutral-700 px-3 py-1.5 hover:bg-neutral-50 transition-colors cursor-pointer"
            >
              Retry
            </button>
          </div>
        ) : !digest ? (
          <p className="text-neutral-500 text-xs">Loading draft…</p>
        ) : (
          <div className="space-y-4">
            {/* An unfinished run means a prior send failed partway; the same
                Send button resumes it (idempotent per-chunk). */}
            {digest.inFlightRun && (
              <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 px-2 py-1">
                Run #{digest.inFlightRun.id} is {digest.inFlightRun.status} —{" "}
                {digest.inFlightRun.chunks.ok}/{digest.inFlightRun.chunks.total}{" "}
                chunks sent. Clicking Send resumes the remaining recipients.
              </p>
            )}
            {digest.warning && (
              <p className="text-[11px] text-amber-800">{digest.warning}</p>
            )}

            {digest.draft.empty ? (
              <p className="text-neutral-500 text-xs">
                No new filings to send. Subscribers get nothing until a tracked
                official files new trades.
                {digest.lastSentAt && (
                  <>
                    {" "}
                    Last digest sent{" "}
                    {new Date(digest.lastSentAt).toLocaleString()}.
                  </>
                )}
              </p>
            ) : (
              <>
                <p className="text-neutral-600 text-xs">
                  Draft ready: {digest.draft.items.length} official
                  {digest.draft.items.length === 1 ? "" : "s"}. Reaches{" "}
                  {digest.follows.reached} of {digest.follows.total} confirmed —{" "}
                  {digest.follows.allFollowers} follow all officials
                  {digest.draft.items.some(
                    (i) => (digest.follows.byOfficial[i.slug] ?? 0) > 0
                  ) && (
                    <>
                      {", plus "}
                      {digest.draft.items
                        .filter(
                          (i) => (digest.follows.byOfficial[i.slug] ?? 0) > 0
                        )
                        .map(
                          (i) =>
                            `${digest.follows.byOfficial[i.slug]} for ${i.name}`
                        )
                        .join(", ")}
                    </>
                  )}
                  .{" "}
                  {digest.follows.excluded > 0
                    ? `${digest.follows.excluded} follower${
                        digest.follows.excluded === 1 ? "" : "s"
                      } of other officials excluded.`
                    : "No followers of other officials to exclude."}
                </p>
                {digest.lede ? (
                  <div className="border border-neutral-200 bg-stone-50 px-3 py-2">
                    <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-medium mb-1">
                      Lede (AI-drafted — review before sending)
                    </div>
                    <p className="text-xs text-neutral-700 leading-relaxed">
                      {digest.lede}
                    </p>
                    <p className="text-[10px] text-neutral-400 mt-1">
                      Regenerate: npx tsx scripts/generate-digest-lede.ts · Drop
                      it: delete data/meta/digest-lede.json (both need a
                      redeploy to take effect).
                    </p>
                  </div>
                ) : (
                  <p className="text-[11px] text-neutral-400">
                    No lede generated for this filing set. Optional: run
                    scripts/generate-digest-lede.ts locally and redeploy.
                  </p>
                )}
                {digest.draft.items.map((item) => (
                  <div
                    key={item.slug}
                    className="border-l-2 border-neutral-300 pl-3"
                  >
                    <div className="text-neutral-900 font-medium">
                      {item.name}{" "}
                      <span className="text-neutral-400 font-normal">
                        · {item.newCount.toLocaleString()} new trade
                        {item.newCount === 1 ? "" : "s"}
                      </span>
                    </div>
                    <div className="text-neutral-500 text-xs">
                      {item.title} · {item.agency}
                    </div>
                    <ul className="mt-1 text-xs text-neutral-600 space-y-0.5">
                      {item.trades.map((t, i) => (
                        <li key={i}>
                          <span
                            className={
                              t.type.startsWith("Sale")
                                ? "text-red-700"
                                : t.type === "Purchase"
                                  ? "text-emerald-700"
                                  : ""
                            }
                          >
                            {t.type}
                          </span>{" "}
                          {t.description}
                          {t.ticker &&
                          !t.description.includes(`(${t.ticker})`)
                            ? ` (${t.ticker})`
                            : ""}{" "}
                          — {t.amount}
                          {t.lateFilingFlag && (
                            <span className="ml-1 bg-amber-200 text-amber-900 px-1 text-[9px]">
                              LATE
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}

                {/* "Also filed recently" teaser — mirrors what the email
                    renders below the main sections, so the admin sees exactly
                    what recipients will. */}
                {digest.draft.alsoNew.length > 0 && (
                  <div className="pt-2 border-t border-neutral-200">
                    <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-medium mb-1">
                      Also filed in the last two weeks
                    </div>
                    <ul className="text-xs text-neutral-500 space-y-0.5">
                      {digest.draft.alsoNew.map((o) => (
                        <li key={o.slug}>
                          <Link
                            href={`/officials/${o.slug}`}
                            className="underline hover:text-neutral-900"
                          >
                            {o.name}
                          </Link>{" "}
                          –{" "}
                          {o.newTradeCount
                            ? `${o.newTradeCount.toLocaleString()} new trade${
                                o.newTradeCount === 1 ? "" : "s"
                              }, `
                            : ""}
                          posted {formatDate(o.postedDate)}
                        </li>
                      ))}
                    </ul>
                    <p className="text-[10px] text-neutral-400 mt-1">
                      Rendered below the main sections in the email, with a
                      follow-all CTA ({digest.draft.trackedOfficialCount}{" "}
                      officials tracked).
                    </p>
                  </div>
                )}

                {/* Test send: mails one copy to the admin. Consumes nothing —
                    no ledger, no run, no lastNotifiedAt bump. The select scopes
                    the PREVIEW to one official (a narrower digest); the real
                    send never content-filters. */}
                <div className="pt-2 border-t border-neutral-200 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={testOfficial}
                      onChange={(e) => onSetTestOfficial(e.target.value)}
                      disabled={testing}
                      aria-label="Test digest scope"
                      className="border border-neutral-300 text-neutral-700 px-2 py-1.5 text-xs bg-white cursor-pointer disabled:opacity-50"
                    >
                      <option value="">Full digest</option>
                      {digest.draft.items.map((item) => (
                        <option key={item.slug} value={item.slug}>
                          {item.name} only
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={onTest}
                      disabled={testing}
                      className="border border-neutral-300 text-neutral-700 px-3 py-1.5 text-xs hover:bg-neutral-100 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {testing ? "Sending test…" : "Send test to me"}
                    </button>
                    <span className="text-[10px] text-neutral-500">
                      Sends only to you. Does not mark filings as notified.
                    </span>
                  </div>
                  {testResult && <DigestTestReport result={testResult} />}
                </div>

                {/* Send flow: result -> two-step confirm -> button. Recipients
                    are chosen by follows server-side (no audience choice). */}
                <SendFlow
                  digest={digest}
                  confirming={confirming}
                  sending={sending}
                  result={result}
                  onSend={onSend}
                  onSetConfirming={onSetConfirming}
                />
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

/** The real-send controls: result panel, two-step confirm, or the Send button. */
function SendFlow({
  digest,
  confirming,
  sending,
  result,
  onSend,
  onSetConfirming,
}: {
  digest: DigestPreview;
  confirming: boolean;
  sending: boolean;
  result: DigestSendResult | null;
  onSend: () => void;
  onSetConfirming: (confirming: boolean) => void;
}) {
  // The count the real send actually reaches (follows-filtered).
  const targetCount = digest.follows.reached;

  return (
    <div className="pt-2 border-t border-neutral-200">
      {result ? (
        <DigestSendReport result={result} onRetry={onSend} sending={sending} />
      ) : confirming ? (
        <div className="flex items-center gap-3">
          <span className="text-xs text-neutral-700">
            Send to {targetCount} subscriber
            {targetCount === 1 ? "" : "s"} now?
          </span>
          <button
            type="button"
            onClick={onSend}
            disabled={sending}
            className="bg-neutral-900 text-white px-4 py-2 text-xs hover:bg-neutral-800 transition-colors cursor-pointer disabled:opacity-50"
          >
            {sending ? "Sending…" : "Confirm send"}
          </button>
          <button
            type="button"
            onClick={() => onSetConfirming(false)}
            disabled={sending}
            className="text-xs text-neutral-500 hover:text-neutral-900 cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => onSetConfirming(true)}
            disabled={targetCount === 0}
            title={
              targetCount === 0
                ? "No subscribers follow these officials yet."
                : undefined
            }
            className="bg-neutral-900 text-white px-4 py-2 text-xs hover:bg-neutral-800 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {digest.inFlightRun ? "Resume send" : "Send digest"}
          </button>
          {!digest.production && (
            <span className="text-[10px] text-amber-700">
              Non-production: the server refuses to send here.
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/** Post-send outcome: success summary, or a failure with an inline resume retry. */
function DigestSendReport({
  result,
  onRetry,
  sending,
}: {
  result: DigestSendResult;
  onRetry: () => void;
  sending: boolean;
}) {
  if (result.status === "sent") {
    return (
      <div className="text-xs">
        <p className="text-emerald-700 font-medium">
          Sent to {result.recipientCount} subscriber
          {result.recipientCount === 1 ? "" : "s"}
          {typeof result.filingCount === "number" &&
            ` · ${result.filingCount} filing${result.filingCount === 1 ? "" : "s"}`}
          .
        </p>
        {result.follows && (
          <p className="text-neutral-500 mt-0.5">
            {result.follows.allFollowers} follow all
            {result.follows.excluded > 0
              ? ` · ${result.follows.excluded} other-official follower${
                  result.follows.excluded === 1 ? "" : "s"
                } excluded`
              : ""}
            .
          </p>
        )}
        {result.warning && (
          <p className="text-amber-700 mt-1">{result.warning}</p>
        )}
      </div>
    );
  }

  if (result.status === "failed") {
    return (
      <div className="text-xs">
        <p className="text-red-700 font-medium">Send failed.</p>
        {result.error && <p className="text-red-700 mt-0.5">{result.error}</p>}
        {result.chunks && (
          <p className="text-neutral-500 mt-0.5">
            {result.chunks.ok}/{result.chunks.total} chunks delivered.
          </p>
        )}
        {result.retry && (
          <button
            type="button"
            onClick={onRetry}
            disabled={sending}
            className="mt-2 bg-neutral-900 text-white px-4 py-2 text-xs hover:bg-neutral-800 transition-colors cursor-pointer disabled:opacity-50"
          >
            {sending ? "Resuming…" : "Retry (resume)"}
          </button>
        )}
      </div>
    );
  }

  // already-sent / no-recipients / anything else with a message.
  return (
    <p className="text-xs text-neutral-600">
      {result.message || result.error || "Nothing to send."}
    </p>
  );
}

/** Outcome of a "Send test to me" click. No retry — a test is cheap; just click
 * the button again. */
function DigestTestReport({ result }: { result: DigestSendResult }) {
  if (result.status === "test-sent") {
    return (
      <p className="text-xs text-emerald-700">
        {result.onlyOfficial
          ? `Single-official preview sent to ${result.to}. `
          : `Test sent to ${result.to}. `}
        Check your inbox.
      </p>
    );
  }
  if (result.status === "test-empty") {
    return (
      <p className="text-xs text-neutral-600">
        {result.message || "Nothing to send — the draft is empty."}
      </p>
    );
  }
  // test-failed / anything else.
  return (
    <p className="text-xs text-red-700">{result.error || "Test send failed."}</p>
  );
}
