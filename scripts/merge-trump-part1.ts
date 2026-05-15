/**
 * Merge the already-parsed chunks of Trump 2026-05-14 Part 1
 * (Trump, Donald J.-05.08.2026-278T.pdf — 5 pages) into trump-donald-j.json.
 * Idempotent: dedupes by (description|date|type|amount).
 */
import { readFile, writeFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

const TRUMP_JSON = path.resolve("data/officials/trump-donald-j.json");
const CHUNK_FILES = [
  "data/pdfs/Trump, Donald J.-05.08.2026-278T.pages1-2.parsed.json",
  "data/pdfs/Trump, Donald J.-05.08.2026-278T.pages3-4.parsed.json",
  "data/pdfs/Trump, Donald J.-05.08.2026-278T.pages5-5.parsed.json",
];

const SOURCE_FILING = {
  date: "2026-05-14",
  url: "https://extapps2.oge.gov/201/Presiden.nsf/PAS+Index/5326D3AF5BE7C25385258DF7002DD1B7/$FILE/Trump%2C%20Donald%20J.-05.08.2026-278T.pdf",
  label: "Trump 2026-05-08 278T part 1",
};

const PART2_SOURCE = {
  date: "2026-05-14",
  url: "https://extapps2.oge.gov/201/Presiden.nsf/PAS+Index/405E4EC4E27BE8D185258DF7002DD1C0/$FILE/Trump%2C%20Donald%20J.-05.08.2026-278T(2).pdf",
  label: "Trump 2026-05-08 278T part 2",
};

interface Tx {
  description: string;
  ticker?: string | null;
  type: string;
  date: string;
  amount: string;
  lateFilingFlag: boolean;
}

function txKey(t: Tx): string {
  return `${t.description.trim().toLowerCase()}|${t.date}|${t.type.toLowerCase()}|${t.amount}`;
}

async function main() {
  const trump = JSON.parse(await readFile(TRUMP_JSON, "utf-8"));
  const existing = new Set<string>(trump.transactions.map(txKey));
  const before = trump.transactions.length;

  let added = 0;
  for (const file of CHUNK_FILES) {
    if (!existsSync(file)) continue;
    const parsed = JSON.parse(await readFile(file, "utf-8"));
    for (const tx of parsed.transactions) {
      const { confidence, ...rest } = tx;
      const k = txKey(rest);
      if (existing.has(k)) continue;
      existing.add(k);
      trump.transactions.push(rest);
      added++;
    }
  }

  trump.transactions.sort((a: Tx, b: Tx) => {
    const d = (b.date || "").localeCompare(a.date || "");
    return d !== 0 ? d : (a.description || "").localeCompare(b.description || "");
  });

  // Ensure both 2026-05-14 source filings are recorded once
  const existingUrls = new Set<string>(
    (trump.sourceFilings || []).map((s: any) => s.url)
  );
  const newSources: any[] = [];
  for (const s of [SOURCE_FILING, PART2_SOURCE]) {
    if (!existingUrls.has(s.url)) newSources.push(s);
  }
  trump.sourceFilings = [...newSources, ...(trump.sourceFilings || [])];
  trump.mostRecentFilingDate = "2026-05-14";

  await writeFile(TRUMP_JSON, JSON.stringify(trump, null, 2) + "\n");
  console.log(`Trump txns: ${before} → ${trump.transactions.length} (+${added})`);
  console.log(`sourceFilings: ${trump.sourceFilings.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
