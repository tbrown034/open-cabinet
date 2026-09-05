/**
 * Review store for model-written official summaries.
 *
 * The rule: a model never writes into data/officials/*.json. It writes a
 * candidate into data/meta/summary-candidates.json, bound to the hash of
 * the fact block it was given. A person reads the candidate and publishes
 * it by id. Publishing copies the exact candidate text into the official
 * file with no model call, and refuses if the facts have changed since the
 * candidate was written, because then the prose describes a dataset that
 * no longer exists.
 *
 * The ingest never overwrites a summary. When new rows change the facts,
 * it records the new fact hash and a stale marker so the page and the
 * operator both know the prose is behind the data.
 */
import { existsSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import {
  buildFactBlock,
  computeStats,
  factHash,
  unwitnessedNumbers,
  type SummaryInput,
} from "./summary-facts";

export const CANDIDATES_PATH = path.resolve("data/meta/summary-candidates.json");

export interface SummaryCandidate {
  id: string;
  slug: string;
  /** SHA-256 of the fact block the model was given. */
  factSha256: string;
  model: string;
  generatedAt: string;
  text: string;
  /** Numbers in the text that the fact block does not contain. Empty is the bar. */
  unwitnessed: string[];
  status: "pending" | "published" | "rejected";
  decidedAt?: string;
  decidedBy?: string;
}

export interface OfficialFileForSummary extends SummaryInput {
  slug: string;
  summary?: string;
  summarySource?: "template" | "model";
  summaryModel?: string;
  summaryFactSha256?: string;
  summaryPublishedAt?: string;
  summaryStaleSince?: string;
  [k: string]: unknown;
}

function readCandidates(file = CANDIDATES_PATH): SummaryCandidate[] {
  if (!existsSync(file)) return [];
  return JSON.parse(readFileSync(file, "utf-8")) as SummaryCandidate[];
}

function writeCandidates(list: SummaryCandidate[], file = CANDIDATES_PATH): void {
  writeFileSync(file, JSON.stringify(list, null, 2) + "\n");
}

export function listCandidates(slug?: string, file = CANDIDATES_PATH): SummaryCandidate[] {
  return readCandidates(file).filter((c) => !slug || c.slug === slug);
}

/** Current fact block and hash for an official file as it stands now. */
export function currentFacts(official: OfficialFileForSummary): { block: string; sha256: string } {
  const block = buildFactBlock(computeStats(official), official);
  return { block, sha256: factHash(block) };
}

/**
 * Records a model-written candidate. Runs the numbers lint and stores its
 * result with the candidate so a reviewer sees it. Never touches the
 * official file.
 */
export function addCandidate(
  official: OfficialFileForSummary,
  text: string,
  model: string,
  file = CANDIDATES_PATH
): SummaryCandidate {
  const { block, sha256 } = currentFacts(official);
  const list = readCandidates(file);
  const id = `${official.slug}-${sha256.slice(0, 8)}-${String(list.length + 1).padStart(3, "0")}`;
  const candidate: SummaryCandidate = {
    id,
    slug: official.slug,
    factSha256: sha256,
    model,
    generatedAt: new Date().toISOString(),
    text: text.trim(),
    unwitnessed: unwitnessedNumbers(text, block),
    status: "pending",
  };
  list.push(candidate);
  writeCandidates(list, file);
  return candidate;
}

export interface PublishResult {
  ok: boolean;
  reason?: string;
  official?: OfficialFileForSummary;
}

/**
 * Copies a candidate's exact text into the official object. No model call.
 * Refuses when the candidate is not pending, carries unwitnessed numbers,
 * or was written against facts that have since changed.
 */
export function publishSummary(
  official: OfficialFileForSummary,
  candidateId: string,
  decidedBy: string,
  file = CANDIDATES_PATH
): PublishResult {
  const list = readCandidates(file);
  const c = list.find((x) => x.id === candidateId);
  if (!c) return { ok: false, reason: `no candidate ${candidateId}` };
  if (c.slug !== official.slug) return { ok: false, reason: "candidate belongs to another official" };
  if (c.status !== "pending") return { ok: false, reason: `candidate is ${c.status}` };
  if (c.unwitnessed.length > 0) {
    return { ok: false, reason: `candidate states numbers not in the facts: ${c.unwitnessed.join(", ")}` };
  }
  const { sha256 } = currentFacts(official);
  if (sha256 !== c.factSha256) {
    return {
      ok: false,
      reason: `facts changed since the candidate was written (${c.factSha256.slice(0, 8)} -> ${sha256.slice(0, 8)}); generate a new candidate`,
    };
  }
  const now = new Date().toISOString();
  const updated: OfficialFileForSummary = {
    ...official,
    summary: c.text,
    summarySource: "model",
    summaryModel: c.model,
    summaryFactSha256: c.factSha256,
    summaryPublishedAt: now,
  };
  delete updated.summaryStaleSince;
  c.status = "published";
  c.decidedAt = now;
  c.decidedBy = decidedBy;
  writeCandidates(list, file);
  return { ok: true, official: updated };
}

export function rejectCandidate(candidateId: string, decidedBy: string, file = CANDIDATES_PATH): boolean {
  const list = readCandidates(file);
  const c = list.find((x) => x.id === candidateId);
  if (!c || c.status !== "pending") return false;
  c.status = "rejected";
  c.decidedAt = new Date().toISOString();
  c.decidedBy = decidedBy;
  writeCandidates(list, file);
  return true;
}

/**
 * Called by the ingest after a merge. Keeps whatever summary exists. If
 * there is none, writes the deterministic template and says so. If the
 * facts moved out from under a published summary, marks it stale with the
 * date, so the operator knows to generate a candidate.
 */
export function reconcileSummaryAfterIngest(
  official: OfficialFileForSummary,
  template: string,
  today = new Date().toISOString().slice(0, 10)
): OfficialFileForSummary {
  const { sha256 } = currentFacts(official);
  if (!official.summary) {
    return { ...official, summary: template, summarySource: "template", summaryFactSha256: sha256 };
  }
  if (official.summaryFactSha256 && official.summaryFactSha256 !== sha256 && !official.summaryStaleSince) {
    return { ...official, summaryStaleSince: today };
  }
  return official;
}
