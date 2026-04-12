import { readFile } from "fs/promises";
import path from "path";
import type { OfficialData, OfficialsIndex } from "./types";

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
  const officials = await Promise.all(
    index.officials
      .filter((o) => o.dataStatus === "parsed")
      .map((o) => getOfficialBySlug(o.slug))
  );
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
  amount: string;
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

// Mapping for tickers where the description is just the ticker symbol
const TICKER_NAME_OVERRIDES: Record<string, string> = {
  DODFX: "Dodge & Cox International Stock Fund",
  GAJPX: "American Funds Growth Fund of America",
  GGLPX: "Goldman Sachs GQG Partners Intl Opps Fund",
  SPMD: "SPDR Portfolio S&P 400 Mid Cap ETF",
  SPY: "SPDR S&P 500 ETF Trust",
};

export async function getTradesByTicker(): Promise<Map<string, CompanyData>> {
  const officials = await getAllOfficials();
  const tickerMap = new Map<string, CompanyData>();

  for (const official of officials) {
    for (const tx of official.transactions) {
      if (!tx.ticker) continue;
      const ticker = tx.ticker.toUpperCase();
      if (!tickerMap.has(ticker)) {
        let name = tx.description.replace(/\s*\([^)]*\)\s*$/, "").trim();
        if (name.toUpperCase() === ticker || TICKER_NAME_OVERRIDES[ticker]) {
          name = TICKER_NAME_OVERRIDES[ticker] || name;
        }
        tickerMap.set(ticker, {
          ticker,
          companyName: name,
          trades: [],
        });
      }
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
