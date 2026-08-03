"use client";

import { useReducer, useEffect, useCallback } from "react";
import { useSession, signIn, signOut } from "@/lib/auth-client";
import { StatsSection } from "./components/stats-section";
import { DigestSection } from "./components/digest-section";
import { AlertSignupsSection } from "./components/alert-signups-section";
import { PipelineSection } from "./components/pipeline-section";
import { ReviewQueueSection } from "./components/review-queue-section";
import { ValidationSection } from "./components/validation-section";
import { QuickLinksSection } from "./components/quick-links-section";
import { ModelsSection } from "./components/models-section";
import type {
  AdminStats,
  AlertSignup,
  DbValidationReport,
  DigestPreview,
  DigestSendResult,
  OgeCheckReport,
  PipelineRun,
  ReviewItem,
} from "./types";

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
  stats: AdminStats | null;
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

  const ADMIN_EMAIL = "trevorbrown.web@gmail.com";
  const isAdmin = session?.user?.email === ADMIN_EMAIL;

  const fetchData = useCallback(async () => {
    if (!isAdmin) return;
    setAdminState({ loading: true });
    try {
      const [pipelineRes, reviewRes, statsRes, alertsRes, digestRes] =
        await Promise.all([
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
    setAdminState({
      digestSending: true,
      digestConfirming: false,
      digestResult: null,
    });
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
      setAdminState({
        digestResult: { status: "failed", error: (err as Error).message },
      });
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
          onlyOfficial: state.digestTestOfficial || undefined,
        }),
      });
      const data: DigestSendResult = await res.json();
      setAdminState({ digestTestResult: data });
    } catch (err) {
      setAdminState({
        digestTestResult: {
          status: "test-failed",
          error: (err as Error).message,
        },
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
        reviewItems: state.reviewItems.filter((item) => item.id !== id),
        reviewCount: state.reviewCount - 1,
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
          <p className="text-xs text-neutral-400 mt-1">{session.user?.email}</p>
        </div>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={fetchData}
            disabled={state.loading}
            className="text-xs text-neutral-500 hover:text-neutral-900 cursor-pointer"
          >
            {state.loading ? "Loading…" : "Refresh"}
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

      <StatsSection stats={state.stats} />

      <DigestSection
        digest={state.digest}
        digestError={state.digestError}
        confirming={state.digestConfirming}
        sending={state.digestSending}
        result={state.digestResult}
        testing={state.digestTesting}
        testResult={state.digestTestResult}
        testOfficial={state.digestTestOfficial}
        onRetryLoad={fetchData}
        onSend={handleSendDigest}
        onTest={handleTestDigest}
        onSetConfirming={(confirming) =>
          setAdminState({ digestConfirming: confirming })
        }
        onSetTestOfficial={(slug) => setAdminState({ digestTestOfficial: slug })}
      />

      <AlertSignupsSection
        signups={state.alertSignups}
        count={state.alertSignupCount}
      />

      <PipelineSection runs={state.runs} />

      <ReviewQueueSection
        items={state.reviewItems}
        count={state.reviewCount}
        onReview={handleReview}
      />

      <ValidationSection
        validationReport={state.validationReport}
        ogeReport={state.ogeReport}
        validating={state.validating}
        checkingOge={state.checkingOge}
        onValidate={runValidation}
        onCheckOge={runCronCheck}
      />

      <QuickLinksSection />

      <ModelsSection />
    </div>
  );
}
