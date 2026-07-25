import { readFile } from "fs/promises";
import path from "path";

/**
 * Optional LLM-drafted editorial lede for the subscriber digest.
 *
 * Generated locally by scripts/generate-digest-lede.ts and committed as
 * data/meta/digest-lede.json, keyed to the digest's idempotency key (the
 * sha256 of its filing-URL set). The key match means a lede can never attach
 * to a digest other than the one it was written for: if new filings land
 * after generation, the key changes and the stale lede silently drops out.
 * The admin reviews the lede on /admin before sending.
 */
interface DigestLedeFile {
  sendKey: string;
  lede: string;
  generated: string;
  model: string;
}

export async function getDigestLede(sendKey: string): Promise<string | null> {
  try {
    const raw = await readFile(
      path.join(process.cwd(), "data", "meta", "digest-lede.json"),
      "utf-8"
    );
    const parsed: DigestLedeFile = JSON.parse(raw);
    if (parsed.sendKey !== sendKey || !parsed.lede?.trim()) return null;
    return parsed.lede.trim();
  } catch {
    return null;
  }
}
