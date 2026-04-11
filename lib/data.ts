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

export async function getAllOfficialSlugs(): Promise<string[]> {
  const index = await getOfficialsIndex();
  return index.officials.map((o) => o.slug);
}
