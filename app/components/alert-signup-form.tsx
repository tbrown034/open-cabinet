"use client";

import { track } from "@vercel/analytics";
import { useId, useReducer } from "react";

type AlertType = "major" | "all";
type SignupStatus = "idle" | "sending" | "sent" | "error";

interface AlertSignupFormProps {
  sourcePage: string;
  officialSlug?: string;
  title?: string;
  description?: string;
  compact?: boolean;
}

interface SignupState {
  email: string;
  alertType: AlertType;
  status: SignupStatus;
  error: string;
}

type SignupAction =
  | { key: "email" | "error"; value: string }
  | { key: "alertType"; value: AlertType }
  | { key: "status"; value: SignupStatus }
  | { key: "sent" };

const INITIAL_STATE: SignupState = {
  email: "",
  alertType: "major",
  status: "idle",
  error: "",
};

function signupReducer(state: SignupState, action: SignupAction): SignupState {
  if (action.key === "sent") {
    return { ...state, email: "", status: "sent", error: "" };
  }
  return { ...state, [action.key]: action.value };
}

export default function AlertSignupForm({
  sourcePage,
  officialSlug,
  title = "Get filing alerts",
  description = "Get an email when Open Cabinet publishes important filing updates.",
  compact = false,
}: AlertSignupFormProps) {
  const id = useId();
  const [state, dispatch] = useReducer(signupReducer, INITIAL_STATE);
  const { email, alertType, status, error } = state;
  const canSubmit = email.trim().length > 3 && status !== "sending";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    dispatch({ key: "status", value: "sending" });
    dispatch({ key: "error", value: "" });

    try {
      track("Alert Signup Submitted", {
        alertType,
        sourcePage,
        hasOfficial: Boolean(officialSlug),
      });
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          alertType,
          sourcePage,
          officialSlug,
          referrer: typeof document !== "undefined" ? document.referrer : "",
        }),
      });
      const payload = await res.json().catch(() => null);

      if (res.ok) {
        track("Alert Signup Saved", {
          alertType,
          sourcePage,
          hasOfficial: Boolean(officialSlug),
        });
        dispatch({ key: "sent" });
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
      <div className="border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
        You are on the filing-alert list.
      </div>
    );
  }

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
            No spam. Unsubscribe by replying to any alert.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <label htmlFor={`${id}-email`} className="sr-only">
              Email address
            </label>
            <input
              id={`${id}-email`}
              type="email"
              value={email}
              onChange={(e) =>
                dispatch({ key: "email", value: e.target.value })
              }
              placeholder="you@example.com"
              required
              className="w-full border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:border-neutral-900"
            />
            <button
              type="submit"
              disabled={!canSubmit}
              className="bg-neutral-900 text-white px-4 py-2 text-sm hover:bg-neutral-800 transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
            >
              {status === "sending" ? "Saving..." : "Get alerts"}
            </button>
          </div>

          <fieldset className="flex flex-wrap gap-2">
            <legend className="sr-only">Alert frequency</legend>
            <label className="cursor-pointer">
              <input
                type="radio"
                name={`${id}-alert-type`}
                value="major"
                checked={alertType === "major"}
                onChange={() =>
                  dispatch({ key: "alertType", value: "major" })
                }
                className="peer sr-only"
              />
              <span className="block border border-neutral-300 px-3 py-1.5 text-xs text-neutral-600 peer-checked:border-neutral-900 peer-checked:bg-neutral-900 peer-checked:text-white">
                Major updates
              </span>
            </label>
            <label className="cursor-pointer">
              <input
                type="radio"
                name={`${id}-alert-type`}
                value="all"
                checked={alertType === "all"}
                onChange={() =>
                  dispatch({ key: "alertType", value: "all" })
                }
                className="peer sr-only"
              />
              <span className="block border border-neutral-300 px-3 py-1.5 text-xs text-neutral-600 peer-checked:border-neutral-900 peer-checked:bg-neutral-900 peer-checked:text-white">
                Every new filing
              </span>
            </label>
          </fieldset>

          {status === "error" && (
            <p className="text-xs text-red-700">{error}</p>
          )}
        </form>
      </div>
    </section>
  );
}
