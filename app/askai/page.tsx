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
          Ask questions about the site&apos;s financial disclosure records. It is in a closed alpha: a few people are trying it
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

      <details className="mt-6 border-t border-neutral-200 pt-4 text-sm text-neutral-600 leading-relaxed">
        <summary className="cursor-pointer font-medium text-neutral-800">How Ask works and what gets logged</summary>
        <div className="mt-4 space-y-3">
          <p>An AI model interprets your question. Code checks that interpretation and calculates the answer from disclosure records that have completed the site’s verification process. Check the “Interpreted as” line to make sure it matches what you meant.</p>
          <p>These records report transactions and dollar ranges. They do not establish current holdings, profit, motive or legality. Each question stands alone; Ask does not remember earlier questions.</p>
          <p>Questions, their interpretations and outcomes are logged for review, along with a hashed address used for rate limiting. Do not enter personal information.</p>
          <p>Limits: {PER_IP_PER_HOUR} requests per hour per address and {GLOBAL_PER_DAY} new question translations per day across the site.</p>
          <p>Read the <Link href="/methodology" className="underline hover:text-neutral-900">data methodology</Link> for how records are checked.</p>
        </div>
      </details>
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
