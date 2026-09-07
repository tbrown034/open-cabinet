import { existsSync, readFileSync } from "fs";
import path from "path";
import { notFound } from "next/navigation";
import { requireLocalReview } from "../review/local-only";

/**
 * Serve a filing PDF from data/pdfs so a review screen can open it in a tab.
 * Local only; the name is confined to the pdfs directory.
 */
export const runtime = "nodejs";

export async function GET(req: Request) {
  await requireLocalReview();
  const name = new URL(req.url).searchParams.get("name") ?? "";
  const file = path.basename(name);
  if (!file.toLowerCase().endsWith(".pdf")) notFound();
  const full = path.join(process.cwd(), "data", "pdfs", file);
  if (!existsSync(full)) notFound();
  return new Response(readFileSync(full), { headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${file}"` } });
}
