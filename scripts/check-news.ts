/**
 * News Coverage Search — finds published reporting on tracked officials.
 *
 * Uses AI-assisted web search to find articles about executive branch
 * financial conflicts from major outlets. Runs independently of the
 * main pipeline.
 *
 * Run: pnpm run check-news
 *
 * This is a placeholder that documents the intended workflow.
 * The actual search requires Claude Code or a web search API.
 * For now, news is manually curated in data/news-coverage.json.
 */
import { readFile, writeFile } from "fs/promises";
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
