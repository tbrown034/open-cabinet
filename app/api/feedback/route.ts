/**
 * Public feedback endpoint.
 *
 * POST /api/feedback — accepts bug reports, data corrections, tips
 * Sends an email to admin via Resend. Rate limited to prevent abuse.
 */
import { NextRequest, NextResponse } from "next/server";
import { notify } from "@/lib/notify";

// Simple in-memory rate limit (resets on redeploy)
const recentSubmissions = new Map<string, number>();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_PER_WINDOW = 3;

export async function POST(request: NextRequest) {
  // Rate limit by IP
  const ip = request.headers.get("x-forwarded-for") || "unknown";
  const now = Date.now();
  const lastSubmission = recentSubmissions.get(ip) || 0;
  const submissions = Array.from(recentSubmissions.entries()).filter(
    ([key, time]) => key === ip && now - time < RATE_LIMIT_WINDOW
  ).length;

  if (submissions >= MAX_PER_WINDOW) {
    return NextResponse.json(
      { error: "Too many submissions. Try again in a minute." },
      { status: 429 }
    );
  }
  recentSubmissions.set(ip + now, now);

  const body = await request.json();
  const { type, message, email, official } = body;

  if (!message || message.trim().length < 5) {
    return NextResponse.json(
      { error: "Message must be at least 5 characters." },
      { status: 400 }
    );
  }

  const feedbackType = type || "general";
  const details = [
    `Type: ${feedbackType}`,
    official ? `Official: ${official}` : null,
    email ? `Reply to: ${email}` : "No reply email provided",
    "",
    message,
  ]
    .filter(Boolean)
    .join("\n");

  await notify({
    type: "feedback",
    details,
    metadata: {
      feedbackType,
      hasEmail: !!email,
      ip: ip.substring(0, 20),
    },
  });

  return NextResponse.json({ success: true });
}
