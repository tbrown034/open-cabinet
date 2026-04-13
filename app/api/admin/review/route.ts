/**
 * Admin API: Transaction review queue.
 *
 * GET    /api/admin/review — Returns transactions needing review
 * PATCH  /api/admin/review — Approve or edit a transaction
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { transactions, officials } from "@/lib/schema";
import { eq, and, or } from "drizzle-orm";
import { auth, isAdmin } from "@/lib/auth";
import { headers } from "next/headers";

async function checkAdmin() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  return session?.user?.email && isAdmin(session.user.email);
}

export async function GET() {
  if (!(await checkAdmin())) {
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
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { id, action, updates } = body;

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
      .where(eq(transactions.id, id));
    return NextResponse.json({ success: true, action: "approved" });
  }

  if (action === "edit" && updates) {
    await db
      .update(transactions)
      .set({
        ...updates,
        needsReview: false,
      })
      .where(eq(transactions.id, id));
    return NextResponse.json({ success: true, action: "edited" });
  }

  if (action === "delete") {
    await db.delete(transactions).where(eq(transactions.id, id));
    return NextResponse.json({ success: true, action: "deleted" });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
