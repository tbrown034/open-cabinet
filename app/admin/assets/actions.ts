"use server";

import { redirect } from "next/navigation";
import { acceptName, rejectName } from "@/scripts/asset-decide";
import { requireLocalReview } from "../review/local-only";

/** Record a dictionary entry from the local admin queue. */
export async function acceptAsset(formData: FormData): Promise<void> {
  await requireLocalReview();
  const key = String(formData.get("nameKey") ?? "");
  const symbol = String(formData.get("symbol") ?? "");
  const evidence = String(formData.get("evidence") ?? "");
  const r = acceptName(key, symbol, evidence, "trevor");
  redirect(`/admin/assets?${r.ok ? `message=${encodeURIComponent(`Accepted ${r.note}. Rebuild with pnpm asset-resolution.`)}` : `error=${encodeURIComponent(r.why)}`}`);
}

/** Record a never-resolve exception from the local admin queue. */
export async function rejectAsset(formData: FormData): Promise<void> {
  await requireLocalReview();
  const key = String(formData.get("nameKey") ?? "");
  const reason = String(formData.get("reason") ?? "");
  const r = rejectName(key, reason, "trevor");
  redirect(`/admin/assets?${r.ok ? `message=${encodeURIComponent(`Rejected ${key.toUpperCase()}. Rebuild with pnpm asset-resolution.`)}` : `error=${encodeURIComponent(r.why)}`}`);
}
