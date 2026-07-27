/** Read-only post-send verification. Counts and slugs only — no addresses. */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function main() {
  const { db } = await import("@/lib/db");
  const { digestRuns, notifiedFilings, emailSends } = await import("@/lib/schema");
  const { buildDigest } = await import("@/lib/digest");
  const { getSendScope } = await import("@/lib/updates");

  const runs = await db.select().from(digestRuns);
  console.log("=== digest_runs ===");
  for (const r of runs) {
    console.log(
      `  id ${r.id}  status=${r.status}  recipients=${r.recipientCount}  sentAt=${r.sentAt?.toISOString() ?? "-"}  approvedBy=${r.approvedBy ? "set" : "-"}`
    );
    const errs = r.errors as unknown[] | null;
    if (errs && errs.length) console.log("  errors:", JSON.stringify(errs));
    const chunks = r.chunks as { n: number; ok?: boolean; recipientCount?: number }[] | null;
    if (chunks) console.log("  chunks:", JSON.stringify(chunks));
  }

  const ledger = await db.select().from(notifiedFilings);
  console.log("");
  console.log("=== notified_filings ledger ===");
  console.log("  total rows:", ledger.length);
  const bySlug: Record<string, number> = {};
  for (const row of ledger) bySlug[row.officialSlug] = (bySlug[row.officialSlug] ?? 0) + 1;
  const recent = ledger.filter((r) => r.digestRunId != null);
  console.log("  rows attached to a digest run:", recent.length);
  const recentBySlug: Record<string, number> = {};
  for (const row of recent) recentBySlug[row.officialSlug] = (recentBySlug[row.officialSlug] ?? 0) + 1;
  console.log("  by official (this send):", JSON.stringify(recentBySlug));

  const sends = await db.select().from(emailSends);
  const digestSends = sends.filter((s) => s.kind === "digest");
  console.log("");
  console.log("=== email_sends (kind=digest) ===");
  console.log("  count:", digestSends.length);
  const byStatus: Record<string, number> = {};
  for (const s of digestSends) byStatus[s.status ?? "unknown"] = (byStatus[s.status ?? "unknown"] ?? 0) + 1;
  console.log("  by status:", JSON.stringify(byStatus));

  console.log("");
  console.log("=== what is still pending ===");
  const since = await getSendScope();
  const scoped = await buildDigest(since ? { ingestedOnOrAfter: since } : {});
  const all = await buildDigest();
  console.log("  scoped digest now:", scoped.items.length, "officials");
  console.log(
    "  unscoped backlog still pending:",
    all.items.length,
    "officials →",
    all.items.map((i) => `${i.slug}(${i.newCount})`).join(", ") || "none"
  );
}

main();
