import { readFile } from "fs/promises";
import path from "path";
import type { AmountRange, OfficialData, OfficialsIndex } from "./types";
import { companyGroupName, resolveTicker } from "./assets";

const DATA_DIR = path.join(process.cwd(), "data");

export async function getOfficialsIndex(): Promise<OfficialsIndex> {
  const filePath = path.join(DATA_DIR, "meta", "officials-index.json");
  const raw = await readFile(filePath, "utf-8");
  return JSON.parse(raw);
}

export async function getOfficialBySlug(
  slug: string
): Promise<OfficialData | null> {
  try {
    const filePath = path.join(DATA_DIR, "officials", `${slug}.json`);
    const raw = await readFile(filePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function getAllOfficials(): Promise<OfficialData[]> {
  const index = await getOfficialsIndex();
  const officialPromises = [];
  for (const official of index.officials) {
    // Exclude prior-administration holdovers from the current roster. Their
    // detail pages stay reachable via getOfficialBySlug, but they are kept
    // out of every aggregate view and headline total.
    if (official.dataStatus === "parsed" && !official.formerOfficial) {
      officialPromises.push(getOfficialBySlug(official.slug));
    }
  }
  const officials = await Promise.all(officialPromises);
  return officials.filter((o): o is OfficialData => o !== null);
}

export interface CompanyTrade {
  officialName: string;
  officialSlug: string;
  officialTitle: string;
  agency: string;
  description: string;
  ticker: string;
  type: string;
  date: string;
  amount: AmountRange | null;
  lateFilingFlag: boolean;
}

export interface CompanyData {
  ticker: string;
  companyName: string;
  trades: CompanyTrade[];
}

// Regulatory context for key companies
export const COMPANY_CONTEXT: Record<string, string> = {
  LBRT: "Liberty Energy is a fracking services company. The Department of Energy regulates energy production and policy.",
  FISV: "Fiserv is a financial technology company processing payments for banks. The Treasury Department and Federal Reserve regulate financial services.",
  MSFT: "Microsoft is a major government contractor with billions in federal cloud computing contracts (Azure Government, JEDI/JWCC).",
  AMZN: "Amazon holds major government cloud contracts (AWS GovCloud) and is regulated by the FTC, DOJ, and FAA (drone delivery).",
  AAPL: "Apple is regulated by the DOJ (antitrust), FTC (consumer protection), and Commerce Department (trade/tariffs).",
  TSLA: "Tesla is regulated by the DOT (vehicle safety), EPA (emissions credits), and DOE (EV policy).",
  BAC: "Bank of America is regulated by the Federal Reserve, OCC, FDIC, and SEC.",
  JPM: "JPMorgan Chase is the largest U.S. bank, regulated by the Federal Reserve, OCC, and SEC.",
  GOOGL: "Alphabet/Google faces ongoing DOJ antitrust litigation and is regulated by the FTC.",
  META: "Meta Platforms faces FTC enforcement actions and congressional scrutiny over content moderation.",
  LMT: "Lockheed Martin is the largest U.S. defense contractor. The Department of Defense is its primary customer.",
  NOC: "Northrop Grumman is a major defense and intelligence contractor for DOD and the intelligence community.",
  COIN: "Coinbase is the largest U.S. crypto exchange, regulated by the SEC and subject to DOJ enforcement policy.",
  DJT: "Trump Media & Technology Group is the parent company of Truth Social, founded by President Trump.",
  NVDA: "NVIDIA supplies AI chips subject to Commerce Department export controls and is a major government AI contractor.",
};

// Display names for tickers whose filings only ever print the bare symbol.
// Used only when no filed description supplies a name; a filed full name
// always wins. Two earlier entries here named the wrong funds (GAJPX,
// GGLPX) and overrode the filing's own text, which is why the rule is now
// "fallback only" and every entry must match a filed description in tests.
const TICKER_NAME_OVERRIDES: Record<string, string> = {
  DODFX: "Dodge & Cox International Stock Fund",
  GAJPX: "Goldman Sachs Dynamic Municipal Income Fund",
  GGLPX: "Goldman Sachs High Yield Municipal Fund",
  SPMD: "SPDR Portfolio S&P 400 Mid Cap ETF",
  SPY: "SPDR S&P 500 ETF Trust",
};
export { TICKER_NAME_OVERRIDES };

// Tickers that appear in filings with a symbol that doesn't match the named
// company. The trade rows keep the as-filed symbol; aggregation groups them
// under the real ticker so one company doesn't show up twice.
export const TICKER_ALIASES: Record<string, string> = {
  APPL: "AAPL", // "Apple Inc." filed with symbol APPL (Mullin, 6/24/2026)
};

export async function getTradesByTicker(): Promise<Map<string, CompanyData>> {
  const officials = await getAllOfficials();
  const tickerMap = new Map<string, CompanyData>();

  const descriptionsByTicker = new Map<string, string[]>();
  for (const official of officials) {
    for (const tx of official.transactions) {
      // Resolve at read time. A filed symbol that is a name suffix ("THE")
      // or an unreviewed ambiguous short symbol is withheld here, so it can
      // never become a company page. The stored row is untouched.
      const resolved = resolveTicker(tx.description, tx.ticker);
      if (!resolved.ticker) continue;
      const ticker = TICKER_ALIASES[resolved.ticker] ?? resolved.ticker;
      if (!tickerMap.has(ticker)) {
        tickerMap.set(ticker, { ticker, companyName: ticker, trades: [] });
        descriptionsByTicker.set(ticker, []);
      }
      descriptionsByTicker.get(ticker)!.push(tx.description);
      tickerMap.get(ticker)!.trades.push({
        officialName: official.name,
        officialSlug: official.slug,
        officialTitle: official.title,
        agency: official.agency,
        description: tx.description,
        ticker,
        type: tx.type,
        date: tx.date,
        amount: tx.amount,
        lateFilingFlag: tx.lateFilingFlag,
      });
    }
  }

  // Name each group from what was filed, never from a swap, bond or
  // preferred line; the override table is a fallback for bare symbols.
  for (const [ticker, group] of tickerMap) {
    const filed = companyGroupName(descriptionsByTicker.get(ticker) ?? [], ticker);
    group.companyName =
      filed.toUpperCase() === ticker ? (TICKER_NAME_OVERRIDES[ticker] ?? filed) : filed;
  }

  return tickerMap;
}

export async function getAllTickers(): Promise<string[]> {
  const tickerMap = await getTradesByTicker();
  return Array.from(tickerMap.keys()).sort();
}

export async function getAllOfficialSlugs(): Promise<string[]> {
  const index = await getOfficialsIndex();
  return index.officials.map((o) => o.slug);
}
