import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { and, desc, eq, lt, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { askLog } from "@/lib/schema";
import { requireAdmin } from "@/lib/auth";
import evaluation from "@/data/evaluations/ask-latest.json";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Ask review", robots: { index: false, follow: false } };

const outcomes: Record<string, string> = {
  answered: "Answered",
  declined: "Outside supported questions",
  not_in_data: "No match or could not interpret",
  error: "Technical problem",
};

function explainReason(reason: string | null, status: string): string {
  if (reason?.startsWith("intent:")) return "A rule identified an unsupported request before calling AI.";
  if (reason === "planning timeout") return "The AI translation took too long.";
  if (status === "answered") return "The question was translated and a result was calculated. This alone does not prove correctness.";
  if (status === "not_in_data") return "No matching records were found, or the question could not be translated safely.";
  if (status === "declined") return "Ask explained that this request was outside what it can answer.";
  return "Open the technical details for the recorded reason.";
}

export default async function AskLogPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const host = (await headers()).get("host") ?? "";
  if (!/^(localhost|127\.0\.0\.1)(:\d{1,5})?$/i.test(host) && !(await requireAdmin())) notFound();
  const sp = await searchParams;
  const one = (key: string) => (Array.isArray(sp[key]) ? sp[key]![0] : sp[key]) ?? "";
  const status = Object.hasOwn(outcomes, one("status")) ? one("status") : "";
  const cursor = Number(one("before"));
  const before = Number.isSafeInteger(cursor) && cursor > 0 ? cursor : undefined;
  const db = getDb();
  const fetched = await db.select().from(askLog)
    .where(and(status ? eq(askLog.status, status) : undefined, before ? lt(askLog.id, before) : undefined))
    .orderBy(desc(askLog.id)).limit(51);
  const rows = fetched.slice(0, 50);
  const totals = await db.select({
    status: askLog.status,
    n: sql<number>`count(*)::int`,
    wrong: sql<number>`count(*) filter (where ${askLog.feedback} = 'wrong')::int`,
    right: sql<number>`count(*) filter (where ${askLog.feedback} = 'right')::int`,
  }).from(askLog).groupBy(askLog.status);
  const logged = totals.reduce((sum, row) => sum + row.n, 0);
  const feedback = totals.reduce((sum, row) => sum + row.right + row.wrong, 0);

  return (
    <section className="mx-auto max-w-5xl px-4 py-8 text-sm text-neutral-800">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
        <h1 className="font-[family-name:var(--font-source-serif)] text-3xl">Ask review</h1>
        <nav className="flex gap-4 text-sm underline" aria-label="Ask review links">
          <Link href="/admin">Admin home</Link><Link href="/askai">Try Ask</Link>
        </nav>
      </div>
      <p className="max-w-2xl text-neutral-600 mb-8">See what people asked, what Ask did, and what we learned from testing. Usage history and evaluated test results are different evidence.</p>

      <section className="rounded-lg border border-neutral-300 bg-neutral-50 p-5 mb-8" aria-labelledby="evaluation-title">
        <p className="text-xs uppercase tracking-wide text-neutral-500 mb-1">Latest evaluation · {evaluation.date}</p>
        <h2 id="evaluation-title" className="font-[family-name:var(--font-source-serif)] text-2xl mb-2">
          {evaluation.reviewed ? `${evaluation.passed} of ${evaluation.total} cases met their expected outcome` : "Evaluation in progress"}
        </h2>
        <p className="text-neutral-600 mb-3">{evaluation.environment}. A correct refusal or an honest no-match answer can pass. This is not an accuracy score for all possible questions.</p>
        {evaluation.reviewed && <>
          <div className="overflow-x-auto">
            <table className="table-fixed w-full text-xs sm:text-sm mb-4">
              <caption className="sr-only">Evaluation results by category</caption>
              <thead><tr className="text-left border-b border-neutral-300"><th className="w-1/2 py-2">Category</th><th className="w-1/4 py-2 px-2 text-right">Passed</th><th className="w-1/4 py-2 pl-2 text-right">Needs work</th></tr></thead>
              <tbody>{evaluation.categories.map((category: { name: string; passed: number; total: number; failed: number }) => (
                <tr key={category.name} className="border-b border-neutral-200"><td className="py-2">{category.name}</td><td className="px-2 text-right tabular-nums">{category.passed} / {category.total}</td><td className="pl-2 text-right tabular-nums">{category.failed}</td></tr>
              ))}</tbody>
            </table>
          </div>
          <details className="mb-4">
            <summary className="cursor-pointer font-medium">Examples and limitations from this evaluation</summary>
            <div className="mt-3 space-y-4">{evaluation.examples.map((example: { question: string; answer: string; verdict: string }) => (
              <article key={example.question} className="border-l-2 border-neutral-300 pl-3"><h3 className="font-medium">{example.question}</h3><p className="mt-1">{example.answer}</p><p className="text-xs text-neutral-600 mt-1">Review: {example.verdict}</p></article>
            ))}</div>
          </details>
        </>}
        <ul className="list-disc pl-5 space-y-2 text-sm text-neutral-600">{evaluation.notes.map((note) => <li key={note}>{note}</li>)}</ul>
        <p className="mt-4 text-xs text-neutral-500">Separate release check: 50 questions tested through the live website on September 8, 2026. That run found and corrected leftover verification jargon in empty answers.</p>
      </section>

      <section aria-labelledby="history-title">
        <h2 id="history-title" className="font-[family-name:var(--font-source-serif)] text-2xl mb-2">Question history</h2>
        <p className="text-neutral-600 mb-4">{logged.toLocaleString()} logged requests · {feedback.toLocaleString()} reader feedback marks. Includes development tests and older versions. These totals do not measure accuracy.</p>
        <div className="flex flex-wrap gap-2 mb-5" aria-label="Filter question outcomes">
          <Link href="/admin/askai" aria-current={!status ? "page" : undefined} className={`rounded border px-3 py-2 ${!status ? "bg-neutral-900 text-white" : "border-neutral-300"}`}>All outcomes</Link>
          {totals.map((total) => <Link key={total.status} href={`/admin/askai?status=${encodeURIComponent(total.status)}`} aria-current={status === total.status ? "page" : undefined} className={`rounded border px-3 py-2 ${status === total.status ? "bg-neutral-900 text-white" : "border-neutral-300"}`}>{outcomes[total.status] ?? total.status} · {total.n}</Link>)}
        </div>
        <p className="text-xs text-neutral-500 mb-4">History stores the question, outcome, filters and feedback—not the exact answer text. Some requests rejected before processing, including rate-limit failures, are not recorded here. Times below are UTC.</p>
        {rows.length === 0 && <p className="rounded border border-neutral-200 p-4">No logged questions match this view.</p>}
        <ol className="divide-y divide-neutral-200">
          {rows.map((row) => <li key={row.id} className="py-5">
            <div className="flex flex-wrap justify-between gap-2 mb-2">
              <span className={`text-xs rounded px-2 py-1 ${row.status === "error" ? "bg-red-50 text-red-800" : "bg-neutral-100 text-neutral-700"}`}>{outcomes[row.status] ?? row.status}</span>
              <time dateTime={row.at.toISOString()} className="text-xs text-neutral-500">{row.at.toISOString().slice(0, 16).replace("T", " ")} UTC · #{row.id}</time>
            </div>
            <h3 className="font-medium text-base break-words">{row.question}</h3>
            <p className="text-neutral-600 mt-1">{explainReason(row.reason, row.status)}</p>
            <p className="text-xs text-neutral-500 mt-2">
              {row.matchedRows !== null && <span>{row.matchedRows.toLocaleString()} matching trades · </span>}
              {row.durationMs !== null && <span>{(row.durationMs / 1000).toFixed(2)} s processing · </span>}
              {row.feedback ? `Reader marked ${row.feedback === "right" ? "correct" : "incorrect"}` : "No reader verdict"}
            </p>
            {row.feedbackReason && <p className="mt-2 text-sm">Reader note: {row.feedbackReason}</p>}
            <details className="mt-3 text-xs">
              <summary className="cursor-pointer text-neutral-600">Technical details</summary>
              <p className="mt-2 break-all">Recorded reason: {row.reason || "No separate reason recorded"}</p>
              <pre className="mt-2 whitespace-pre-wrap break-all rounded bg-neutral-50 p-3">{row.plan || "No query plan recorded."}</pre>
            </details>
          </li>)}
        </ol>
        <nav aria-label="Question history pages" className="flex justify-between gap-4 border-t border-neutral-300 pt-4">
          <Link className="underline" href={status ? `/admin/askai?status=${status}` : "/admin/askai"}>Newest questions</Link>
          {fetched.length > 50 && <Link className="underline" href={`/admin/askai?before=${rows.at(-1)!.id}${status ? `&status=${status}` : ""}`}>Older questions</Link>}
        </nav>
      </section>
    </section>
  );
}
