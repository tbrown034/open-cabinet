import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { alertSignups } from "@/lib/schema";
import { notify } from "@/lib/notify";

type AlertType = "major" | "all";

const ALERT_TYPES = new Set<AlertType>(["major", "all"]);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 8;
const recentRequests = new Map<string, number[]>();

function getIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return req.headers.get("x-real-ip") || "unknown";
}

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (recentRequests.get(ip) ?? []).filter(
    (ts) => now - ts < RATE_LIMIT_WINDOW_MS
  );
  recent.push(now);
  recentRequests.set(ip, recent);
  return recent.length > RATE_LIMIT_MAX;
}

function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

async function ensureAlertSignupsTable() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS alert_signups (
      id serial PRIMARY KEY,
      email text NOT NULL UNIQUE,
      alert_type text NOT NULL DEFAULT 'major',
      source_page text,
      official_slug text,
      referrer text,
      user_agent text,
      status text NOT NULL DEFAULT 'active',
      created_at timestamp NOT NULL DEFAULT now(),
      updated_at timestamp NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS alert_signups_email_idx
    ON alert_signups (email)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS alert_signups_status_idx
    ON alert_signups (status)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS alert_signups_source_idx
    ON alert_signups (source_page)
  `);
}

export async function POST(req: Request) {
  const ip = getIp(req);
  if (rateLimited(ip)) {
    return NextResponse.json(
      { ok: false, error: "Too many submissions. Try again later." },
      { status: 429 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid request body." },
      { status: 400 }
    );
  }

  const data = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const email = cleanText(data.email, 254)?.toLowerCase() ?? "";
  const alertType = cleanText(data.alertType, 20) as AlertType | null;
  const sourcePage = cleanText(data.sourcePage, 200);
  const officialSlug = cleanText(data.officialSlug, 100);
  const referrer = cleanText(data.referrer, 500) ?? cleanText(req.headers.get("referer"), 500);
  const userAgent = cleanText(req.headers.get("user-agent"), 500);

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json(
      { ok: false, error: "Enter a valid email address." },
      { status: 400 }
    );
  }

  if (!alertType || !ALERT_TYPES.has(alertType)) {
    return NextResponse.json(
      { ok: false, error: "Choose a valid alert type." },
      { status: 400 }
    );
  }

  try {
    await ensureAlertSignupsTable();
    await db
      .insert(alertSignups)
      .values({
        email,
        alertType,
        sourcePage,
        officialSlug,
        referrer,
        userAgent,
        status: "active",
      })
      .onConflictDoUpdate({
        target: alertSignups.email,
        set: {
          alertType,
          sourcePage,
          officialSlug,
          referrer,
          userAgent,
          status: "active",
          updatedAt: sql`now()`,
        },
      });

    await notify({
      type: "alert_signup",
      headline: "New filing-alert signup",
      summary: `${email} requested ${alertType === "all" ? "all filing alerts" : "major update alerts"}.`,
      metadata: {
        email,
        alertType,
        sourcePage: sourcePage ?? "unknown",
        officialSlug: officialSlug ?? "none",
        ip,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[alerts] Failed to save signup:", err);
    return NextResponse.json(
      { ok: false, error: "Could not save signup." },
      { status: 500 }
    );
  }
}
