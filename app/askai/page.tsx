import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { ASKAI_COOKIE, askaiEnabled, hasAskaiAccess } from "@/lib/askai-access";
import { getPublishedRows } from "@/lib/published-rows";
import { GLOBAL_PER_DAY, PER_IP_PER_HOUR } from "@/lib/ask/limits";
import AskTheData from "../components/ask-the-data";
import { enterAskai, leaveAskai } from "./actions";

/**
 * /askai: the "Ask the data" box, in a closed alpha behind one shared
 * password. Not in the nav, not indexed. The page explains, in plain words,
 * what the box does with a question and what it will not do, because a
 * reader of a journalism site should never have to guess where a number
 * came from.
 */
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Ask the data (alpha)",
  description: "Closed alpha of a question box over Open Cabinet's verified rows.",
  robots: { index: false, follow: false },
};

export default async function AskaiPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const wrong = sp.error === "1";
  const throttled = sp.error === "2";
  const jar = await cookies();
  const open = hasAskaiAccess(jar.get(ASKAI_COOKIE)?.value);

  if (!askaiEnabled()) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <Badge />
        <h1 className="font-[family-name:var(--font-source-serif)] text-4xl text-neutral-900 mb-4">Ask the data</h1>
        <p className="text-neutral-600">This alpha is closed right now.</p>
      </div>
    );
  }

  if (!open) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <Badge />
        <h1 className="font-[family-name:var(--font-source-serif)] text-4xl text-neutral-900 mb-4">Ask the data</h1>
        <p className="text-neutral-600 mb-6 leading-relaxed">
          A question box over the site&apos;s checked trade rows. It is in a closed alpha: a few people are trying it
          and every question is logged for review. Enter the access password to continue.
        </p>
        <form action={enterAskai} className="flex flex-col sm:flex-row gap-2 max-w-md">
          <input
            type="password"
            name="password"
            autoComplete="off"
            required
            aria-label="Access password"
            placeholder="Access password"
            className="flex-1 border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:border-neutral-900"
          />
          <button type="submit" className="bg-neutral-900 text-white text-sm font-medium px-5 py-2 hover:bg-neutral-700">
            Enter
          </button>
        </form>
        {wrong && <p role="alert" className="text-sm text-red-700 mt-3">That password did not match.</p>}
        {throttled && <p role="alert" className="text-sm text-red-700 mt-3">Too many attempts from this address. Try again in an hour.</p>}
        <p className="text-xs text-neutral-400 mt-8">
          No account is created. Every question you ask is stored with its outcome, the query the code ran, and a
          truncated hash of your address used for rate limiting. Do not put personal information in a question.
        </p>
      </div>
    );
  }

  const published = await getPublishedRows();

  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <Badge />
          <p className="text-sm text-neutral-500">Closed alpha. Every question is logged for review.</p>
        </div>
        <form action={leaveAskai}>
          <button type="submit" className="text-xs text-neutral-500 underline hover:text-neutral-900">Leave alpha</button>
        </form>
      </div>

      <AskTheData checkedCount={published.summary.checked} parsedCount={published.summary.parsed} />

      <section className="mt-12 border-t border-neutral-200 pt-8 text-sm text-neutral-700 leading-relaxed">
        <h2 className="font-[family-name:var(--font-source-serif)] text-2xl text-neutral-900 mb-4">What happens to your question</h2>
        <ol className="list-decimal pl-5 space-y-3">
          <li>
            <strong>A filter reads it first.</strong> Instructions, requests for opinions, and questions that are not about
            these records are declined before anything is spent.
          </li>
          <li>
            <strong>An AI model turns the question into a query.</strong> It fills in a fixed form: which officials, which
            symbol or words, which trade types, which dates, late or not, and one of a short list of counts. It never sees a
            trade row and it is never asked for a fact. If the question does not fit the form, it must decline rather than
            approximate.
          </li>
          <li>
            <strong>Code checks the form.</strong> Every name must be someone the site tracks. Every field must be on the
            allowed list. Anything else ends the request with an honest &quot;not in this data.&quot;
          </li>
          <li>
            <strong>Code runs the query and produces every number.</strong> Only checked rows count: rows an independent
            program or a second company&apos;s model agreed with and a third company&apos;s model confirmed against the page.
            Today that is {published.summary.checked.toLocaleString()} of {published.summary.parsed.toLocaleString()} rows.
          </li>
          <li>
            <strong>Code writes the sentence.</strong> In this alpha the answer sentence is a fixed template filled from
            the computed result. The model writes nothing you read. (A model-written sentence exists behind a switch and is
            off: the check that every number in it matched a computed figure was shown on Sept. 7 to be too loose.)
          </li>
          <li>
            <strong>You see the query, the rows and the source filings.</strong> The restated query sits above the answer so
            you can tell whether it asked what you meant. Rows link to the official&apos;s page and the 278-T.
          </li>
        </ol>

        <h2 className="font-[family-name:var(--font-source-serif)] text-2xl text-neutral-900 mt-10 mb-4">What it will not do</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li>Say whether a trade was legal, proper or suspicious.</li>
          <li>Compute averages, ratios or growth. Only the counts and sums the code supports.</li>
          <li>Answer about anyone the site does not track, or from rows that have not been checked.</li>
          <li>Give exact dollar amounts. Filings report ranges, and the box repeats the range.</li>
          <li>Remember you. Each question stands alone.</li>
        </ul>

        <h2 className="font-[family-name:var(--font-source-serif)] text-2xl text-neutral-900 mt-10 mb-4">Limits and logging</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li>{PER_IP_PER_HOUR} questions an hour per address, {GLOBAL_PER_DAY} a day for the whole site, counted in the database before any model call.</li>
          <li>Each question, its outcome, the query the code ran and how long it took are logged so a person can review what was asked and what was declined.</li>
          <li>Questions only reach the model from this site&apos;s own pages.</li>
        </ul>

        <p className="text-xs text-neutral-400 mt-10">
          Alpha build. Wording and limits will change. Method for the underlying rows:{" "}
          <Link href="/methodology" className="underline hover:text-neutral-600">methodology</Link>.
        </p>
      </section>
    </div>
  );
}

function Badge() {
  return (
    <span className="inline-block border border-amber-700 text-amber-800 text-[11px] uppercase tracking-wider px-2 py-0.5 mb-3">
      Alpha build
    </span>
  );
}
