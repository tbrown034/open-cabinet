/**
 * POST /api/ask/feedback with { logId, verdict: "right" | "wrong", reason? }.
 * Attaches a reader's verdict to the logged answer. Same gates as the box:
 * origin and the alpha cookie. Nothing else is stored.
 */
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { askLog } from "@/lib/schema";
import { isAskOrigin } from "@/lib/ask/origin";
import { requestHasAskaiAccess } from "@/lib/askai-access";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isAskOrigin(request) || !requestHasAskaiAccess(request)) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }
  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > 2048) return NextResponse.json({ ok: false }, { status: 413 });
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const raw = body as Record<string, unknown>;
  const logId = Number(raw.logId);
  const verdict = raw.verdict === "right" || raw.verdict === "wrong" ? raw.verdict : null;
  const reason = typeof raw.reason === "string" ? raw.reason.trim().slice(0, 500) : "";
  if (!Number.isInteger(logId) || logId <= 0 || !verdict) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  try {
    const saved = await getDb().update(askLog)
      .set({ feedback: verdict, feedbackReason: reason || null })
      .where(eq(askLog.id, logId)).returning({ id: askLog.id });
    if (saved.length === 0) return NextResponse.json({ ok: false }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.warn("ask feedback failed:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
