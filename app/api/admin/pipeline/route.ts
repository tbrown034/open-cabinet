/**
 * Admin API: Pipeline status and history.
 *
 * GET  /api/admin/pipeline — Returns recent pipeline runs
 * POST /api/admin/pipeline — Triggers a new pipeline run (not implemented
 *   as a Vercel function — too long-running. Returns instructions.)
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { pipelineRuns } from "@/lib/schema";
import { desc } from "drizzle-orm";
import { auth, isAdmin } from "@/lib/auth";
import { headers } from "next/headers";

async function checkAdmin() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    return false;
  }
  return true;
}

export async function GET() {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const runs = await db
    .select()
    .from(pipelineRuns)
    .orderBy(desc(pipelineRuns.ranAt))
    .limit(20);

  return NextResponse.json({ runs });
}

export async function POST() {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Pipeline is too long-running for Vercel functions.
  // Return instructions for running locally.
  return NextResponse.json({
    message: "Pipeline must be run locally or via GitHub Actions.",
    instructions: [
      "Local: pnpm run pipeline",
      "Dry run: pnpm run pipeline -- --dry-run",
      "With verification: pnpm run pipeline -- --verify",
    ],
  });
}
