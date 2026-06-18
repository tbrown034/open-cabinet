/**
 * Vercel Cron endpoint — weekly OGE filing monitor.
 *
 * Vercel Pro: 300s (5 min) function timeout.
 * Typical run: fetch OGE API, diff PDF URLs, record and email the result.
 *
 * Protected by CRON_SECRET to prevent unauthorized triggers.
 * Vercel Cron sends this automatically in the Authorization header.
 *
 * Config in vercel.json: { "crons": [{ "path": "/api/cron", "schedule": "0 10 * * 1" }] }
 */
import { NextRequest, NextResponse } from "next/server";
import { notify } from "@/lib/notify";
import {
  diffNewFilings,
  fetchOgeRecords,
  getTargetFilings,
  loadKnownFilingUrlsFromData,
} from "@/lib/oge-filings";

export const maxDuration = 300; // 5 minutes (Vercel Pro)

export async function GET(request: NextRequest) {
  // Verify the request is from Vercel Cron
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 500 }
    );
  }
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();
  let runId: number | null = null;
  let db:
    | Awaited<ReturnType<typeof import("drizzle-orm/neon-http").drizzle>>
    | null = null;

  try {
    // Dynamic import to avoid loading database code on every request.
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
    db = drizzle(sql);

    // Import schema
    const { pipelineRuns } = await import("@/lib/schema");

    // Create pipeline run record
    const [run] = await db
      .insert(pipelineRuns)
      .values({ trigger: "cron", status: "running" })
      .returning({ id: pipelineRuns.id });
    runId = run.id;

    const { records, totalRecords } = await fetchOgeRecords();
    const targetFilings = getTargetFilings(records);
    const knownUrls = await loadKnownFilingUrlsFromData();
    const newFilings = diffNewFilings(targetFilings, knownUrls);

    const { eq } = await import("drizzle-orm");

    await db
      .update(pipelineRuns)
      .set({
        status: "completed",
        newFilingsFound: newFilings.length,
        duration: Date.now() - startTime,
        completedAt: new Date(),
        errors: null,
        tokenUsage: {
          note: "OGE URL-diff monitor only",
          totalOgeRecords: totalRecords,
          target278TFilings: targetFilings.length,
        },
      })
      .where(eq(pipelineRuns.id, run.id));

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const filingList = newFilings
      .slice(0, 10)
      .map((filing) => `${filing.name} — ${filing.docDate.slice(0, 10)}`)
      .join("\n");
    await notify({
      type: "new_filings",
      headline:
        newFilings.length === 0
          ? "OGE check OK · 0 new filings found"
          : `OGE check found ${newFilings.length} new filing${newFilings.length === 1 ? "" : "s"}`,
      summary:
        newFilings.length === 0
          ? `Polled the OGE public portal and found no new downloadable 278-T PDFs beyond the URLs already tracked by Open Cabinet.`
          : `Polled the OGE public portal and found ${newFilings.length} downloadable 278-T PDF${newFilings.length === 1 ? "" : "s"} not yet tracked by Open Cabinet.\n\n${filingList}`,
      metadata: {
        "Total OGE records": totalRecords.toLocaleString(),
        "Tracked 278-T PDFs": targetFilings.length,
        "New filing URLs": newFilings.length,
        "Run duration": `${elapsed}s`,
        "Pipeline run #": run.id,
      },
    });

    return NextResponse.json({
      status: "completed",
      runId: run.id,
      totalOgeRecords: totalRecords,
      target278TFilings: targetFilings.length,
      newFilingsFound: newFilings.length,
      duration: `${((Date.now() - startTime) / 1000).toFixed(1)}s`,
      message:
        newFilings.length === 0
          ? "OGE URL-diff check complete."
          : "New OGE filings found. Run the GitHub Actions pipeline or pnpm run pipeline for parse/ingest.",
    });
  } catch (err) {
    if (runId && db) {
      try {
        const { eq } = await import("drizzle-orm");
        const { pipelineRuns } = await import("@/lib/schema");
        await db
          .update(pipelineRuns)
          .set({
            status: "failed",
            duration: Date.now() - startTime,
            completedAt: new Date(),
            errors: [{ step: "cron", error: (err as Error).message }],
          })
          .where(eq(pipelineRuns.id, runId));
      } catch {
        // The notification below is the durable failure signal.
      }
    }

    // Notify admin of failure
    await notify({
      type: "pipeline_error",
      details: `Cron job failed: ${(err as Error).message}`,
      metadata: {
        duration: `${((Date.now() - startTime) / 1000).toFixed(1)}s`,
        environment: process.env.VERCEL_ENV || "local",
      },
    });

    return NextResponse.json(
      {
        error: (err as Error).message,
        duration: `${((Date.now() - startTime) / 1000).toFixed(1)}s`,
      },
      { status: 500 }
    );
  }
}
