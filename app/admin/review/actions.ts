"use server";

import { execFileSync } from "child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import path from "path";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getOfficialBySlug } from "@/lib/data";
import { decideReview } from "@/lib/review-queue";
import {
  REVIEW_DECISIONS_PATH,
  recordIdsFor,
  resetRowVerificationCache,
  type ReviewDecision,
} from "@/lib/row-verification";
import { requireLocalReview } from "./local-only";

const REVIEW_PAGE = "/admin/review";

function finish(key: "message" | "error" | "output", text: string): never {
  redirect(`${REVIEW_PAGE}?${new URLSearchParams({ [key]: text })}`);
}

function requiredText(form: FormData, name: string): string {
  const value = form.get(name);
  if (typeof value !== "string" || !value.trim()) finish("error", `${name} is required.`);
  return value.trim();
}

export async function recordHeldDecision(form: FormData): Promise<void> {
  await requireLocalReview();
  const id = requiredText(form, "id");
  const decision = requiredText(form, "decision");
  if (!decideReview(id, decision, "trevor")) {
    finish("error", "This held item is no longer open. Refresh the page.");
  }
  revalidatePath(REVIEW_PAGE);
  finish("message", "Filing decision recorded.");
}

export async function recordRowDecision(form: FormData): Promise<void> {
  await requireLocalReview();
  const slug = requiredText(form, "slug");
  const recordId = requiredText(form, "recordId");
  const decision = requiredText(form, "decision");
  const evidence = requiredText(form, "evidence");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) finish("error", "Invalid official slug.");
  if (decision !== "confirmed" && decision !== "rejected") finish("error", "Invalid row decision.");
  const official = await getOfficialBySlug(slug);
  if (!official || !recordIdsFor(official.transactions).includes(recordId)) {
    finish("error", "This published row could not be found. Refresh the page.");
  }

  // Match scripts/review.ts's file shape and replacement rule. Keep this
  // read/modify/write synchronous, with an atomic rename for readers.
  const current: { decisions: ReviewDecision[] } = existsSync(REVIEW_DECISIONS_PATH)
    ? JSON.parse(readFileSync(REVIEW_DECISIONS_PATH, "utf-8"))
    : { decisions: [] };
  const entry: ReviewDecision = {
    recordId, slug, decision, evidence, decidedBy: "trevor", decidedAt: new Date().toISOString(),
  };
  current.decisions = [...current.decisions.filter((item) => item.recordId !== recordId), entry];
  mkdirSync(path.dirname(REVIEW_DECISIONS_PATH), { recursive: true });
  const temporary = `${REVIEW_DECISIONS_PATH}.tmp`;
  writeFileSync(temporary, JSON.stringify(current, null, 2) + "\n");
  renameSync(temporary, REVIEW_DECISIONS_PATH);
  revalidatePath(REVIEW_PAGE);
  finish("message", `Row ${decision}. Rebuild row states to apply recorded decisions.`);
}

function lastLines(output: string): string {
  return output.trim().split(/\r?\n/).slice(-12).join("\n").slice(-6000);
}

export async function rebuildRowStates(): Promise<void> {
  await requireLocalReview();
  let output: string;
  try {
    output = execFileSync("pnpm", ["row-verification"], {
      cwd: process.cwd(), encoding: "utf-8", timeout: 60_000,
      maxBuffer: 4 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    const failure = error as { stdout?: string | Buffer; stderr?: string | Buffer };
    finish("error", `Rebuild failed.\n${lastLines(`${failure.stdout ?? ""}\n${failure.stderr ?? ""}`) || "Could not run pnpm row-verification."}`);
  }
  resetRowVerificationCache();
  revalidatePath(REVIEW_PAGE);
  finish("output", lastLines(output) || "Row states rebuilt.");
}
