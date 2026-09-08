/**
 * Admin API: Run data validation.
 *
 * POST /api/admin/validate — Runs validation checks and returns report
 */
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { officials, transactions } from "@/lib/schema";
import { count, eq, sql } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";

export async function POST() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();

  const [
    [officialCount],
    [txCount],
    [reviewCount],
    [missingDesc],
    [missingType],
    [missingDate],
    [orphaned],
    [emptyOfficials],
  ] = await Promise.all([
    getDb().select({ count: count() }).from(officials),
    getDb().select({ count: count() }).from(transactions),
    getDb()
      .select({ count: count() })
      .from(transactions)
      .where(eq(transactions.needsReview, true)),
    getDb()
      .select({ count: count() })
      .from(transactions)
      .where(sql`${transactions.description} IS NULL OR ${transactions.description} = ''`),
    getDb()
      .select({ count: count() })
      .from(transactions)
      .where(sql`${transactions.type} IS NULL OR ${transactions.type} = ''`),
    getDb()
      .select({ count: count() })
      .from(transactions)
      .where(sql`${transactions.date} IS NULL`),
    getDb()
      .select({ count: count() })
      .from(transactions)
      .where(sql`${transactions.officialId} NOT IN (SELECT id FROM officials)`),
    getDb()
      .select({ count: count() })
      .from(officials)
      .where(
        sql`${officials.id} NOT IN (SELECT DISTINCT official_id FROM transactions)`
      ),
  ]);

  const duration = Date.now() - startTime;
  const issues =
    missingDesc.count + missingType.count + missingDate.count + orphaned.count;

  const report = {
    timestamp: new Date().toISOString(),
    duration: `${duration}ms`,
    officials: officialCount.count,
    transactions: txCount.count,
    needsReview: reviewCount.count,
    checks: {
      missingDescription: missingDesc.count,
      missingType: missingType.count,
      missingDate: missingDate.count,
      orphanedTransactions: orphaned.count,
      officialsWithNoTransactions: emptyOfficials.count,
    },
    totalIssues: issues,
    result: issues === 0 ? "PASS" : "FAIL",
  };

  return NextResponse.json(report);
}
