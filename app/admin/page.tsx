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

  const ADMIN_EMAIL = "trevorbrown.web@gmail.com";
  const isAdmin = session?.user?.email === ADMIN_EMAIL;

  const fetchData = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    try {
      const [pipelineRes, reviewRes] = await Promise.all([
        fetch("/api/admin/pipeline"),
        fetch("/api/admin/review"),
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
    } catch (err) {
      console.error("Failed to fetch admin data:", err);
    }
    setLoading(false);
  }, [isAdmin]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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

      {/* Pipeline Status */}
      <section className="mb-12">
        <h2 className="text-xs uppercase tracking-wider text-neutral-500 font-medium mb-4">
          Pipeline Status
        </h2>
        <div className="bg-stone-50 border border-neutral-200 p-4 mb-4 text-sm">
          <p className="text-neutral-600 mb-2">
            Run the pipeline locally:
          </p>
          <code className="text-xs font-[family-name:var(--font-dm-mono)] bg-neutral-200 px-2 py-1">
            pnpm run pipeline
          </code>
          <span className="text-xs text-neutral-400 ml-2">
            or with --dry-run / --verify
          </span>
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
            href="/download"
            className="border border-neutral-200 px-4 py-3 text-sm hover:bg-neutral-50 transition-colors"
          >
            Data exports
          </Link>
          <a
            href="https://github.com/tbrown034/open-cabinet/actions"
            className="border border-neutral-200 px-4 py-3 text-sm hover:bg-neutral-50 transition-colors"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub Actions
          </a>
          <a
            href="https://console.anthropic.com"
            className="border border-neutral-200 px-4 py-3 text-sm hover:bg-neutral-50 transition-colors"
            target="_blank"
            rel="noopener noreferrer"
          >
            API Credits
          </a>
        </div>
      </section>
    </div>
  );
}
