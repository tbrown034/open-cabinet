/** Print guidance for manually curating data/news-coverage.json.
 * This command does not call a search API or add articles. */
import { readFile } from "fs/promises";
import { join } from "path";

const NEWS_PATH = join(process.cwd(), "data", "news-coverage.json");

interface NewsItem {
  official: string;
  headline: string;
  source: string;
  date: string;
  url: string;
  relevance: string;
}

async function main() {
  console.log("=== Open Cabinet News Search ===\n");

  // Load existing news
  const raw = await readFile(NEWS_PATH, "utf-8");
  const existing: NewsItem[] = JSON.parse(raw);

  console.log(`Current news articles: ${existing.length}`);
  console.log(`Sources: ${[...new Set(existing.map((n) => n.source))].join(", ")}`);
  console.log(`Officials covered: ${[...new Set(existing.map((n) => n.official))].length}`);

  const latestDate = existing.reduce((latest, n) =>
    n.date > latest ? n.date : latest, ""
  );
  console.log(`Most recent article: ${latestDate}`);

  console.log(`\n--- How to update news coverage ---`);
  console.log(`1. Search major outlets for new reporting on tracked officials`);
  console.log(`2. Key sources: ProPublica, NOTUS, CNBC, Bloomberg, KFF Health News`);
  console.log(`3. Add entries to data/news-coverage.json`);
  console.log(`4. Each entry needs: official (slug), headline, source, date, url, relevance`);
  console.log(`5. Run 'pnpm run seed' to update the database`);
  console.log(`\nTo automate: integrate Anthropic web_search tool or a news API.`);
}

main().catch(console.error);
