/**
 * Admin API: Run data validation.
 *
 * POST /api/admin/validate — Runs validation checks and returns report
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { officials, transactions } from "@/lib/schema";
import { count, eq, sql } from "drizzle-orm";
import { auth, isAdmin } from "@/lib/auth";
import { headers } from "next/headers";

export async function POST() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();

  // Count totals
  const [officialCount] = await db.select({ count: count() }).from(officials);
  const [txCount] = await db.select({ count: count() }).from(transactions);
  const [reviewCount] = await db
    .select({ count: count() })
    .from(transactions)
    .where(eq(transactions.needsReview, true));

  // Check for missing required fields
  const [missingDesc] = await db
    .select({ count: count() })
    .from(transactions)
    .where(sql`${transactions.description} IS NULL OR ${transactions.description} = ''`);

  const [missingType] = await db
    .select({ count: count() })
    .from(transactions)
    .where(sql`${transactions.type} IS NULL OR ${transactions.type} = ''`);

  const [missingDate] = await db
    .select({ count: count() })
    .from(transactions)
    .where(sql`${transactions.date} IS NULL`);

  // Check for orphaned transactions (no matching official)
  const [orphaned] = await db
    .select({ count: count() })
    .from(transactions)
    .where(
      sql`${transactions.officialId} NOT IN (SELECT id FROM officials)`
    );

  // Officials with no transactions
  const [emptyOfficials] = await db
    .select({ count: count() })
    .from(officials)
    .where(
      sql`${officials.id} NOT IN (SELECT DISTINCT official_id FROM transactions)`
    );

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
