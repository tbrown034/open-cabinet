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
 */
import { Resend } from "resend";

const ADMIN_EMAIL = "trevorbrown.web@gmail.com";
const FROM_EMAIL = "Open Cabinet <alerts@trevorthewebdeveloper.com>";

type AlertType =
  | "pipeline_error"
  | "credits_exhausted"
  | "low_confidence"
  | "model_disagreement"
  | "new_filings"
  | "validation_failure"
  | "feedback";

const SUBJECT_MAP: Record<AlertType, string> = {
  pipeline_error: "Pipeline Error",
  credits_exhausted: "API Credits Exhausted",
  low_confidence: "Low Confidence Parse",
  model_disagreement: "Model Disagreement",
  new_filings: "New Filings Parsed",
  validation_failure: "Validation Failed",
  feedback: "User Feedback",
};

const PRIORITY_MAP: Record<AlertType, "high" | "normal" | "low"> = {
  pipeline_error: "high",
  credits_exhausted: "high",
  low_confidence: "normal",
  model_disagreement: "normal",
  new_filings: "low",
  validation_failure: "high",
  feedback: "normal",
};

interface NotifyOptions {
  type: AlertType;
  details: string;
  metadata?: Record<string, string | number | boolean>;
}

export async function notify({ type, details, metadata }: NotifyOptions): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[notify] RESEND_API_KEY not set — skipping email");
    console.warn(`[notify] Would have sent: ${SUBJECT_MAP[type]} — ${details}`);
    return false;
  }

  const resend = new Resend(apiKey);
  const priority = PRIORITY_MAP[type];
  const prefix = priority === "high" ? "[URGENT] " : "";
  const subject = `${prefix}Open Cabinet: ${SUBJECT_MAP[type]}`;

  // Build plain text email body
  const metaLines = metadata
    ? Object.entries(metadata)
        .map(([k, v]) => `  ${k}: ${v}`)
        .join("\n")
    : "";

  const body = `${SUBJECT_MAP[type]}
${"=".repeat(40)}

${details}

${metaLines ? `Details:\n${metaLines}\n` : ""}
---
Time: ${new Date().toISOString()}
Environment: ${process.env.VERCEL_ENV || "local"}
Source: Open Cabinet Pipeline
`;

  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [ADMIN_EMAIL],
      subject,
      text: body,
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
