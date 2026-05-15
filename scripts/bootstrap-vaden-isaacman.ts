/**
 * Bootstrap data/officials/vaden-stephen-a.json and
 * data/officials/isaacman-jared.json from their already-parsed 278-T
 * PDFs. OGE API metadata is hard-coded from the 2026-04-17 records.
 */
import { readFile, writeFile } from "fs/promises";
import path from "path";

interface Tx {
  description: string;
  ticker: string | null;
  type: string;
  date: string;
  amount: string;
  lateFilingFlag: boolean;
}

async function bootstrap(opts: {
  name: string;
  slug: string;
  title: string;
  agency: string;
  level: string;
  party: "R" | "D";
  parsedPdfRelPath: string;
  sourceUrl: string;
  filingDocDate: string;
}) {
  const parsed = JSON.parse(
    await readFile(path.resolve(opts.parsedPdfRelPath), "utf-8")
  );
  const txs: Tx[] = parsed.transactions.map((t: any) => {
    const { confidence, ...rest } = t;
    return rest;
  });
  // Sort by date descending
  txs.sort((a, b) => {
    const d = (b.date || "").localeCompare(a.date || "");
    return d !== 0 ? d : (a.description || "").localeCompare(b.description || "");
  });

  const sales = txs.filter((t) => t.type.startsWith("Sale")).length;
  const purchases = txs.filter((t) => t.type === "Purchase").length;
  const late = txs.filter((t) => t.lateFilingFlag).length;

  const summaryParts: string[] = [];
  if (sales > 0) summaryParts.push(`${sales} sale${sales === 1 ? "" : "s"}`);
  if (purchases > 0) summaryParts.push(`${purchases} purchase${purchases === 1 ? "" : "s"}`);
  const lateNote = late > 0 ? ` ${late} were filed late.` : "";

  const summary = `${opts.name.split(",")[0]} reported ${summaryParts.join(" and ")} across ${txs.length} transactions in a single 278-T filing.${lateNote}`;

  const out = {
    name: opts.name,
    slug: opts.slug,
    title: opts.title,
    agency: opts.agency,
    level: opts.level,
    filingType: "278-T Periodic Transaction Report",
    mostRecentFilingDate: opts.filingDocDate,
    transactions: txs,
    summary,
    party: opts.party,
    sourceFilings: [
      {
        date: opts.filingDocDate,
        url: opts.sourceUrl,
        label: path.basename(opts.parsedPdfRelPath).replace(/\.parsed\.json$/i, ""),
      },
    ],
  };

  const outPath = path.resolve(`data/officials/${opts.slug}.json`);
  await writeFile(outPath, JSON.stringify(out, null, 2) + "\n");
  console.log(`Wrote ${outPath} — ${txs.length} txns (${sales}S / ${purchases}P, ${late} late)`);
}

async function main() {
  await bootstrap({
    name: "Vaden, Stephen A",
    slug: "vaden-stephen-a",
    title: "Deputy Secretary",
    agency: "Department of Agriculture",
    level: "Level II",
    party: "R",
    parsedPdfRelPath: "data/pdfs/Stephen-A-Vaden-03.19.2026-278T.parsed.json",
    sourceUrl:
      "https://extapps2.oge.gov/201/Presiden.nsf/PAS+Index/26AA499A708D62B285258DDC002DD79C/$FILE/Stephen-A-Vaden-03.19.2026-278T.pdf",
    filingDocDate: "2026-04-17",
  });

  await bootstrap({
    name: "Isaacman, Jared",
    slug: "isaacman-jared",
    title: "Administrator",
    agency: "National Aeronautics and Space Administration",
    level: "Level II",
    party: "R",
    parsedPdfRelPath: "data/pdfs/Jared-Isaacman-03.16.2026-278T.parsed.json",
    sourceUrl:
      "https://extapps2.oge.gov/201/Presiden.nsf/PAS+Index/2D566015C161DDA885258DDC002DB5D1/$FILE/Jared-Isaacman-03.16.2026-278T.pdf",
    filingDocDate: "2026-04-17",
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
