"use client";

import { track } from "@vercel/analytics";
import { useId, useReducer, useRef } from "react";

type SignupStatus = "idle" | "sending" | "sent" | "already" | "error";

// On an official page the subscriber chooses what to follow: just this official
// (default) or all officials. Home/other pages have no toggle and follow all.
type FollowScope = "official" | "all";

interface AlertSignupFormProps {
  sourcePage: string;
  officialSlug?: string;
  /** Display name for the official, used to label the "Only <Name>" toggle. */
  officialName?: string;
  title?: string;
  description?: string;
  compact?: boolean;
}

interface SignupState {
  email: string;
  followScope: FollowScope;
  status: SignupStatus;
  error: string;
  /** Set on the "already subscribed" response so the message can name their scope. */
  alreadyFollowsAll: boolean;
}

type SignupAction =
  | { key: "email" | "error"; value: string }
  | { key: "followScope"; value: FollowScope }
  | { key: "status"; value: SignupStatus }
  | { key: "sent" }
  | { key: "already"; value: { followsAll: boolean } };

const INITIAL_STATE: SignupState = {
  email: "",
  // Default to following just this official when the form is on an official
  // page; the home form ignores this and always follows all.
  followScope: "official",
  status: "idle",
  error: "",
  alreadyFollowsAll: false,
};

function signupReducer(state: SignupState, action: SignupAction): SignupState {
  if (action.key === "sent") {
    return { ...state, email: "", status: "sent", error: "" };
  }
  if (action.key === "already") {
    return {
      ...state,
      email: "",
      status: "already",
      alreadyFollowsAll: action.value.followsAll,
      error: "",
    };
  }
  return { ...state, [action.key]: action.value };
}

export default function AlertSignupForm({
  sourcePage,
  officialSlug,
  officialName,
  title = "Get filing alerts",
  description = "Get an email when Open Cabinet publishes important filing updates.",
  compact = false,
}: AlertSignupFormProps) {
  const id = useId();
  const [state, dispatch] = useReducer(signupReducer, INITIAL_STATE);
  const { email, followScope, status, error } = state;
  const canSubmit = email.trim().length > 3 && status !== "sending";
  // The toggle only appears when this form is on an official's page.
  const hasOfficial = Boolean(officialSlug);
  // The slug actually followed: the official's slug when scoped to them, else
  // undefined (= follow all officials).
  const followedSlug =
    hasOfficial && followScope === "official" ? officialSlug : undefined;
  // Honeypot: a hidden field humans leave blank. Read at submit; bots that fill
  // every field get silently dropped server-side.
  const honeypotRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    dispatch({ key: "status", value: "sending" });
    dispatch({ key: "error", value: "" });

    try {
      track("Alert Signup Submitted", {
        followScope: hasOfficial ? followScope : "all",
        sourcePage,
        hasOfficial,
      });
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          // alertType kept for API/back-compat only; sends route by follows now.
          alertType: "major",
          sourcePage,
          // Only send officialSlug when following a single official.
          officialSlug: followedSlug,
          referrer: typeof document !== "undefined" ? document.referrer : "",
          company: honeypotRef.current?.value ?? "",
        }),
      });
      const payload = await res.json().catch(() => null);

      if (res.ok) {
        track("Alert Signup Saved", {
          followScope: hasOfficial ? followScope : "all",
          sourcePage,
          hasOfficial,
        });
        if (payload?.alreadyActive) {
          // No email goes out for an already-confirmed address — saying
          // "check your email" here would leave them waiting forever.
          dispatch({
            key: "already",
            value: { followsAll: Boolean(payload?.followsAll) },
          });
        } else {
          dispatch({ key: "sent" });
        }
      } else {
        dispatch({
          key: "error",
          value: payload?.error || "Could not save your signup.",
        });
        dispatch({ key: "status", value: "error" });
      }
    } catch {
      dispatch({
        key: "error",
        value: "Could not save your signup. Try again or email Trevor.",
      });
      dispatch({ key: "status", value: "error" });
    }
  }

  if (status === "sent") {
    return (
      <div role="status" className="border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
        Check your email to confirm your signup. The link arrives in a minute (check spam if not).
      </div>
    );
  }

  if (status === "already") {
    return (
      <div role="status" className="border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
        {state.alreadyFollowsAll
          ? "You're already subscribed and follow all officials — no confirmation needed."
          : "You're already subscribed — no confirmation needed. Your existing alert scope is unchanged."}
      </div>
    );
  }

  // Label for the single-official option — falls back to a generic label if the
  // display name wasn't passed.
  const officialLabel = officialName
    ? `Only ${officialName}`
    : "Only this official";

  return (
    <section className="border border-neutral-200 bg-white px-4 py-4">
      <div className={compact ? "space-y-3" : "grid gap-4 md:grid-cols-[1fr_1.4fr]"}>
        <div>
          <h2 className="font-[family-name:var(--font-source-serif)] text-xl text-neutral-900">
            {title}
          </h2>
          <p className="mt-1 text-sm text-neutral-500 leading-relaxed">
            {description}
          </p>
          <p className="mt-2 text-xs text-neutral-400">
            Confirm via email. No spam, one-click unsubscribe anytime.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Honeypot — hidden from humans, catches naive bots. Not display:none
              (some bots skip those); visually removed but focusable-blocked. */}
          <div aria-hidden="true" style={{ position: "absolute", left: "-9999px", height: 0, overflow: "hidden" }}>
            <label htmlFor={`${id}-company`}>Company (leave blank)</label>
            <input
              id={`${id}-company`}
              ref={honeypotRef}
              type="text"
              name="company"
              tabIndex={-1}
              autoComplete="off"
              defaultValue=""
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <label htmlFor={`${id}-email`} className="sr-only">
              Email address
            </label>
            <input
              id={`${id}-email`}
              type="email"
              name="email"
              autoComplete="email"
              spellCheck={false}
              value={email}
              onChange={(e) =>
                dispatch({ key: "email", value: e.target.value })
              }
              placeholder="you@example.com"
              required
              className="w-full border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:border-neutral-900 focus-visible:ring-2 focus-visible:ring-neutral-900"
            />
            <button
              type="submit"
              disabled={!canSubmit}
              className="bg-neutral-900 text-white px-4 py-2 text-sm hover:bg-neutral-800 transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
            >
              {status === "sending" ? "Saving..." : "Get alerts"}
            </button>
          </div>

          {/* Follow scope — only on official pages. "Only <Name>" (default,
              sends officialSlug) vs. "All officials" (sends no officialSlug). */}
          {hasOfficial && (
            <fieldset className="flex flex-wrap gap-2">
              <legend className="sr-only">What to follow</legend>
              <label className="cursor-pointer">
                <input
                  type="radio"
                  name={`${id}-follow-scope`}
                  value="official"
                  checked={followScope === "official"}
                  onChange={() =>
                    dispatch({ key: "followScope", value: "official" })
                  }
                  className="peer sr-only"
                />
                <span className="block border border-neutral-300 px-3 py-1.5 text-xs text-neutral-600 peer-checked:border-neutral-900 peer-checked:bg-neutral-900 peer-checked:text-white">
                  {officialLabel}
                </span>
              </label>
              <label className="cursor-pointer">
                <input
                  type="radio"
                  name={`${id}-follow-scope`}
                  value="all"
                  checked={followScope === "all"}
                  onChange={() =>
                    dispatch({ key: "followScope", value: "all" })
                  }
                  className="peer sr-only"
                />
                <span className="block border border-neutral-300 px-3 py-1.5 text-xs text-neutral-600 peer-checked:border-neutral-900 peer-checked:bg-neutral-900 peer-checked:text-white">
                  All officials
                </span>
              </label>
            </fieldset>
          )}

          {status === "error" && (
            <p role="alert" className="text-xs text-red-700">{error}</p>
          )}
        </form>
      </div>
    </section>
  );
}
