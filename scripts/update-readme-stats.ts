/**
 * Rewrite the "Current data" table and the verification-state line in
 * README.md from the published dataset, using the same definitions as
 * lib/readme-stats.test.ts. Run after pnpm generate-exports.
 *
 *   pnpm readme-stats
 */
import { readFileSync, writeFileSync, readdirSync } from "fs";
import path from "path";
import { sumAmountEstimates, formatCompactCurrency } from "../lib/format";
import { resolveTicker } from "../lib/assets";
import { resolveSymbol } from "../lib/asset-registry";
import { readRowVerification, type VerificationState } from "../lib/row-verification";
import type { AmountRange } from "../lib/types";

interface Tx { description: string; ticker: string | null; type: string; date: string; amount: AmountRange | null; lateFilingFlag: boolean; verificationScore?: number }
interface Dataset { officials: Array<{ transactions: Tx[] }> }

const root = process.cwd();
const dataset: Dataset = JSON.parse(readFileSync(path.join(root, "public", "data", "full-dataset.json"), "utf-8"));
const allTx = dataset.officials.flatMap((o) => o.transactions);
const countedTx = allTx.filter((tx) => tx.verificationScore !== 0);
const fmt = (n: number) => n.toLocaleString("en-US");

const tickers = new Set<string>();
for (const t of allTx) {
  const r = resolveTicker(t.description, t.ticker);
  if (r.ticker) tickers.add(resolveSymbol(r.ticker));
}
const news = JSON.parse(readFileSync(path.join(root, "data", "news-coverage.json"), "utf-8"));
const docsDir = path.join(root, "data", "source-docs");
const docs = readdirSync(docsDir).filter((f) => f.endsWith(".json")).reduce((n, f) => n + JSON.parse(readFileSync(path.join(docsDir, f), "utf-8")).documents.length, 0);
const verification = readRowVerification();
if (!verification) throw new Error("run pnpm row-verification first");
const order: VerificationState[] = ["checked", "human_verified", "deterministic_agree", "two_models_agree", "audit_only", "single_read", "disputed"];
const stateLine = `Rows by verification state: ${order.map((k) => `${fmt(verification.summary.byState[k])} ${k}`).join("; ")}.`;

const rows: Record<string, string> = {
  "Officials tracked": fmt(dataset.officials.length),
  "Transactions": fmt(countedTx.length),
  "Rows under review (not counted in totals)": fmt(allTx.length - countedTx.length),
  "Estimated value": `~${formatCompactCurrency(sumAmountEstimates(countedTx).estimate)}`,
  "Late filings": fmt(countedTx.filter((t) => t.lateFilingFlag).length),
  "Companies searchable": fmt(tickers.size),
  "News articles linked": fmt(news.length),
  "Source filing PDFs linked": fmt(docs),
};

let readme = readFileSync(path.join(root, "README.md"), "utf-8");
for (const [label, value] of Object.entries(rows)) {
  const re = new RegExp(`^\\| ${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\| [^|]* \\|$`, "m");
  if (!re.test(readme)) throw new Error(`README row not found: ${label}`);
  readme = readme.replace(re, `| ${label} | ${value} |`);
}
readme = readme.replace(/Rows by verification state: [^\n]*?\. Counts are checked/, `${stateLine} Counts are checked`);
readme = readme.replace(/retain all 11,501 rows, including the [\d,]+ under review/, `retain all ${fmt(allTx.length)} rows, including the ${fmt(allTx.length - countedTx.length)} under review`);
writeFileSync(path.join(root, "README.md"), readme);
console.log(Object.entries(rows).map(([k, v]) => `${k}: ${v}`).join("\n"));
console.log(stateLine);
