/**
 * Admin API: Trigger the OGE filing check on demand.
 *
 * POST /api/admin/oge-check — runs the same check the daily cron performs,
 * by calling /api/cron server-side with CRON_SECRET from the environment.
 * Exists so the admin page never has to ask a human to paste CRON_SECRET
 * into a browser prompt — the secret stays server-side and the page relies
 * on the session admin guard instead.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";

// The cron check can take minutes when OGE is slow; match its budget.
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 500 }
    );
  }

  const res = await fetch(new URL("/api/cron", req.nextUrl.origin), {
    headers: { Authorization: `Bearer ${cronSecret}` },
    // The cron route mutates state (pipeline_runs rows, notifications);
    // never serve this from any cache.
    cache: "no-store",
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
