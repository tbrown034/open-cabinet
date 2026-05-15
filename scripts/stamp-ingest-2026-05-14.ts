/**
 * One-shot: stamp `lastIngestedDate` + `lastIngestedNewCount` on the
 * 7 officials we ingested on 2026-05-14. These two fields feed the
 * "new content" banners on the landing page and per-official pages.
 */
import { readFile, writeFile } from "fs/promises";
import path from "path";

const INGESTED = {
  "trump-donald-j": 3696, // Part 1 (+69) + Part 2 (+3627)
  "kupor-scott-a": 2,
  "phelan-john": 14,
  "miran-stephen": 7,
  "kratsios-michael-j": 6,
  "vaden-stephen-a": 6, // newly bootstrapped — entire file is new
  "isaacman-jared": 145, // newly bootstrapped — entire file is new
};

async function main() {
  const today = "2026-05-14";
  for (const [slug, newCount] of Object.entries(INGESTED)) {
    const fpath = path.resolve(`data/officials/${slug}.json`);
    const d = JSON.parse(await readFile(fpath, "utf-8"));
    d.lastIngestedDate = today;
    d.lastIngestedNewCount = newCount;
    await writeFile(fpath, JSON.stringify(d, null, 2) + "\n");
    console.log(`  ${slug}: +${newCount} (lastIngestedDate=${today})`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
