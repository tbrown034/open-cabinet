"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useSession, signIn, signOut } from "@/lib/auth-client";

interface PipelineRun {
  id: number;
  ranAt: string;
  trigger: string;
  status: string;
  newFilingsFound: number;
  newTransactionsParsed: number;
  errors: any;
  tokenUsage: any;
  duration: number;
  completedAt: string | null;
}

interface ReviewItem {
  id: number;
  description: string;
  ticker: string | null;
  type: string;
  date: string;
  amount: string;
  confidence: number | null;
  pdfSource: string | null;
  officialName: string;
  officialSlug: string;
}

export default function AdminPage() {
  const { data: session, isPending } = useSession();
  const [runs, setRuns] = useState<PipelineRun[]>([]);
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([]);
  const [reviewCount, setReviewCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [validationReport, setValidationReport] = useState<any>(null);
  const [validating, setValidating] = useState(false);
  const [stats, setStats] = useState<{
    officials: number;
    transactions: number;
    newsArticles: number;
    needsReview: number;
    totalPipelineCost: number;
    lastPipelineRun: PipelineRun | null;
  } | null>(null);

  const ADMIN_EMAIL = "trevorbrown.web@gmail.com";
  const isAdmin = session?.user?.email === ADMIN_EMAIL;

  const fetchData = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    try {
      const [pipelineRes, reviewRes, statsRes] = await Promise.all([
        fetch("/api/admin/pipeline"),
        fetch("/api/admin/review"),
        fetch("/api/admin/stats"),
      ]);
      if (pipelineRes.ok) {
        const data = await pipelineRes.json();
        setRuns(data.runs || []);
      }
      if (reviewRes.ok) {
        const data = await reviewRes.json();
        setReviewItems(data.items || []);
        setReviewCount(data.count || 0);
      }
      if (statsRes.ok) {
        setStats(await statsRes.json());
      }
    } catch (err) {
      console.error("Failed to fetch admin data:", err);
    }
    setLoading(false);
  }, [isAdmin]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function runCronCheck() {
    setValidating(true);
    try {
      const secret = prompt("Enter CRON_SECRET to trigger a check:");
      if (!secret) { setValidating(false); return; }
      const res = await fetch("/api/cron", {
        headers: { Authorization: `Bearer ${secret}` },
      });
      const data = await res.json();
      setValidationReport({
        ...data,
        result: res.ok ? "PASS" : "FAIL",
        checks: { totalOgeRecords: data.totalOgeRecords || 0 },
        totalIssues: res.ok ? 0 : 1,
        transactions: data.totalOgeRecords,
        officials: "-",
        needsReview: "-",
      });
    } catch (err) {
      setValidationReport({ result: "FAIL", totalIssues: 1, checks: { error: (err as Error).message } });
    }
    setValidating(false);
  }

  async function runValidation() {
    setValidating(true);
    try {
      const res = await fetch("/api/admin/validate", { method: "POST" });
      if (res.ok) {
        setValidationReport(await res.json());
      }
    } catch (err) {
      console.error("Validation failed:", err);
    }
    setValidating(false);
  }

  async function handleReview(id: number, action: "approve" | "delete") {
    const res = await fetch("/api/admin/review", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action }),
    });
    if (res.ok) {
      setReviewItems((prev) => prev.filter((item) => item.id !== id));
      setReviewCount((prev) => prev - 1);
    }
  }

  if (isPending) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center text-neutral-500 text-sm">
        Loading...
      </div>
    );
  }

  if (!session) {
    return (
      <div className="mx-auto max-w-md px-4 py-16">
        <h1 className="font-[family-name:var(--font-source-serif)] text-3xl text-neutral-900 mb-6">
          Admin
        </h1>
        <p className="text-neutral-500 text-sm mb-8">
          Sign in with Google to access the admin panel.
        </p>
        <button
          onClick={async () => {
            const res = await signIn.social({
              provider: "google",
              callbackURL: "/admin",
            });
            const url = res?.data?.url;
            if (url && typeof url === "string" && url.startsWith("http")) {
              window.location.href = url;
            }
          }}
          className="bg-neutral-900 text-white px-6 py-2.5 text-sm hover:bg-neutral-800 transition-colors cursor-pointer"
        >
          Sign in with Google
        </button>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-md px-4 py-16">
        <h1 className="font-[family-name:var(--font-source-serif)] text-3xl text-neutral-900 mb-4">
          Unauthorized
        </h1>
        <p className="text-neutral-500 text-sm mb-6">
          {session.user?.email} is not an authorized admin.
        </p>
        <button
          onClick={() => signOut()}
          className="text-sm text-neutral-500 hover:text-neutral-900 cursor-pointer"
        >
          Sign out
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-16">
      <div className="flex items-center justify-between mb-10">
        <div>
          <h1 className="font-[family-name:var(--font-source-serif)] text-3xl text-neutral-900">
            Admin
          </h1>
          <p className="text-xs text-neutral-400 mt-1">
            {session.user?.email}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={fetchData}
            disabled={loading}
            className="text-xs text-neutral-500 hover:text-neutral-900 cursor-pointer"
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
          <button
            onClick={() => signOut()}
            className="text-xs text-neutral-500 hover:text-neutral-900 cursor-pointer"
          >
            Sign out
          </button>
        </div>
      </div>

      {/* Database Stats */}
      {stats && (
        <section className="mb-12">
          <h2 className="text-xs uppercase tracking-wider text-neutral-500 font-medium mb-4">
            Database
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="border border-neutral-200 px-4 py-3">
              <div className="text-2xl font-semibold font-[family-name:var(--font-dm-mono)] text-neutral-900">
                {stats.officials}
              </div>
              <div className="text-xs text-neutral-500">officials</div>
            </div>
            <div className="border border-neutral-200 px-4 py-3">
              <div className="text-2xl font-semibold font-[family-name:var(--font-dm-mono)] text-neutral-900">
                {stats.transactions.toLocaleString()}
              </div>
              <div className="text-xs text-neutral-500">transactions</div>
            </div>
            <div className="border border-neutral-200 px-4 py-3">
              <div className="text-2xl font-semibold font-[family-name:var(--font-dm-mono)] text-neutral-900">
                {stats.newsArticles}
              </div>
              <div className="text-xs text-neutral-500">news articles</div>
            </div>
            <div className="border border-neutral-200 px-4 py-3">
              <div className={`text-2xl font-semibold font-[family-name:var(--font-dm-mono)] ${stats.needsReview > 0 ? "text-amber-700" : "text-neutral-900"}`}>
                {stats.needsReview}
              </div>
              <div className="text-xs text-neutral-500">needs review</div>
            </div>
            <div className="border border-neutral-200 px-4 py-3">
              <div className="text-2xl font-semibold font-[family-name:var(--font-dm-mono)] text-neutral-900">
                ${stats.totalPipelineCost.toFixed(2)}
              </div>
              <div className="text-xs text-neutral-500">pipeline cost</div>
            </div>
          </div>
        </section>
      )}

      {/* Pipeline Status */}
      <section className="mb-12">
        <h2 className="text-xs uppercase tracking-wider text-neutral-500 font-medium mb-4">
          Pipeline Status
        </h2>
        <div className="bg-stone-50 border border-neutral-200 p-4 mb-4 text-sm space-y-3">
          <div>
            <div className="text-neutral-900 font-medium text-xs mb-1">Automated</div>
            <p className="text-neutral-500 text-xs">
              Runs weekly (Monday 6 AM ET) via Vercel Cron. Can also be triggered from the{" "}
              <a href="https://vercel.com/tbrown034s-projects/open-cabinet/settings/cron-jobs" className="underline hover:text-neutral-900" target="_blank" rel="noopener noreferrer">Vercel dashboard</a>{" "}
              or locally with the commands below.
            </p>
          </div>
          <div>
            <div className="text-neutral-900 font-medium text-xs mb-1">Manual (local)</div>
            <div className="flex flex-wrap gap-2">
              <code className="text-[11px] font-[family-name:var(--font-dm-mono)] bg-neutral-200 px-2 py-1">pnpm run pipeline</code>
              <code className="text-[11px] font-[family-name:var(--font-dm-mono)] bg-neutral-200 px-2 py-1">pnpm run pipeline -- --dry-run</code>
              <code className="text-[11px] font-[family-name:var(--font-dm-mono)] bg-neutral-200 px-2 py-1">pnpm run pipeline -- --verify</code>
            </div>
          </div>
          <div>
            <div className="text-neutral-900 font-medium text-xs mb-1">Other commands</div>
            <div className="flex flex-wrap gap-2">
              <code className="text-[11px] font-[family-name:var(--font-dm-mono)] bg-neutral-200 px-2 py-1">pnpm run validate</code>
              <code className="text-[11px] font-[family-name:var(--font-dm-mono)] bg-neutral-200 px-2 py-1">pnpm run check-news</code>
              <code className="text-[11px] font-[family-name:var(--font-dm-mono)] bg-neutral-200 px-2 py-1">pnpm run parse-pdf &lt;file&gt;</code>
            </div>
          </div>
        </div>

        {runs.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b border-neutral-900 text-xs uppercase tracking-wider text-neutral-500">
                  <th className="pb-2 pr-3 font-medium">#</th>
                  <th className="pb-2 pr-3 font-medium">When</th>
                  <th className="pb-2 pr-3 font-medium">Status</th>
                  <th className="pb-2 pr-3 font-medium text-right">
                    New filings
                  </th>
                  <th className="pb-2 pr-3 font-medium text-right">
                    Transactions
                  </th>
                  <th className="pb-2 pr-3 font-medium text-right">Cost</th>
                  <th className="pb-2 font-medium text-right">Duration</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr
                    key={run.id}
                    className="border-b border-neutral-100"
                  >
                    <td className="py-2 pr-3 font-[family-name:var(--font-dm-mono)] text-neutral-400">
                      {run.id}
                    </td>
                    <td className="py-2 pr-3 text-neutral-600">
                      {new Date(run.ranAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="py-2 pr-3">
                      <span
                        className={`text-xs font-medium ${
                          run.status === "completed"
                            ? "text-emerald-700"
                            : run.status === "running"
                            ? "text-amber-700"
                            : "text-red-700"
                        }`}
                      >
                        {run.status}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {run.newFilingsFound}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {run.newTransactionsParsed}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums font-[family-name:var(--font-dm-mono)] text-neutral-500">
                      {run.tokenUsage
                        ? `$${(run.tokenUsage as any).costUsd?.toFixed(3) || "0"}`
                        : "—"}
                    </td>
                    <td className="py-2 text-right tabular-nums text-neutral-500">
                      {run.duration
                        ? `${(run.duration / 1000).toFixed(0)}s`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-neutral-400">
            No pipeline runs yet. Run{" "}
            <code className="font-[family-name:var(--font-dm-mono)] bg-neutral-100 px-1">
              pnpm run pipeline
            </code>{" "}
            to start.
          </p>
        )}
      </section>

      {/* Review Queue */}
      <section className="mb-12">
        <h2 className="text-xs uppercase tracking-wider text-neutral-500 font-medium mb-4">
          Review Queue
          {reviewCount > 0 && (
            <span className="ml-2 bg-amber-100 text-amber-800 px-2 py-0.5 rounded-sm text-[10px]">
              {reviewCount}
            </span>
          )}
        </h2>

        {reviewItems.length > 0 ? (
          <div className="space-y-3">
            {reviewItems.map((item) => (
              <div
                key={item.id}
                className="border border-neutral-200 px-4 py-3 text-sm"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="font-medium text-neutral-900 truncate">
                      {item.description}
                    </div>
                    <div className="text-xs text-neutral-400 mt-0.5">
                      {item.officialName} · {item.date} · {item.type} ·{" "}
                      {item.amount}
                      {item.confidence !== null && (
                        <span
                          className={
                            item.confidence < 0.8
                              ? "text-amber-700 ml-1"
                              : "text-neutral-400 ml-1"
                          }
                        >
                          conf: {item.confidence}
                        </span>
                      )}
                    </div>
                    {item.pdfSource && (
                      <a
                        href={item.pdfSource}
                        className="text-[10px] text-neutral-400 hover:text-neutral-600 underline mt-0.5 block"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        View source PDF
                      </a>
                    )}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => handleReview(item.id, "approve")}
                      className="text-xs text-emerald-700 hover:text-emerald-900 cursor-pointer"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => handleReview(item.id, "delete")}
                      className="text-xs text-red-700 hover:text-red-900 cursor-pointer"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-neutral-400">
            No transactions need review.
          </p>
        )}
      </section>

      {/* Data Validation */}
      <section className="mb-12">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs uppercase tracking-wider text-neutral-500 font-medium">
            Data Validation
          </h2>
          <div className="flex gap-2">
            <button
              onClick={runValidation}
              disabled={validating}
              className="text-xs bg-neutral-900 text-white px-3 py-1.5 hover:bg-neutral-800 transition-colors cursor-pointer disabled:opacity-50"
            >
              {validating ? "Running..." : "Run Validation"}
            </button>
            <button
              onClick={runCronCheck}
              disabled={validating}
              className="text-xs border border-neutral-300 text-neutral-700 px-3 py-1.5 hover:bg-neutral-50 transition-colors cursor-pointer disabled:opacity-50"
            >
              Check OGE
            </button>
          </div>
        </div>
        {validationReport ? (
          <div className={`border px-4 py-3 text-sm ${validationReport.result === "PASS" ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}`}>
            <div className="flex items-center gap-2 mb-2">
              <span className={`font-medium ${validationReport.result === "PASS" ? "text-emerald-700" : "text-red-700"}`}>
                {validationReport.result}
              </span>
              <span className="text-xs text-neutral-400">{validationReport.duration}</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div>Officials: {validationReport.officials}</div>
              <div>Transactions: {validationReport.transactions}</div>
              <div>Needs review: {validationReport.needsReview}</div>
              <div>Issues: {validationReport.totalIssues}</div>
            </div>
            {validationReport.totalIssues > 0 && (
              <div className="mt-2 text-xs text-red-700">
                {Object.entries(validationReport.checks)
                  .filter(([, v]) => (v as number) > 0)
                  .map(([k, v]) => `${k}: ${v}`)
                  .join(" | ")}
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-neutral-400">
            Click {"\""}Run Validation{"\""} to check data integrity.
          </p>
        )}
      </section>

      {/* Quick Links */}
      <section>
        <h2 className="text-xs uppercase tracking-wider text-neutral-500 font-medium mb-4">
          Quick Links
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Link
            href="/"
            className="border border-neutral-200 px-4 py-3 text-sm hover:bg-neutral-50 transition-colors"
          >
            Directory
          </Link>
          <Link
            href="/late-filings"
            className="border border-neutral-200 px-4 py-3 text-sm hover:bg-neutral-50 transition-colors"
          >
            Late Filings
          </Link>
          <Link
            href="/download"
            className="border border-neutral-200 px-4 py-3 text-sm hover:bg-neutral-50 transition-colors"
          >
            Data exports
          </Link>
          <a
            href="https://vercel.com/tbrown034s-projects/open-cabinet/settings/cron-jobs"
            className="border border-neutral-200 px-4 py-3 text-sm hover:bg-neutral-50 transition-colors"
            target="_blank"
            rel="noopener noreferrer"
          >
            Vercel Cron
          </a>
          <a
            href="https://console.anthropic.com"
            className="border border-neutral-200 px-4 py-3 text-sm hover:bg-neutral-50 transition-colors"
            target="_blank"
            rel="noopener noreferrer"
          >
            Anthropic Console
          </a>
          <a
            href="https://platform.openai.com/usage"
            className="border border-neutral-200 px-4 py-3 text-sm hover:bg-neutral-50 transition-colors"
            target="_blank"
            rel="noopener noreferrer"
          >
            OpenAI Dashboard
          </a>
          <a
            href="https://console.neon.tech"
            className="border border-neutral-200 px-4 py-3 text-sm hover:bg-neutral-50 transition-colors"
            target="_blank"
            rel="noopener noreferrer"
          >
            Neon Database
          </a>
        </div>
      </section>
      {/* Models */}
      <section className="mt-10">
        <h2 className="text-xs uppercase tracking-wider text-neutral-500 font-medium mb-4">
          Models in Use
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b border-neutral-300 text-xs uppercase tracking-wider text-neutral-500">
                <th className="pb-2 pr-3 font-medium">Model</th>
                <th className="pb-2 pr-3 font-medium">Provider</th>
                <th className="pb-2 pr-3 font-medium">Role</th>
                <th className="pb-2 pr-3 font-medium text-right">Input</th>
                <th className="pb-2 font-medium text-right">Output</th>
              </tr>
            </thead>
            <tbody className="text-neutral-600">
              <tr className="border-b border-neutral-100">
                <td className="py-2 pr-3 font-[family-name:var(--font-dm-mono)] text-neutral-900">claude-sonnet-4-6</td>
                <td className="py-2 pr-3">Anthropic</td>
                <td className="py-2 pr-3">Default parser</td>
                <td className="py-2 pr-3 text-right tabular-nums">$3/M</td>
                <td className="py-2 text-right tabular-nums">$15/M</td>
              </tr>
              <tr className="border-b border-neutral-100">
                <td className="py-2 pr-3 font-[family-name:var(--font-dm-mono)] text-neutral-900">claude-haiku-4-5</td>
                <td className="py-2 pr-3">Anthropic</td>
                <td className="py-2 pr-3">Budget option</td>
                <td className="py-2 pr-3 text-right tabular-nums">$1/M</td>
                <td className="py-2 text-right tabular-nums">$5/M</td>
              </tr>
              <tr className="border-b border-neutral-100">
                <td className="py-2 pr-3 font-[family-name:var(--font-dm-mono)] text-neutral-900">claude-opus-4-6</td>
                <td className="py-2 pr-3">Anthropic</td>
                <td className="py-2 pr-3">Verification</td>
                <td className="py-2 pr-3 text-right tabular-nums">$5/M</td>
                <td className="py-2 text-right tabular-nums">$25/M</td>
              </tr>
              <tr className="border-b border-neutral-100">
                <td className="py-2 pr-3 font-[family-name:var(--font-dm-mono)] text-neutral-900">gpt-5.4-mini</td>
                <td className="py-2 pr-3">OpenAI</td>
                <td className="py-2 pr-3">Cross-provider verify</td>
                <td className="py-2 pr-3 text-right tabular-nums">$0.75/M</td>
                <td className="py-2 text-right tabular-nums">$4.50/M</td>
              </tr>
              <tr className="border-b border-neutral-100">
                <td className="py-2 pr-3 font-[family-name:var(--font-dm-mono)] text-neutral-900">gpt-5.4-nano</td>
                <td className="py-2 pr-3">OpenAI</td>
                <td className="py-2 pr-3">Cheapest fallback</td>
                <td className="py-2 pr-3 text-right tabular-nums">$0.20/M</td>
                <td className="py-2 text-right tabular-nums">$1.25/M</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-xs text-neutral-400 mt-3">
          Batch API: 50% discount on both providers. Per-PDF cost: ~$0.01
          (Haiku) to ~$0.06 (Opus). Change default in scripts/parse-pdf.ts.
        </p>
      </section>
    </div>
  );
}
