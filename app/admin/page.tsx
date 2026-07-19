"use client";

import { useReducer, useEffect, useCallback } from "react";
import Link from "next/link";
import { useSession, signIn, signOut } from "@/lib/auth-client";
import { formatDate } from "@/lib/format";
import type { DigestResult } from "@/lib/digest";

interface PipelineRun {
  id: number;
  ranAt: string;
  trigger: string;
  status: string;
  newFilingsFound: number;
  newTransactionsParsed: number;
  errors: unknown;
  tokenUsage: { costUsd?: number } | null;
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

interface AlertSignup {
  id: number;
  email: string;
  alertType: string;
  sourcePage: string | null;
  officialSlug: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

// The digest item/trade shapes are the single source of truth in lib/digest.ts;
// import them instead of re-declaring drifting copies here.

// Follows breakdown for the current draft: how many confirmed subscribers this
// digest reaches (follow-all plus followers of officials in the draft) vs.
// excludes, with per-official follower counts.
interface FollowsBreakdown {
  total: number;
  allFollowers: number;
  reached: number;
  excluded: number;
  byOfficial: Record<string, number>;
}

interface DigestPreview {
  draft: DigestResult;
  recipientCount: number;
  follows: FollowsBreakdown;
  production: boolean;
  inFlightRun: {
    id: number;
    status: string;
    chunks: { total: number; ok: number; failed: number };
  } | null;
  lastSentAt: string | null;
  warning: string | null;
}

interface DigestSendResult {
  status?:
    | "sent"
    | "failed"
    | "already-sent"
    | "no-recipients"
    | "test-sent"
    | "test-failed"
    | "test-empty";
  empty?: boolean;
  recipientCount?: number;
  filingCount?: number;
  officialCount?: number;
  runId?: number;
  follows?: FollowsBreakdown;
  to?: string;
  // Set on a single-official test preview so the report can name it.
  onlyOfficial?: string | null;
  error?: string;
  retry?: boolean;
  warning?: string | null;
  chunks?: { total: number; ok: number; failed: number };
  message?: string;
}

interface DbValidationReport {
  result: "PASS" | "FAIL";
  duration: string;
  officials: number;
  transactions: number;
  needsReview: number;
  totalIssues: number;
  checks: Record<string, number>;
}

interface OgeCheckReport {
  ok: boolean;
  duration?: string;
  totalOgeRecords?: number;
  runId?: number;
  error?: string;
}

interface AdminState {
  runs: PipelineRun[];
  reviewItems: ReviewItem[];
  reviewCount: number;
  alertSignups: AlertSignup[];
  alertSignupCount: number;
  digest: DigestPreview | null;
  digestError: boolean;
  digestConfirming: boolean;
  digestSending: boolean;
  digestResult: DigestSendResult | null;
  digestTesting: boolean;
  digestTestResult: DigestSendResult | null;
  // Which official the test preview is scoped to. "" = full draft (the default);
  // a slug = preview the single-official digest for that official.
  digestTestOfficial: string;
  loading: boolean;
  validationReport: DbValidationReport | null;
  ogeReport: OgeCheckReport | null;
  validating: boolean;
  checkingOge: boolean;
  stats: {
    officials: number;
    transactions: number;
    newsArticles: number;
    needsReview: number;
    totalPipelineCost: number;
    lastPipelineRun: PipelineRun | null;
  } | null;
}

const INITIAL_ADMIN_STATE: AdminState = {
  runs: [],
  reviewItems: [],
  reviewCount: 0,
  alertSignups: [],
  alertSignupCount: 0,
  digest: null,
  digestError: false,
  digestConfirming: false,
  digestSending: false,
  digestResult: null,
  digestTesting: false,
  digestTestResult: null,
  digestTestOfficial: "",
  loading: false,
  validationReport: null,
  ogeReport: null,
  validating: false,
  checkingOge: false,
  stats: null,
};

function adminReducer(
  state: AdminState,
  patch: Partial<AdminState>
): AdminState {
  return { ...state, ...patch };
}

export default function AdminPage() {
  const { data: session, isPending } = useSession();
  const [state, setAdminState] = useReducer(adminReducer, INITIAL_ADMIN_STATE);
  const {
    runs,
    reviewItems,
    reviewCount,
    alertSignups,
    alertSignupCount,
    digest,
    digestError,
    digestConfirming,
    digestSending,
    digestResult,
    digestTesting,
    digestTestResult,
    digestTestOfficial,
    loading,
    validationReport,
    ogeReport,
    validating,
    checkingOge,
    stats,
  } = state;

  const ADMIN_EMAIL = "trevorbrown.web@gmail.com";
  const isAdmin = session?.user?.email === ADMIN_EMAIL;

  const fetchData = useCallback(async () => {
    if (!isAdmin) return;
    setAdminState({ loading: true });
    try {
      const [pipelineRes, reviewRes, statsRes, alertsRes, digestRes] = await Promise.all([
        fetch("/api/admin/pipeline"),
        fetch("/api/admin/review"),
        fetch("/api/admin/stats"),
        fetch("/api/admin/alerts"),
        fetch("/api/admin/digest"),
      ]);
      if (pipelineRes.ok) {
        const data = await pipelineRes.json();
        setAdminState({ runs: data.runs || [] });
      }
      if (reviewRes.ok) {
        const data = await reviewRes.json();
        setAdminState({
          reviewItems: data.items || [],
          reviewCount: data.count || 0,
        });
      }
      if (statsRes.ok) {
        setAdminState({ stats: await statsRes.json() });
      }
      if (alertsRes.ok) {
        const data = await alertsRes.json();
        setAdminState({
          alertSignups: data.signups || [],
          alertSignupCount: data.count || 0,
        });
      }
      if (digestRes.ok) {
        setAdminState({ digest: await digestRes.json(), digestError: false });
      } else {
        // Distinguish a failed load from an empty draft: the panel shows an
        // error rather than a perpetual "Loading draft…".
        setAdminState({ digest: null, digestError: true });
      }
    } catch (err) {
      console.error("Failed to fetch admin data:", err);
      setAdminState({ digestError: true });
    }
    setAdminState({ loading: false });
  }, [isAdmin]);

  async function handleSendDigest() {
    setAdminState({ digestSending: true, digestConfirming: false, digestResult: null });
    try {
      // No audience field — recipients are selected by follows server-side.
      const res = await fetch("/api/admin/digest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data: DigestSendResult = await res.json();
      setAdminState({ digestResult: data });
      // On a successful send, refresh so the draft empties and run state updates.
      if (res.ok && data.status === "sent") fetchData();
    } catch (err) {
      setAdminState({ digestResult: { status: "failed", error: (err as Error).message } });
    }
    setAdminState({ digestSending: false });
  }

  // "Send test to me": mails one copy of the draft to the admin. When a specific
  // official is selected the server content-filters the preview to that official
  // only (onlyOfficial). The server writes only an email_sends audit row — no
  // ledger, no run, no recency bump — so this consumes nothing.
  async function handleTestDigest() {
    setAdminState({ digestTesting: true, digestTestResult: null });
    try {
      const res = await fetch("/api/admin/digest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "test",
          // Empty = full draft; a slug scopes the preview to one official.
          onlyOfficial: digestTestOfficial || undefined,
        }),
      });
      const data: DigestSendResult = await res.json();
      setAdminState({ digestTestResult: data });
    } catch (err) {
      setAdminState({
        digestTestResult: { status: "test-failed", error: (err as Error).message },
      });
    }
    setAdminState({ digestTesting: false });
  }

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function runCronCheck() {
    setAdminState({ checkingOge: true });
    try {
      const secret = prompt("Enter CRON_SECRET to trigger OGE check:");
      if (!secret) {
        setAdminState({ checkingOge: false });
        return;
      }
      const res = await fetch("/api/cron", {
        headers: { Authorization: `Bearer ${secret}` },
      });
      const data = await res.json();
      setAdminState({
        ogeReport: {
        ...data,
        ok: res.ok,
        },
      });
      // Refresh pipeline history after check
      fetchData();
    } catch (err) {
      setAdminState({ ogeReport: { ok: false, error: (err as Error).message } });
    }
    setAdminState({ checkingOge: false });
  }

  async function runValidation() {
    setAdminState({ validating: true });
    try {
      const res = await fetch("/api/admin/validate", { method: "POST" });
      if (res.ok) {
        setAdminState({ validationReport: await res.json() });
      }
    } catch (err) {
      console.error("Validation failed:", err);
    }
    setAdminState({ validating: false });
  }

  async function handleReview(id: number, action: "approve" | "delete") {
    const res = await fetch("/api/admin/review", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action }),
    });
    if (res.ok) {
      setAdminState({
        reviewItems: reviewItems.filter((item) => item.id !== id),
        reviewCount: reviewCount - 1,
      });
    }
  }

  if (isPending) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center text-neutral-500 text-sm">
        Loading…
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
          type="button"
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
          type="button"
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
            type="button"
            onClick={fetchData}
            disabled={loading}
            className="text-xs text-neutral-500 hover:text-neutral-900 cursor-pointer"
          >
            {loading ? "Loading…" : "Refresh"}
          </button>
          <button
            type="button"
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

      {/* Filing Digest (draft preview) */}
      <section className="mb-12">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs uppercase tracking-wider text-neutral-500 font-medium">
            Filing Digest
            {digest && (
              <span className="ml-2 bg-neutral-100 text-neutral-700 px-2 py-0.5 rounded-sm text-[10px]">
                {digest.recipientCount} confirmed · {digest.follows.allFollowers} follow all
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
                onClick={fetchData}
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
                  {digest.inFlightRun.chunks.ok}/{digest.inFlightRun.chunks.total} chunks sent.
                  Clicking Send resumes the remaining recipients.
                </p>
              )}
              {digest.warning && (
                <p className="text-[11px] text-amber-800">{digest.warning}</p>
              )}

              {digest.draft.empty ? (
                <p className="text-neutral-500 text-xs">
                  No new filings to send. Subscribers get nothing until a tracked official files new trades.
                  {digest.lastSentAt && (
                    <>
                      {" "}Last digest sent {new Date(digest.lastSentAt).toLocaleString()}.
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
                          .filter((i) => (digest.follows.byOfficial[i.slug] ?? 0) > 0)
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
                  {digest.draft.items.map((item) => (
                    <div key={item.slug} className="border-l-2 border-neutral-300 pl-3">
                      <div className="text-neutral-900 font-medium">
                        {item.name}{" "}
                        <span className="text-neutral-400 font-normal">
                          · {item.newCount} new trade{item.newCount === 1 ? "" : "s"}
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
                            {t.ticker && !t.description.includes(`(${t.ticker})`)
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
                        value={digestTestOfficial}
                        onChange={(e) =>
                          setAdminState({ digestTestOfficial: e.target.value })
                        }
                        disabled={digestTesting}
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
                        onClick={handleTestDigest}
                        disabled={digestTesting}
                        className="border border-neutral-300 text-neutral-700 px-3 py-1.5 text-xs hover:bg-neutral-100 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        {digestTesting ? "Sending test…" : "Send test to me"}
                      </button>
                      <span className="text-[10px] text-neutral-500">
                        Sends only to you. Does not mark filings as notified.
                      </span>
                    </div>
                    {digestTestResult && <DigestTestReport result={digestTestResult} />}
                  </div>

                  {/* Send flow: result -> two-step confirm -> button. Recipients
                      are chosen by follows server-side (no audience choice). */}
                  {(() => {
                    // The count the real send actually reaches (follows-filtered).
                    const targetCount = digest.follows.reached;
                    return (
                      <div className="pt-2 border-t border-neutral-200">
                        {digestResult ? (
                          <DigestSendReport
                            result={digestResult}
                            onRetry={handleSendDigest}
                            sending={digestSending}
                          />
                        ) : digestConfirming ? (
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-neutral-700">
                              Send to {targetCount} subscriber
                              {targetCount === 1 ? "" : "s"} now?
                            </span>
                            <button
                              type="button"
                              onClick={handleSendDigest}
                              disabled={digestSending}
                              className="bg-neutral-900 text-white px-4 py-2 text-xs hover:bg-neutral-800 transition-colors cursor-pointer disabled:opacity-50"
                            >
                              {digestSending ? "Sending…" : "Confirm send"}
                            </button>
                            <button
                              type="button"
                              onClick={() => setAdminState({ digestConfirming: false })}
                              disabled={digestSending}
                              className="text-xs text-neutral-500 hover:text-neutral-900 cursor-pointer disabled:opacity-50"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => setAdminState({ digestConfirming: true })}
                              disabled={targetCount === 0}
                              title={targetCount === 0 ? "No subscribers follow these officials yet." : undefined}
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
                  })()}
                </>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Alert Signups */}
      <section className="mb-12">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs uppercase tracking-wider text-neutral-500 font-medium">
            Alert Signups
            {alertSignupCount > 0 && (
              <span className="ml-2 bg-neutral-100 text-neutral-700 px-2 py-0.5 rounded-sm text-[10px]">
                {alertSignupCount}
              </span>
            )}
          </h2>
          <a
            href="/api/admin/alerts?format=csv"
            className="text-xs border border-neutral-300 text-neutral-700 px-3 py-1.5 hover:bg-neutral-50 transition-colors"
          >
            Export CSV
          </a>
        </div>

        {alertSignups.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b border-neutral-900 text-xs uppercase tracking-wider text-neutral-500">
                  <th className="pb-2 pr-3 font-medium">Email</th>
                  <th className="pb-2 pr-3 font-medium">Follows</th>
                  <th className="pb-2 pr-3 font-medium">Source</th>
                  <th className="pb-2 pr-3 font-medium">Official</th>
                  <th className="pb-2 font-medium text-right">Updated</th>
                </tr>
              </thead>
              <tbody>
                {alertSignups.map((signup) => (
                  <tr key={signup.id} className="border-b border-neutral-100">
                    <td className="py-2 pr-3 text-neutral-900">
                      {signup.email}
                    </td>
                    <td className="py-2 pr-3 text-neutral-600">
                      {signup.officialSlug ? "One official" : "All officials"}
                    </td>
                    <td className="py-2 pr-3 text-neutral-500">
                      {signup.sourcePage || "—"}
                    </td>
                    <td className="py-2 pr-3 text-neutral-500">
                      {signup.officialSlug || "—"}
                    </td>
                    <td className="py-2 text-right tabular-nums text-neutral-400">
                      {new Date(signup.updatedAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-neutral-400">
            No filing-alert signups yet.
          </p>
        )}
      </section>

      {/* Pipeline Status */}
      <section className="mb-12">
        <h2 className="text-xs uppercase tracking-wider text-neutral-500 font-medium mb-4">
          Pipeline Status
        </h2>
        <div className="bg-stone-50 border border-neutral-200 p-4 mb-4 text-sm space-y-3">
          <div>
            <div className="text-neutral-900 font-medium text-xs mb-1">Automated</div>
            <p className="text-neutral-500 text-xs">
              Runs daily (10 AM UTC) via Vercel Cron. Can also be triggered from the{" "}
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
                        ? `$${run.tokenUsage.costUsd?.toFixed(3) || "0"}`
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
                      type="button"
                      onClick={() => handleReview(item.id, "approve")}
                      className="text-xs text-emerald-700 hover:text-emerald-900 cursor-pointer"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
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
              type="button"
              onClick={runValidation}
              disabled={validating}
              className="text-xs bg-neutral-900 text-white px-3 py-1.5 hover:bg-neutral-800 transition-colors cursor-pointer disabled:opacity-50"
            >
              {validating ? "Running…" : "Validate DB"}
            </button>
            <button
              type="button"
              onClick={runCronCheck}
              disabled={checkingOge}
              className="text-xs border border-neutral-300 text-neutral-700 px-3 py-1.5 hover:bg-neutral-50 transition-colors cursor-pointer disabled:opacity-50"
            >
              {checkingOge ? "Checking…" : "Check OGE"}
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
                {Object.entries(validationReport.checks).reduce<string[]>(
                  (parts, [k, v]) => {
                    if ((v as number) > 0) parts.push(`${k}: ${v}`);
                    return parts;
                  },
                  []
                ).join(" | ")}
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-neutral-400">
            Click {"\""}Validate DB{"\""} to check data integrity or {"\""}Check OGE{"\""} to poll for new filings.
          </p>
        )}

        {ogeReport && (
          <div className={`border px-4 py-3 text-sm mt-3 ${ogeReport.ok ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}`}>
            <div className="flex items-center gap-2 mb-1">
              <span className={`font-medium ${ogeReport.ok ? "text-emerald-700" : "text-red-700"}`}>
                {ogeReport.ok ? "OGE Check Complete" : "OGE Check Failed"}
              </span>
              {ogeReport.duration && <span className="text-xs text-neutral-400">{ogeReport.duration}</span>}
            </div>
            {ogeReport.totalOgeRecords && (
              <div className="text-xs text-neutral-600">
                Total OGE records: {ogeReport.totalOgeRecords.toLocaleString()} | Run #{ogeReport.runId}
              </div>
            )}
            {ogeReport.error && (
              <div className="text-xs text-red-700 mt-1">{ogeReport.error}</div>
            )}
          </div>
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
          {typeof result.filingCount === "number" && ` · ${result.filingCount} filing${result.filingCount === 1 ? "" : "s"}`}.
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
        {result.warning && <p className="text-amber-700 mt-1">{result.warning}</p>}
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
    <p className="text-xs text-red-700">
      {result.error || "Test send failed."}
    </p>
  );
}
