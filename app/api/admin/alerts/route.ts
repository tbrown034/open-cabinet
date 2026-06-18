/**
 * Admin API: filing-alert signups.
 *
 * GET /api/admin/alerts — Returns recent alert signups
 * GET /api/admin/alerts?format=csv — Exports recent alert signups as CSV
 */
import { NextResponse } from "next/server";
import { count, desc, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { auth, isAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { alertSignups } from "@/lib/schema";

async function checkAdmin() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    return false;
  }
  return true;
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
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replaceAll("\"", "\"\"")}"`;
}

export async function GET(req: Request) {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureAlertSignupsTable();

  const url = new URL(req.url);
  const format = url.searchParams.get("format");
  const limit = format === "csv" ? 5000 : 50;

  const [[total], signups] = await Promise.all([
    db.select({ count: count() }).from(alertSignups),
    db
      .select()
      .from(alertSignups)
      .orderBy(desc(alertSignups.updatedAt))
      .limit(limit),
  ]);

  if (format === "csv") {
    const headers = [
      "email",
      "alertType",
      "sourcePage",
      "officialSlug",
      "status",
      "createdAt",
      "updatedAt",
      "referrer",
    ];
    const rows = signups.map((signup) =>
      [
        signup.email,
        signup.alertType,
        signup.sourcePage,
        signup.officialSlug,
        signup.status,
        signup.createdAt,
        signup.updatedAt,
        signup.referrer,
      ]
        .map(csvCell)
        .join(",")
    );
    const csv = [headers.join(","), ...rows].join("\n");
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": "attachment; filename=open-cabinet-alert-signups.csv",
      },
    });
  }

  return NextResponse.json({
    count: total.count,
    signups,
  });
}
