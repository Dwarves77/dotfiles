#!/usr/bin/env node
// export-questions-for-answers.mjs: the READ-ONLY export half of the question-answers batch pattern (lane L4-B,
// 2026-10-05, ADR-044 decision 1).
//
// Lists every open `question:` flag (the trigger generator's rows) that can still be answered from holdings and
// writes ONE bundle file per run to --out-dir (never into the repo) for a session lane to author answers from.
// Per question the bundle carries: subject_ref, item id, surface, product question, the question text, event
// context when the flag recorded one, a `pool_hash` (the identity of the held pool the bundle was read from,
// echoed back by the batch), and for the question's item and each item connected to it (typed edges first, at
// most MAX_CONNECTED of them, scripts/turns/question-answers/data.mjs): title, type, surface, jurisdictions,
// summary, the edge that connects it, grounded FACT claims (claim id, kind, text, source id), forward events and
// the held pool text. A character budget applies per question (--char-budget); what it omits is counted in the
// question's `truncation` block, never dropped silently.
//
// A question is skipped when: its flag is not parseable (counted as residue); its own item is archived,
// unverified or sourced only from Community (counted); or an earlier batch recorded it unanswerable from
// holdings and the held pool has not changed since (same pool_hash). When the pool HAS changed the question is
// listed again with needs "reasked_after_new_holdings".
//
// Held pool retrieval is seek-more.mjs queryHeldPools (the real implementation of seekAnswerForQuestion's step
// 1, called through data.mjs); the priced branch of seekAnswerForQuestion is not touched and not called.
//
// FREE and READ-ONLY: no model call, no network, no write to the database (db.mjs readClient is read only). It
// writes the bundle file and its harness-run artifact (scripts/turns/question-answers/artifact.mjs). Exits 2
// without database credentials (rule 15). --fixture <corpus.json> runs the whole step over an in-memory corpus
// (scripts/turns/question-answers/fixture-deps.mjs) with no database and writes no harness-run artifact.
//
// Usage:
//   node scripts/turns/export-questions-for-answers.mjs --out-dir <dir> [--char-budget N] [--limit N] [--fixture <corpus.json>]
// Exit 0 done, 1 bad args, 2 no database credentials.

import { parseArgs as nodeParseArgs } from "node:util";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { isMainModule } from "../lib/is-main.mjs";
import { loadLocalEnvFile } from "../lib/env-file.mjs";
import { emitQuestionAnswersArtifact } from "./question-answers/artifact.mjs";
import { fixtureDeps } from "./question-answers/fixture-deps.mjs";
import {
  loadOpenQuestionFlags, loadAnsweredQuestionFlags, loadQuestionMaterial, parseQuestionRef, buildQuestionContext,
  buildQuestionBundle, recordedOutcome, recordedAnswer, MAX_CONNECTED,
} from "./question-answers/data.mjs";

export const DEFAULT_CHAR_BUDGET = 60000;
export const DEFAULT_LIMIT = 100;
const CHUNK = 25; // questions whose material is read together (bounds memory: pools are stored whole)

/** Pure CLI parse. @param {string[]} argv */
export function parseArgs(argv) {
  let values;
  try {
    ({ values } = nodeParseArgs({
      args: argv,
      options: { "out-dir": { type: "string" }, "char-budget": { type: "string" }, limit: { type: "string" }, fixture: { type: "string" } },
      strict: true,
    }));
  } catch (err) {
    return { ok: false, error: err.message };
  }
  const outDir = values["out-dir"];
  if (!outDir) return { ok: false, error: "--out-dir is required (the bundle is written there, never into the repo)" };
  const charBudget = Number(values["char-budget"] ?? DEFAULT_CHAR_BUDGET);
  if (!(charBudget >= 1000)) return { ok: false, error: `--char-budget must be at least 1000 characters per question, got ${JSON.stringify(values["char-budget"])}` };
  const limit = Number(values.limit ?? DEFAULT_LIMIT);
  if (!Number.isInteger(limit) || limit < 1) return { ok: false, error: `--limit must be a whole number of questions, one or more, got ${JSON.stringify(values.limit)}` };
  return { ok: true, outDir, charBudget, limit, fixture: values.fixture ?? null };
}

/**
 * The export, over injected reads. Returns the bundle file object and a summary; writes nothing.
 * @param {{readAll:Function, readAllByIds:Function}} deps
 * @param {{charBudget:number, limit?:number, now?:()=>string}} opts
 */
export async function buildExport(deps, { charBudget, limit = DEFAULT_LIMIT, now = () => new Date().toISOString() }) {
  const answered = await loadAnsweredQuestionFlags(deps);
  const flags = [...(await loadOpenQuestionFlags(deps)), ...answered].sort((a, b) => String(a.subject_ref).localeCompare(String(b.subject_ref)));
  const counts = {
    open_questions: flags.length - answered.length,
    answered_questions_checked: answered.length,
    unparseable: 0,
    skipped_item_unavailable: 0,
    skipped_unanswerable_unchanged: 0,
    skipped_answered_unchanged: 0,
    listed_unanswered: 0,
    listed_reasked: 0,
    listed_reanswer: 0,
    not_examined_over_limit: 0,
  };
  const residue = [];
  const unavailableByReason = {};
  const bundles = [];

  const parsedFlags = [];
  for (const f of flags) {
    const parsed = parseQuestionRef(f.subject_ref);
    if (!parsed) { counts.unparseable++; residue.push({ subject_ref: f.subject_ref, reason: "subject_ref is not <item>:<surface>:<question>" }); continue; }
    parsedFlags.push({ flag: f, parsed });
  }

  for (let i = 0; i < parsedFlags.length; i += CHUNK) {
    if (bundles.length >= limit) { counts.not_examined_over_limit = parsedFlags.length - i; break; }
    const chunk = parsedFlags.slice(i, i + CHUNK);
    const material = await loadQuestionMaterial(deps, chunk.map((c) => c.parsed.itemId));
    for (const { flag, parsed } of chunk) {
      if (bundles.length >= limit) { counts.not_examined_over_limit++; continue; }
      const ctx = await buildQuestionContext(flag, parsed, material);
      if (ctx.itemUnusable) {
        counts.skipped_item_unavailable++;
        unavailableByReason[ctx.itemUnusable] = (unavailableByReason[ctx.itemUnusable] ?? 0) + 1;
        continue;
      }
      const answeredAs = recordedAnswer(flag);
      if (answeredAs) {
        if (answeredAs.pool_hash === ctx.pool_hash) { counts.skipped_answered_unchanged++; continue; }
        counts.listed_reanswer++;
      } else {
        const outcome = recordedOutcome(flag);
        if (outcome && outcome.pool_hash === ctx.pool_hash) { counts.skipped_unanswerable_unchanged++; continue; }
        if (outcome) counts.listed_reasked++; else counts.listed_unanswered++;
      }
      bundles.push(buildQuestionBundle(ctx, material, { charBudget }));
    }
  }

  const sum = (k) => bundles.reduce((a, b) => a + b.truncation[k], 0);
  const summary = {
    ...counts,
    questions_exported: bundles.length,
    skipped_item_unavailable_by_reason: unavailableByReason,
    connected_cap: MAX_CONNECTED,
    char_budget: charBudget,
    items_omitted: sum("items_omitted"),
    claims_omitted: sum("claims_omitted"),
    forward_events_omitted: sum("forward_events_omitted"),
    pool_chars_omitted: sum("pool_chars_omitted"),
  };
  return { file: { schema_version: "qa1-export-2026-10-05.1", generated_at: now(), summary, residue, bundles }, summary };
}

/** The harness-run artifact input for one export run. Pure. */
export function exportArtifactInput({ parsed, file, outPath, startedAt }) {
  const { summary, bundles, residue } = file;
  return {
    action: "export",
    startedAt,
    config: { char_budget: parsed.charBudget, limit: parsed.limit, bundle_path: outPath },
    inputsRef: ["integrity_flags", "intelligence_items", "item_cross_references", "section_claim_provenance", "item_forward_events", "agent_run_searches"],
    perItem: [
      ...bundles.map((b) => ({ id: b.subject_ref, outcome: `listed_${b.needs}`, verdict: b.pool_hash, evidence_refs: [outPath], error: null })),
      ...residue.map((r) => ({ id: r.subject_ref, outcome: "unparseable", verdict: r.reason, evidence_refs: [], error: r.reason })),
    ],
    metrics: { ...summary, skipped_item_unavailable_by_reason: JSON.stringify(summary.skipped_item_unavailable_by_reason) },
    defectsFound: [],
    fullTraceRefs: [outPath],
    proposerNotes: "Auto-emitted by export-questions-for-answers.mjs after the bundle was written; read-only, no database write.",
  };
}

/** The two reads the export needs: the live database, or an in-memory corpus under --fixture. */
async function openReads(fixturePath) {
  if (fixturePath) return fixtureDeps(JSON.parse(readFileSync(resolve(fixturePath), "utf8")));
  const db = await import("../lib/db.mjs");
  return { readAll: db.readAll, readAllByIds: db.readAllByIds };
}

if (isMainModule(import.meta.url)) await main();

async function main() {
  loadLocalEnvFile();
  const parsed = parseArgs(process.argv.slice(2));
  if (!parsed.ok) {
    console.error(`export-questions-for-answers: ${parsed.error}\nusage: node scripts/turns/export-questions-for-answers.mjs --out-dir <dir> [--char-budget N] [--limit N]`);
    process.exit(1);
  }
  if (!parsed.fixture && (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)) {
    console.error("export-questions-for-answers: no database credentials, cannot run here (exit 2).");
    process.exit(2);
  }
  const startedAt = new Date().toISOString();
  const { file, summary } = await buildExport(await openReads(parsed.fixture), parsed);

  mkdirSync(resolve(parsed.outDir), { recursive: true });
  const outPath = join(resolve(parsed.outDir), `question-answers-export-${startedAt.replace(/[:.]/g, "-")}.json`);
  writeFileSync(outPath, JSON.stringify(file, null, 2));
  console.log(`export-questions-for-answers: ${summary.questions_exported} question(s) exported of ${summary.open_questions} open (unanswered ${summary.listed_unanswered}, re-asked after new holdings ${summary.listed_reasked}, re-answer after new holdings ${summary.listed_reanswer}; skipped: item unavailable ${summary.skipped_item_unavailable}, unanswerable and pool unchanged ${summary.skipped_unanswerable_unchanged}, answered and pool unchanged ${summary.skipped_answered_unchanged}; unparseable ${summary.unparseable}) to ${outPath}`);
  console.log(`export-questions-for-answers: truncation under --char-budget ${summary.char_budget} (connected cap ${summary.connected_cap}): items omitted ${summary.items_omitted}, claims omitted ${summary.claims_omitted}, forward events omitted ${summary.forward_events_omitted}, pool characters omitted ${summary.pool_chars_omitted}`);

  if (parsed.fixture) {
    console.log("export-questions-for-answers: --fixture run, no harness-run artifact written.");
    process.exit(0);
  }
  const artifactPath = emitQuestionAnswersArtifact(exportArtifactInput({ parsed, file, outPath, startedAt }));
  console.log(`export-questions-for-answers: wrote ${artifactPath}`);
  process.exit(0);
}
