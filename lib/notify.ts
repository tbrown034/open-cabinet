/**
 * Email notification system for Open Cabinet.
 *
 * Sends alerts to the admin when things go wrong (or right).
 * Uses Resend (free tier: 100 emails/day — more than enough).
 *
 * Alert types:
 * - pipeline_error: pipeline failed or crashed
 * - credits_exhausted: API credits ran out
 * - low_confidence: parser returned confidence < 0.8
 * - model_disagreement: cross-provider verification found differences
 * - new_filings: informational — new data was found and parsed
 * - feedback: public user submitted feedback/bug report
 * - alert_signup: public user requested filing alerts
 * - digest_sent: a subscriber digest send completed — admin receipt
 */
import { ADMIN_EMAIL, ALERTS_FROM } from "@/lib/email-config";
import { getResend } from "@/lib/email-send";

type AlertType =
  | "pipeline_error"
  | "credits_exhausted"
  | "low_confidence"
  | "model_disagreement"
  | "new_filings"
  | "validation_failure"
  | "feedback"
  | "alert_signup"
  | "digest_sent";

const SUBJECT_MAP: Record<AlertType, string> = {
  pipeline_error: "Pipeline Error",
  credits_exhausted: "API Credits Exhausted",
  low_confidence: "Low Confidence Parse",
  model_disagreement: "Model Disagreement",
  new_filings: "New Filings Parsed",
  validation_failure: "Validation Failed",
  feedback: "User Feedback",
  alert_signup: "Alert Signup",
  digest_sent: "Digest Sent",
};

const PRIORITY_MAP: Record<AlertType, "high" | "normal" | "low"> = {
  pipeline_error: "high",
  credits_exhausted: "high",
  low_confidence: "normal",
  model_disagreement: "normal",
  new_filings: "low",
  validation_failure: "high",
  feedback: "normal",
  alert_signup: "normal",
  digest_sent: "normal",
};

interface NotifyOptions {
  type: AlertType;
  /** Short subject-line hook. Falls back to the alert type label. */
  headline?: string;
  /** One-paragraph summary shown at the top of the email body. */
  summary?: string;
  /** Legacy multi-line body for callers that haven't migrated to headline/summary. */
  details?: string;
  metadata?: Record<string, string | number | boolean>;
}

export async function notify({ type, headline, summary, details, metadata }: NotifyOptions): Promise<boolean> {
  const priority = PRIORITY_MAP[type];
  const prefix = priority === "high" ? "[URGENT] " : "";
  const subject = headline
    ? `${prefix}Open Cabinet · ${headline}`
    : `${prefix}Open Cabinet · ${SUBJECT_MAP[type]}`;

  const resend = getResend();
  if (!resend) {
    console.warn(`[notify] Would have sent: ${subject}`);
    return false;
  }

  const bodyTop = summary || details || "";
  const metaLines = metadata
    ? Object.entries(metadata)
        .map(([k, v]) => `  ${k}: ${v}`)
        .join("\n")
    : "";

  const text = `${headline || SUBJECT_MAP[type]}
${"=".repeat(Math.min(60, (headline || SUBJECT_MAP[type]).length))}

${bodyTop}
${metaLines ? `\n${metaLines}\n` : ""}
---
Time: ${new Date().toISOString().replace("T", " ").slice(0, 16)} UTC
Environment: ${process.env.VERCEL_ENV || "local"}
`;

  try {
    const { error } = await resend.emails.send({
      from: ALERTS_FROM,
      to: [ADMIN_EMAIL],
      subject,
      text,
    });

    if (error) {
      console.error("[notify] Resend error:", error);
      return false;
    }

    console.log(`[notify] Email sent: ${subject}`);
    return true;
  } catch (err) {
    console.error("[notify] Failed to send:", (err as Error).message);
    return false;
  }
}
