"use client";

import { useReducer } from "react";

type FeedbackStatus = "idle" | "sending" | "sent" | "error";

interface FeedbackState {
  type: string;
  message: string;
  email: string;
  official: string;
  status: FeedbackStatus;
}

type FeedbackAction =
  | { key: "type" | "message" | "email" | "official"; value: string }
  | { key: "status"; value: FeedbackStatus }
  | { key: "sent" };

const INITIAL_FEEDBACK_STATE: FeedbackState = {
  type: "data-error",
  message: "",
  email: "",
  official: "",
  status: "idle",
};

function feedbackReducer(
  state: FeedbackState,
  action: FeedbackAction
): FeedbackState {
  if (action.key === "sent") {
    return {
      ...state,
      message: "",
      email: "",
      official: "",
      status: "sent",
    };
  }

  return { ...state, [action.key]: action.value };
}

export default function FeedbackForm() {
  const [state, dispatch] = useReducer(
    feedbackReducer,
    INITIAL_FEEDBACK_STATE
  );
  const { type, message, email, official, status } = state;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (message.trim().length < 5) return;

    dispatch({ key: "status", value: "sending" });
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, message, email, official }),
      });

      if (res.ok) {
        dispatch({ key: "sent" });
      } else {
        dispatch({ key: "status", value: "error" });
      }
    } catch {
      dispatch({ key: "status", value: "error" });
    }
  }

  if (status === "sent") {
    return (
      <div className="border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
        Thanks for the feedback. We review every submission.
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label
          htmlFor="feedback-type"
          className="text-xs text-neutral-500 block mb-1"
        >
          What kind of feedback?
        </label>
        <select
          id="feedback-type"
          value={type}
          onChange={(e) =>
            dispatch({ key: "type", value: e.target.value })
          }
          className="w-full border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:border-neutral-900 bg-white"
        >
          <option value="data-error">Data error (wrong transaction, amount, date)</option>
          <option value="missing-official">Missing official or filing</option>
          <option value="bug">Bug or display issue</option>
          <option value="tip">News tip or story lead</option>
          <option value="general">General feedback</option>
        </select>
      </div>

      <div>
        <label
          htmlFor="feedback-official"
          className="text-xs text-neutral-500 block mb-1"
        >
          Official (optional)
        </label>
        <input
          id="feedback-official"
          type="text"
          value={official}
          onChange={(e) =>
            dispatch({ key: "official", value: e.target.value })
          }
          placeholder="e.g., Scott Bessent"
          className="w-full border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:border-neutral-900"
        />
      </div>

      <div>
        <label
          htmlFor="feedback-message"
          className="text-xs text-neutral-500 block mb-1"
        >
          Details
        </label>
        <textarea
          id="feedback-message"
          value={message}
          onChange={(e) =>
            dispatch({ key: "message", value: e.target.value })
          }
          placeholder="Describe the issue or share your feedback…"
          rows={4}
          required
          minLength={5}
          className="w-full border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:border-neutral-900 resize-none"
        />
      </div>

      <div>
        <label
          htmlFor="feedback-email"
          className="text-xs text-neutral-500 block mb-1"
        >
          Your email (optional, for follow-up)
        </label>
        <input
          id="feedback-email"
          type="email"
          value={email}
          onChange={(e) =>
            dispatch({ key: "email", value: e.target.value })
          }
          placeholder="you@example.com"
          className="w-full border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:border-neutral-900"
        />
      </div>

      <button
        type="submit"
        disabled={status === "sending" || message.trim().length < 5}
        className="bg-neutral-900 text-white px-5 py-2 text-sm hover:bg-neutral-800 transition-colors cursor-pointer disabled:opacity-50"
      >
        {status === "sending" ? "Sending…" : "Submit feedback"}
      </button>

      {status === "error" && (
        <p className="text-xs text-red-700">
          Something went wrong. Try again or email trevorbrown.web@gmail.com.
        </p>
      )}
    </form>
  );
}
