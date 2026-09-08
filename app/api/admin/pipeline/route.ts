/**
 * Admin API: Pipeline status and history.
 *
 * GET  /api/admin/pipeline — Returns recent pipeline runs
 */
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { pipelineRuns } from "@/lib/schema";
import { desc } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const runs = await getDb()
    .select()
    .from(pipelineRuns)
    .orderBy(desc(pipelineRuns.ranAt))
    .limit(20);

  return NextResponse.json({ runs });
}
