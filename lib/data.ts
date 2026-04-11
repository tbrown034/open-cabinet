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

export async function getAllOfficialSlugs(): Promise<string[]> {
  const index = await getOfficialsIndex();
  return index.officials.map((o) => o.slug);
}
