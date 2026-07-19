/**
 * Admin API: filing-alert signups.
 *
 * GET /api/admin/alerts — Returns recent alert signups
 * GET /api/admin/alerts?format=csv — Exports recent alert signups as CSV
 */
import { NextResponse } from "next/server";
import { count, desc } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { alertSignups } from "@/lib/schema";

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  // Formula-injection guard: a cell a spreadsheet reads as a formula starts with
  // =, +, -, or @. Prefix a single quote so Excel/Sheets render it as text.
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replaceAll("\"", "\"\"")}"`;
}

export async function GET(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
