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

  const [
    [officialCount],
    [txCount],
    [newsCount],
    [reviewCount],
    lastRun,
    allRuns,
  ] = await Promise.all([
    db.select({ count: count() }).from(officials),
    db.select({ count: count() }).from(transactions),
    db.select({ count: count() }).from(newsCoverage),
    db
      .select({ count: count() })
      .from(transactions)
      .where(eq(transactions.needsReview, true)),
    db
      .select()
      .from(pipelineRuns)
      .orderBy(desc(pipelineRuns.ranAt))
      .limit(1),
    db.select({ tokenUsage: pipelineRuns.tokenUsage }).from(pipelineRuns),
  ]);

  // Total cost from all pipeline runs
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
