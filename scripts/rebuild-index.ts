/**
 * Rebuild Officials Index
 *
 * Regenerates data/meta/officials-index.json from all JSON files
 * in data/officials/. Run after manually editing data files.
 *
 * Usage: pnpm run rebuild-index
 */

import { readFile, writeFile, readdir } from "fs/promises";
import path from "path";

interface OfficialData {
  name: string;
  slug: string;
  title: string;
  agency: string;
  level: string;
  mostRecentFilingDate: string;
  transactions: Array<{ amount: string }>;
}

async function main() {
  const officialsDir = path.join(process.cwd(), "data", "officials");
  const indexPath = path.join(process.cwd(), "data", "meta", "officials-index.json");

  const files = await readdir(officialsDir);
  const jsonFiles = files.filter((f) => f.endsWith(".json")).sort();

  const officials = [];
  let totalTx = 0;

  for (const file of jsonFiles) {
    const raw = await readFile(path.join(officialsDir, file), "utf-8");
    const data: OfficialData = JSON.parse(raw);
    const txCount = data.transactions.length;
    totalTx += txCount;

    officials.push({
      name: data.name,
      slug: data.slug,
      title: data.title,
      agency: data.agency,
      level: data.level,
      transactionCount: txCount,
      mostRecentFilingDate: data.mostRecentFilingDate,
      dataStatus: "parsed",
    });

    console.log(`  ${data.name}: ${txCount} transactions`);
  }

  const index = {
    lastUpdated: new Date().toISOString().split("T")[0],
    officials: officials.sort((a, b) => a.name.localeCompare(b.name)),
  };

  await writeFile(indexPath, JSON.stringify(index, null, 2));
  console.log(
    `\nIndex rebuilt: ${officials.length} officials, ${totalTx} transactions`
  );
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
