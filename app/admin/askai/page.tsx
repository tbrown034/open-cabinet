import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { desc, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { askLog } from "@/lib/schema";
import { requireAdmin } from "@/lib/auth";

/**
 * Admin: what people asked the box, what it did, and what they said back.
 * Reads ask_log. Open locally, or to the signed-in admin in production.
 */
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Ask log", robots: { index: false, follow: false } };

async function allowed(): Promise<boolean> {
  const host = (await headers()).get("host") ?? "";
  if (/^(localhost|127\.0\.0\.1)(:\d{1,5})?$/i.test(host)) return true;
  return (await requireAdmin()) !== null;
}

export default async function AskLogPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!(await allowed())) notFound();
  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : sp[k]) ?? "";
  const status = one("status");
  const limit = Math.min(500, Math.max(20, Number(one("limit")) || 200));

  const rows = await getDb()
    .select()
    .from(askLog)
    .where(status ? sql`${askLog.status} = ${status}` : sql`true`)
    .orderBy(desc(askLog.id))
    .limit(limit);
  const totals = await getDb()
    .select({ status: askLog.status, n: sql<number>`count(*)::int`, wrong: sql<number>`count(*) filter (where ${askLog.feedback} = 'wrong')::int`, right: sql<number>`count(*) filter (where ${askLog.feedback} = 'right')::int`, ms: sql<number>`coalesce(percentile_cont(0.5) within group (order by ${askLog.durationMs}), 0)::int` })
    .from(askLog)
    .groupBy(askLog.status);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 text-sm">
      <h1 className="font-[family-name:var(--font-source-serif)] text-2xl mb-1">Ask log</h1>
      <p className="text-neutral-500 mb-4">Every question the box received, newest first. Reasons are the code&rsquo;s own: which rule declined, why a plan did not translate, or where the plan came from.</p>

      <table className="text-xs mb-6">
        <thead><tr className="text-left text-neutral-500"><th className="pr-4 pb-1">Outcome</th><th className="pr-4 pb-1 text-right">Questions</th><th className="pr-4 pb-1 text-right">Said right</th><th className="pr-4 pb-1 text-right">Said wrong</th><th className="pb-1 text-right">Median ms</th></tr></thead>
        <tbody>
          {totals.map((t) => (
            <tr key={t.status}><td className="pr-4"><Link className="underline" href={`/admin/askai?status=${t.status}`}>{t.status}</Link></td><td className="pr-4 text-right tabular-nums">{t.n}</td><td className="pr-4 text-right tabular-nums">{t.right}</td><td className="pr-4 text-right tabular-nums text-red-700">{t.wrong}</td><td className="text-right tabular-nums">{t.ms}</td></tr>
          ))}
        </tbody>
      </table>
      {status && <p className="text-xs mb-3"><Link className="underline" href="/admin/askai">all outcomes</Link></p>}

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-neutral-500 border-b border-neutral-300">
              <th className="pr-3 pb-1">When</th><th className="pr-3 pb-1">Question</th><th className="pr-3 pb-1">Outcome</th><th className="pr-3 pb-1">Reason / source</th><th className="pr-3 pb-1 text-right">Rows</th><th className="pr-3 pb-1 text-right">ms</th><th className="pr-3 pb-1">Feedback</th><th className="pb-1">Plan</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-neutral-100 align-top">
                <td className="pr-3 py-1 whitespace-nowrap text-neutral-500">{r.at.toISOString().slice(0, 16).replace("T", " ")}</td>
                <td className="pr-3 py-1 max-w-xs">{r.question}</td>
                <td className="pr-3 py-1">{r.status}</td>
                <td className="pr-3 py-1 max-w-xs text-neutral-600">{r.reason}</td>
                <td className="pr-3 py-1 text-right tabular-nums">{r.matchedRows ?? ""}</td>
                <td className="pr-3 py-1 text-right tabular-nums">{r.durationMs ?? ""}</td>
                <td className="pr-3 py-1">{r.feedback ? <span className={r.feedback === "wrong" ? "text-red-700" : "text-emerald-700"}>{r.feedback}{r.feedbackReason ? `: ${r.feedbackReason}` : ""}</span> : ""}</td>
                <td className="py-1 font-[family-name:var(--font-dm-mono)] text-[10px] text-neutral-500 max-w-sm break-all">{r.plan ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-neutral-400 mt-4">Showing {rows.length}. <Link className="underline" href={`/admin/askai?limit=${limit + 200}${status ? `&status=${status}` : ""}`}>More</Link></p>
    </main>
  );
}
