/**
 * Push a batch of questions through the local Ask box and save every
 * answer, so a person can read what it did (Trevor, Sept. 7: "run some
 * internal tests, 5-10 questions per batch, analyze them, make fixes").
 *
 *   ASKAI_PASSWORD=... npx tsx scripts/ask-batch.ts questions.txt out.json [http://localhost:3023]
 *
 * One question per line. Uses the alpha cookie the page would set. About
 * two cents a question.
 */
import dotenv from "dotenv";
import { readFileSync, writeFileSync } from "fs";
import { ASKAI_COOKIE, askaiToken } from "../lib/askai-access";

dotenv.config({ path: ".env.local" });

async function main() {
  const [file, out, base = "http://localhost:3023"] = process.argv.slice(2);
  const token = askaiToken();
  if (!token) throw new Error("ASKAI_PASSWORD (and a cookie secret) must be set");
  const questions = readFileSync(file, "utf-8").split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  const results: unknown[] = [];
  for (const question of questions) {
    const t0 = Date.now();
    const res = await fetch(`${base}/api/ask`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: base, cookie: `${ASKAI_COOKIE}=${token}` },
      body: JSON.stringify({ question }),
    });
    const j = (await res.json()) as Record<string, unknown>;
    const r = (j.result ?? null) as Record<string, unknown> | null;
    results.push({
      question,
      http: res.status,
      ms: Date.now() - t0,
      status: j.status,
      planText: j.planText,
      answer: j.answer,
      plan: j.plan ?? null,
      matched: r?.matchedRows ?? null,
      sample: Array.isArray(r?.rows) ? (r!.rows as Array<Record<string, unknown>>).slice(0, 3).map((x) => [x.officialName, x.date, x.type, String(x.description ?? "").slice(0, 40), x.amount]) : undefined,
      top: Array.isArray(r?.topOfficials) ? (r!.topOfficials as Array<Record<string, unknown>>).slice(0, 3) : Array.isArray(r?.topAssets) ? (r!.topAssets as Array<Record<string, unknown>>).slice(0, 3) : undefined,
    });
    console.log(`${String(res.status).padEnd(4)} ${String(j.status).padEnd(12)} ${question}`);
    console.log(`     ${String(j.answer).slice(0, 220)}`);
  }
  writeFileSync(out, JSON.stringify(results, null, 2));
}
main().catch((e) => { console.error(e); process.exit(1); });
