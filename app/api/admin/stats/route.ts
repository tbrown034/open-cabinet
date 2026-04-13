/**
 * Admin API: Database statistics.
 *
 * GET /api/admin/stats — Returns counts and health metrics
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { officials, transactions, newsCoverage, pipelineRuns } from "@/lib/schema";
import { count, eq, desc, sql } from "drizzle-orm";
import { auth, isAdmin } from "@/lib/auth";
import { headers } from "next/headers";

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [officialCount] = await db.select({ count: count() }).from(officials);
  const [txCount] = await db.select({ count: count() }).from(transactions);
  const [newsCount] = await db.select({ count: count() }).from(newsCoverage);
  const [reviewCount] = await db
    .select({ count: count() })
    .from(transactions)
    .where(eq(transactions.needsReview, true));

  const lastRun = await db
    .select()
    .from(pipelineRuns)
    .orderBy(desc(pipelineRuns.ranAt))
    .limit(1);

  // Total cost from all pipeline runs
  const allRuns = await db.select({ tokenUsage: pipelineRuns.tokenUsage }).from(pipelineRuns);
  const totalCost = allRuns.reduce((sum, r) => {
    const usage = r.tokenUsage as any;
    return sum + (usage?.costUsd || 0);
  }, 0);

  return NextResponse.json({
    officials: officialCount.count,
    transactions: txCount.count,
    newsArticles: newsCount.count,
    needsReview: reviewCount.count,
    totalPipelineCost: Math.round(totalCost * 10000) / 10000,
    lastPipelineRun: lastRun[0] || null,
  });
}
