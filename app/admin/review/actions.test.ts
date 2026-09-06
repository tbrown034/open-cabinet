import { execFileSync } from "child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { beforeEach, expect, it, vi } from "vitest";
import { getOfficialBySlug } from "@/lib/data";
import { decideReview, type ReviewItem } from "@/lib/review-queue";
import { recordIdsFor, resetRowVerificationCache, REVIEW_DECISIONS_PATH } from "@/lib/row-verification";
import type { OfficialData, Transaction } from "@/lib/types";
import { rebuildRowStates, recordHeldDecision, recordRowDecision } from "./actions";

vi.mock("child_process", () => ({ execFileSync: vi.fn() }));
vi.mock("fs", () => ({ existsSync: vi.fn(), mkdirSync: vi.fn(), readFileSync: vi.fn(), renameSync: vi.fn(), writeFileSync: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NEXT_NOT_FOUND"); },
  redirect: (url: string) => { throw new Error(`REDIRECT ${url}`); },
}));
vi.mock("@/lib/data", () => ({ getOfficialBySlug: vi.fn() }));
vi.mock("@/lib/review-queue", () => ({ decideReview: vi.fn() }));
vi.mock("@/lib/row-verification", async (original) => ({ ...await original<object>(), resetRowVerificationCache: vi.fn() }));

const transaction: Transaction = { description: "Example lot", ticker: null, type: "Purchase", date: "2026-01-01", amount: "$1,001-$15,000", lateFilingFlag: false };
const recordId = recordIdsFor([transaction])[0];
const slug = "example-person";

function rowForm(overrides: Record<string, string> = {}) {
  const form = new FormData();
  for (const [key, value] of Object.entries({ slug, recordId, decision: "confirmed", evidence: "page 2, printed row 4, amount matches", ...overrides })) form.set(key, value);
  return form;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(headers).mockResolvedValue(new Headers({ host: "localhost:3003" }) as Awaited<ReturnType<typeof headers>>);
  vi.mocked(getOfficialBySlug).mockResolvedValue({ name: "Person Example", slug, transactions: [transaction] } as OfficialData);
  vi.mocked(existsSync).mockReturnValue(true);
  vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ decisions: [{ recordId: "unrelated", evidence: "keep me" }, { recordId, evidence: "old evidence" }] }));
  vi.mocked(decideReview).mockReturnValue({ id: "held-one", status: "decided" } as ReviewItem);
});

it.each(["open-cabinet.org", "localhost.evil.test", "127.0.0.1.evil.test", ""])("blocks every action before any I/O on host %s", async (host) => {
  vi.mocked(headers).mockResolvedValue(new Headers({ host, "x-forwarded-host": "localhost" }) as Awaited<ReturnType<typeof headers>>);
  await expect(recordHeldDecision(new FormData())).rejects.toThrow("NEXT_NOT_FOUND");
  await expect(recordRowDecision(rowForm())).rejects.toThrow("NEXT_NOT_FOUND");
  await expect(rebuildRowStates()).rejects.toThrow("NEXT_NOT_FOUND");
  for (const fn of [getOfficialBySlug, decideReview, existsSync, readFileSync, mkdirSync, writeFileSync, renameSync, execFileSync, revalidatePath]) expect(fn).not.toHaveBeenCalled();
});

it("records a held filing decision as trevor and revalidates", async () => {
  const form = new FormData();
  form.set("id", "held-one");
  form.set("decision", " page 2 agrees with OCR ");
  await expect(recordHeldDecision(form)).rejects.toThrow("REDIRECT /admin/review?message=");
  expect(decideReview).toHaveBeenCalledWith("held-one", "page 2 agrees with OCR", "trevor");
  expect(revalidatePath).toHaveBeenCalledWith("/admin/review");
});

it("rejects blank filing decisions and stale held items", async () => {
  const form = new FormData();
  form.set("id", "held-one");
  form.set("decision", "  ");
  await expect(recordHeldDecision(form)).rejects.toThrow("?error=");
  expect(decideReview).not.toHaveBeenCalled();
  form.set("decision", "page 2 agrees");
  vi.mocked(decideReview).mockReturnValue(null);
  await expect(recordHeldDecision(form)).rejects.toThrow("?error=");
  expect(revalidatePath).not.toHaveBeenCalled();
});

it.each(["confirmed", "rejected"])("saves %s in the CLI format, replaces the previous decision and preserves other rows", async (decision) => {
  await expect(recordRowDecision(rowForm({ decision }))).rejects.toThrow("REDIRECT /admin/review?message=");
  const [temporary, json] = vi.mocked(writeFileSync).mock.calls[0];
  expect(temporary).toBe(`${REVIEW_DECISIONS_PATH}.tmp`);
  const saved = JSON.parse(json as string);
  expect(saved.decisions).toHaveLength(2);
  expect(saved.decisions[0]).toEqual({ recordId: "unrelated", evidence: "keep me" });
  expect(saved.decisions[1]).toEqual({
    recordId, slug, decision, evidence: "page 2, printed row 4, amount matches", decidedBy: "trevor", decidedAt: expect.any(String),
  });
  expect(new Date(saved.decisions[1].decidedAt).toISOString()).toBe(saved.decisions[1].decidedAt);
  expect(renameSync).toHaveBeenCalledWith(temporary, REVIEW_DECISIONS_PATH);
  expect(revalidatePath).toHaveBeenCalledWith("/admin/review");
  expect(execFileSync).not.toHaveBeenCalled();
});

it("creates the decisions file when it is absent", async () => {
  vi.mocked(existsSync).mockReturnValue(false);
  await expect(recordRowDecision(rowForm())).rejects.toThrow("?message=");
  expect(readFileSync).not.toHaveBeenCalled();
  expect(JSON.parse(vi.mocked(writeFileSync).mock.calls[0][1] as string).decisions).toHaveLength(1);
});

it.each<Record<string, string>>([{ evidence: "  " }, { decision: "corrected" }, { recordId: "not-a-published-row" }, { slug: "../../secrets" }])("rejects invalid row submissions without writing: %j", async (overrides) => {
  await expect(recordRowDecision(rowForm(overrides))).rejects.toThrow("?error=");
  expect(writeFileSync).not.toHaveBeenCalled();
  expect(revalidatePath).not.toHaveBeenCalled();
});

it("does not overwrite an unreadable decision file", async () => {
  vi.mocked(readFileSync).mockReturnValue("broken JSON");
  await expect(recordRowDecision(rowForm())).rejects.toThrow();
  expect(writeFileSync).not.toHaveBeenCalled();
});

it("runs the fixed rebuild command at the repo root, clears cached states and returns its last lines", async () => {
  vi.mocked(headers).mockResolvedValue(new Headers({ host: "127.0.0.1:3003" }) as Awaited<ReturnType<typeof headers>>);
  vi.mocked(execFileSync).mockReturnValue(Array.from({ length: 20 }, (_, i) => `line-${i}`).join("\n"));
  let location = "";
  try { await rebuildRowStates(); } catch (error) { location = (error as Error).message; }
  expect(execFileSync).toHaveBeenCalledWith("pnpm", ["row-verification"], expect.objectContaining({ cwd: process.cwd(), encoding: "utf-8" }));
  expect(resetRowVerificationCache).toHaveBeenCalledOnce();
  expect(revalidatePath).toHaveBeenCalledWith("/admin/review");
  expect(decodeURIComponent(location)).toContain("line-8\n");
  expect(decodeURIComponent(location)).toContain("line-19");
  expect(decodeURIComponent(location)).not.toContain("line-7");
});

it("shows rebuild failure output without reporting success", async () => {
  vi.mocked(execFileSync).mockImplementation(() => { throw Object.assign(new Error("failed"), { stdout: "partial output", stderr: "no cross-check log" }); });
  await expect(rebuildRowStates()).rejects.toThrow("?error=Rebuild+failed.");
  expect(resetRowVerificationCache).not.toHaveBeenCalled();
  expect(revalidatePath).not.toHaveBeenCalled();
});
