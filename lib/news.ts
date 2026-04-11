import { readFile } from "fs/promises";
import path from "path";

export interface NewsItem {
  official: string;
  headline: string;
  source: string;
  date: string;
  url: string;
  relevance: string;
}

export async function getNewsCoverage(): Promise<NewsItem[]> {
  const filePath = path.join(process.cwd(), "data", "news-coverage.json");
  const raw = await readFile(filePath, "utf-8");
  const items: NewsItem[] = JSON.parse(raw);
  return items.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
}

export async function getNewsForOfficial(slug: string): Promise<NewsItem[]> {
  const all = await getNewsCoverage();
  return all.filter((item) => item.official === slug);
}
