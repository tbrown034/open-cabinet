/**
 * Public feedback endpoint.
 *
 * POST /api/feedback — accepts bug reports, data corrections, tips
 * Sends an email to admin via Resend. Rate limited to prevent abuse.
 */
import { NextRequest, NextResponse } from "next/server";
import { notify } from "@/lib/notify";

// Simple in-memory per-IP rate limit (resets on redeploy). Mirrors the working
// limiter in app/api/alerts/route.ts: each IP maps to an array of request
// timestamps; on each hit we drop timestamps outside the window, append now,
// and reject if the count exceeds the max.
const recentSubmissions = new Map<string, number[]>();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_PER_WINDOW = 3;
const MAX_MESSAGE_LENGTH = 5000;
// Cap the map so a churn of unique IPs can't grow it unbounded.
const IP_MAP_MAX_KEYS = 1000;

function tooMany(ip: string): boolean {
  const now = Date.now();
  const recent = (recentSubmissions.get(ip) ?? []).filter(
    (ts) => now - ts < RATE_LIMIT_WINDOW
  );
  recent.push(now);
  recentSubmissions.set(ip, recent);
  // Evict keys whose window has fully elapsed once the map gets large.
  if (recentSubmissions.size > IP_MAP_MAX_KEYS) {
    for (const [key, times] of recentSubmissions) {
      if (times.every((ts) => now - ts >= RATE_LIMIT_WINDOW)) {
        recentSubmissions.delete(key);
      }
    }
  }
  return recent.length > MAX_PER_WINDOW;
}

export async function POST(request: NextRequest) {
  // Rate limit by IP
  const ip = request.headers.get("x-forwarded-for") || "unknown";
  if (tooMany(ip)) {
    return NextResponse.json(
      { error: "Too many submissions. Try again in a minute." },
      { status: 429 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 }
    );
  }

  const data =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const { type, message, email, official, company } = data;

  // Honeypot: a hidden form field real users never fill. If it has a value, a
  // bot submitted the form — silently pretend success so the bot learns nothing.
  if (typeof company === "string" && company.trim().length > 0) {
    return NextResponse.json({ success: true });
  }

  if (
    typeof message !== "string" ||
    message.trim().length < 5
  ) {
    return NextResponse.json(
      { error: "Message must be at least 5 characters." },
      { status: 400 }
    );
  }

  const safeMessage = message.slice(0, MAX_MESSAGE_LENGTH);
  const safeType = typeof type === "string" ? type : "";
  const safeEmail = typeof email === "string" ? email : "";
  const safeOfficial = typeof official === "string" ? official : "";

  const feedbackType = safeType || "general";
  const details = [
    `Type: ${feedbackType}`,
    safeOfficial ? `Official: ${safeOfficial}` : null,
    safeEmail ? `Reply to: ${safeEmail}` : "No reply email provided",
    "",
    safeMessage,
  ]
    .filter(Boolean)
    .join("\n");

  await notify({
    type: "feedback",
    details,
    metadata: {
      feedbackType,
      hasEmail: !!safeEmail,
      ip: ip.substring(0, 20),
    },
  });

  return NextResponse.json({ success: true });
}
