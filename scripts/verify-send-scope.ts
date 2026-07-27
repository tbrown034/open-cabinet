/** Read-only: confirm the admin send path resolves to the published set. */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function main() {
  const { getSendScope, getPublicUpdates } = await import("@/lib/updates");
  const { buildDigest, digestIdempotencyKey } = await import("@/lib/digest");

  const published = await getPublicUpdates();
  const since = await getSendScope();
  console.log("published entries:", published.length);
  if (published[0]) {
    console.log(
      `newest published: ${published[0].date} — ${published[0].officialCount} officials, ${published[0].tradeCount} trades`
    );
  }
  console.log("derived send scope:", since ?? "(none — unscoped)");

  const d = await buildDigest(since ? { ingestedOnOrAfter: since } : {});
  console.log("");
  console.log("digest the admin panel will now build:");
  console.log("  officials: ", d.items.length, `(${d.items.map((i) => i.slug).join(", ")})`);
  console.log("  new trades:", d.items.reduce((s, i) => s + i.newCount, 0));
  console.log("  ledger writes (filingUrls):", d.filingUrls.length);
  console.log("  sendKey:", digestIdempotencyKey(d.filingUrls));

  const matches =
    published[0] &&
    published[0].officialCount === d.items.length &&
    published[0].tradeCount === d.items.reduce((s, i) => s + i.newCount, 0);
  console.log("");
  console.log(matches ? "MATCHES the published page." : "DOES NOT match the published page.");
}

main();
