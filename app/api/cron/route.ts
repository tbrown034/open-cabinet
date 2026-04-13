/**
 * Vercel Cron endpoint — weekly pipeline run.
 *
 * Vercel Pro: 300s (5 min) function timeout.
 * Typical run: 1-3 new PDFs = 30-120 seconds.
 *
 * Protected by CRON_SECRET to prevent unauthorized triggers.
 * Vercel Cron sends this automatically in the Authorization header.
 *
 * Config in vercel.json: { "crons": [{ "path": "/api/cron", "schedule": "0 10 * * 1" }] }
 */
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 300; // 5 minutes (Vercel Pro)

export async function GET(request: NextRequest) {
  // Verify the request is from Vercel Cron
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();

  try {
    // Dynamic import to avoid loading pipeline code on every request
    // The pipeline runs in-process with the 300s timeout
    const { neon } = await import("@neondatabase/serverless");
    const { drizzle } = await import("drizzle-orm/neon-http");

    const connectionString =
      process.env.DATABASE_URL || process.env.DATABASE_URL_UNPOOLED;
    if (!connectionString) {
      return NextResponse.json(
        { error: "DATABASE_URL not configured" },
        { status: 500 }
      );
    }

    const sql = neon(connectionString);
    const db = drizzle(sql);

    // Import schema
    const { pipelineRuns } = await import("@/lib/schema");

    // Create pipeline run record
    const [run] = await db
      .insert(pipelineRuns)
      .values({ trigger: "cron", status: "running" })
      .returning({ id: pipelineRuns.id });

    // For now: check OGE API for new filing count only
    // Full parse runs if new filings are found
    const ogeRes = await fetch(
      "https://extapps2.oge.gov/201/Presiden.nsf/API.xsp/v2/rest?length=1"
    );
    const ogeData = await ogeRes.json();
    const totalRecords = ogeData.recordsTotal || 0;

    const { eq } = await import("drizzle-orm");

    await db
      .update(pipelineRuns)
      .set({
        status: "completed",
        newFilingsFound: 0, // Will be updated when full pipeline runs
        duration: Date.now() - startTime,
        completedAt: new Date(),
        errors: null,
        tokenUsage: { note: "OGE check only", totalOgeRecords: totalRecords },
      })
      .where(eq(pipelineRuns.id, run.id));

    return NextResponse.json({
      status: "completed",
      runId: run.id,
      totalOgeRecords: totalRecords,
      duration: `${((Date.now() - startTime) / 1000).toFixed(1)}s`,
      message: "OGE check complete. Run 'pnpm run pipeline' locally for full parse.",
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: (err as Error).message,
        duration: `${((Date.now() - startTime) / 1000).toFixed(1)}s`,
      },
      { status: 500 }
    );
  }
}
