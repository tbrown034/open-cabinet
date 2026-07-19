/**
 * Admin API: Transaction review queue.
 *
 * GET    /api/admin/review — Returns transactions needing review
 * PATCH  /api/admin/review — Approve or edit a transaction
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { transactions, officials } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get transactions flagged for review (low confidence or explicit flag)
  const reviewItems = await db
    .select({
      id: transactions.id,
      description: transactions.description,
      ticker: transactions.ticker,
      type: transactions.type,
      date: transactions.date,
      amount: transactions.amount,
      lateFilingFlag: transactions.lateFilingFlag,
      confidence: transactions.confidence,
      pdfSource: transactions.pdfSource,
      officialName: officials.name,
      officialSlug: officials.slug,
    })
    .from(transactions)
    .leftJoin(officials, eq(transactions.officialId, officials.id))
    .where(eq(transactions.needsReview, true))
    .limit(50);

  return NextResponse.json({ items: reviewItems, count: reviewItems.length });
}

export async function PATCH(request: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  const { id, action, updates } = (body ?? {}) as {
    id?: unknown;
    action?: unknown;
    updates?: unknown;
  };

  if (!id || !action) {
    return NextResponse.json(
      { error: "id and action required" },
      { status: 400 }
    );
  }

  if (action === "approve") {
    await db
      .update(transactions)
      .set({ needsReview: false })
      .where(eq(transactions.id, id as number));
    return NextResponse.json({ success: true, action: "approved" });
  }

  if (action === "edit" && updates && typeof updates === "object") {
    // Only these columns are admin-editable. Spreading raw `updates` straight
    // into set() would let a caller write any column (officialId, batchId,
    // confidence, createdAt, …); whitelist the data fields explicitly.
    const EDITABLE = [
      "description",
      "ticker",
      "type",
      "date",
      "amount",
      "lateFilingFlag",
      "notes",
    ] as const;
    const raw = updates as Record<string, unknown>;
    const safe: Record<string, unknown> = {};
    for (const key of EDITABLE) {
      if (key in raw) safe[key] = raw[key];
    }
    await db
      .update(transactions)
      .set({
        ...safe,
        needsReview: false,
      })
      .where(eq(transactions.id, id as number));
    return NextResponse.json({ success: true, action: "edited" });
  }

  if (action === "delete") {
    await db.delete(transactions).where(eq(transactions.id, id as number));
    return NextResponse.json({ success: true, action: "deleted" });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
