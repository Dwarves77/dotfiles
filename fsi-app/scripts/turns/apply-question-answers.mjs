#!/usr/bin/env node
// SHARED-WRITER: integrity_flags
// apply-question-answers.mjs: the apply half of the question-answers batch pattern (lane L4-B, 2026-10-05,
// ADR-044) and the FIRST writer of inference_records (through register_inference_record, via the first-write
// function in src/lib/propagation/methods/infer-from-question.ts).
//
// Takes one named, committed batch (scripts/turns/question-answers/batches/question-answers-NNN.json, contract
// in scripts/turns/question-answers/README.md), validates EVERY entry against the live database with the pure
// validator (scripts/turns/question-answers/schema.mjs: the question is still open, pool_hash matches the live
// held pool, every span is verbatim in the cited item's pool text, every claim id belongs to the cited item,
// no cited item archived, unverified or Community-only, ceilings, the CONFIRMED quotation rule). An entry that
// fails is refused whole, never partially applied, and its reasons are recorded as residue; a refused entry
// never blocks the valid ones (no human gate).
//
// WHAT A VALID ENTRY DOES (with --execute):
//   answered              writes ONE inference (origin derived, trigger_question_ref = the question's
//                         subject_ref, method infer-from-question@v1), then closes the question flag through
//                         the guarded writer with a resolution_note naming the inference id. When the question
//                         was re-opened after an earlier answer the new inference supersedes the prior one.
//   unanswerable_from_holdings
//                         records the outcome on the question flag (a recommended_actions element carrying the
//                         pool_hash and the plain-words "missing"); the flag stays open and the export does not
//                         list it again until the held pool changes.
// IDEMPOTENT: a second apply of the same entry writes nothing (an answered question whose flag is already
// closed with that inference, or an unanswerable outcome already recorded at that pool_hash, is reported as
// already applied; an inference written but its flag not yet closed, after a crash, only closes the flag).
//
// SEARCH TARGETS: ADR-044 decision 2 asks an unanswerable entry to raise a source search target through the
// EXISTING gap-target mechanism. That mechanism (the lineage-gap:absent-parent flag, written by link-items.ts
// and read by scripts/maintenance/lineage-gap-targets.mjs) cannot carry a free-text need: its target is an
// instrument IDENTIFIER resolved against the corpus, its flag is deduplicated one open row per item (a question
// flag would suppress the item's real lineage-gap flag), and its parser reads a fixed rationale sentence. This
// lane therefore raises none and reports `search_targets_raised: 0` with the reason; the plain-words need is
// recorded on the question flag and listed in the run artifact for whichever target mechanism is ruled.
//
// RULE 17: the run artifact states inferences written, questions closed, outcomes recorded and targets raised,
// so nothing is left for a coordinator to connect by hand.
//
// DRY BY DEFAULT: without --execute it validates, prints the plan and writes nothing (it still writes its
// harness-run artifact). --fixture <corpus.json> runs the whole step over an in-memory corpus with no database;
// --execute then writes into memory only and no artifact is written.
//
// FREE: no model call, no network. Usage:
//   node scripts/turns/apply-question-answers.mjs --answers <batch.json> [--execute] [--fixture <corpus.json>]
// Exit 0 done (refused entries are residue, not a failure), 1 bad args / invalid file / a write that did not
// read back, 2 no database credentials.

import { parseArgs as nodeParseArgs } from "node:util";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isMainModule } from "../lib/is-main.mjs";
import { loadLocalEnvFile } from "../lib/env-file.mjs";
import { validateQuestionAnswersFile, QUESTION_ANSWERS_SCHEMA_VERSION } from "./question-answers/schema.mjs";
import {
  loadOpenQuestionFlags, loadQuestionMaterial, loadInferencesByRef, currentInference, parseQuestionRef,
  buildQuestionContext, recordedOutcome, UNANSWERABLE_ACTION, FLAG_COLUMNS,
} from "./question-answers/data.mjs";
import { emitQuestionAnswersArtifact } from "./question-answers/artifact.mjs";
import { fixtureDeps } from "./question-answers/fixture-deps.mjs";
import { registerFirstInference } from "../../src/lib/propagation/methods/infer-from-question.ts";

export const CITE = {
  skill: "learning-loop-design-2026-09-25",
  reason: "question-answers apply (ADR-044): close an answered question flag naming its inference, or record on the question flag that holdings cannot answer it (guarded path, rule 015).",
};
export const RESOLVED_BY = "apply-question-answers";
const CHUNK = 25;

/** Pure CLI parse. @param {string[]} argv */
export function parseArgs(argv) {
  let values;
  try {
    ({ values } = nodeParseArgs({ args: argv, options: { answers: { type: "string" }, execute: { type: "boolean" }, fixture: { type: "string" } }, strict: true }));
  } catch (err) {
    return { ok: false, error: err.message };
  }
  if (!values.answers) return { ok: false, error: "--answers <batch.json> is required (one named batch file per run)" };
  return { ok: true, answers: values.answers, execute: values.execute === true, fixture: values.fixture ?? null };
}

/** The resolution note of an answered question: names the inference. Pure. */
export function buildResolutionNote(inferenceId, entry, batch) {
  return `answered by inference ${inferenceId} (batch ${batch}; status ${entry.status_token}; pool_hash ${entry.pool_hash})`;
}

/** The recommended_actions array after recording an unanswerable outcome: any earlier outcome element is replaced. Pure. */
export function withUnanswerableOutcome(actions, entry, batch, nowIso) {
  const kept = (Array.isArray(actions) ? actions : []).filter((a) => !(a && a.action === UNANSWERABLE_ACTION));
  return [...kept, { action: UNANSWERABLE_ACTION, rationale: entry.missing, pool_hash: entry.pool_hash, batch, recorded_at: nowIso }];
}

/**
 * Validate a parsed batch against the live database and (with execute) write the valid entries.
 * @param {{json:object, execute:boolean, deps:{readAll:Function, readAllByIds:Function, guardedUpdateByIds?:Function, rpcClient?:Function}, now?:()=>string}} o
 */
export async function applyQuestionAnswers({ json, execute, deps, now = () => new Date().toISOString() }) {
  const result = {
    schema_version: QUESTION_ANSWERS_SCHEMA_VERSION, batch: json?.batch ?? null, ok: true, fileErrors: [],
    valid: [], refused: [], alreadyApplied: [], written: [], readBackFailures: [], writeFailures: [],
    report: { inferences_written: 0, questions_closed: 0, outcomes_recorded: 0, search_targets_raised: 0, unanswerable_needs: [] },
  };
  const entries = Array.isArray(json?.entries) ? json.entries : [];
  const refs = [...new Set(entries.map((e) => (e && typeof e.subject_ref === "string" ? e.subject_ref : null)).filter(Boolean))];

  const openFlags = await loadOpenQuestionFlags(deps);
  const flagByRef = new Map();
  for (const f of openFlags) if (refs.includes(f.subject_ref) && !flagByRef.has(f.subject_ref)) flagByRef.set(f.subject_ref, f);
  const inferences = await loadInferencesByRef(deps, refs);

  // Question contexts for the open, parseable refs (read in chunks: held pools are stored whole).
  const ctxByRef = new Map();
  const openRefs = [...flagByRef.keys()].filter((r) => parseQuestionRef(r));
  for (let i = 0; i < openRefs.length; i += CHUNK) {
    const slice = openRefs.slice(i, i + CHUNK);
    const material = await loadQuestionMaterial(deps, slice.map((r) => parseQuestionRef(r).itemId));
    for (const ref of slice) ctxByRef.set(ref, await buildQuestionContext(flagByRef.get(ref), parseQuestionRef(ref), material));
  }
  const questions = new Map();
  for (const ref of refs) {
    const ctx = ctxByRef.get(ref);
    if (ctx) questions.set(ref, { open: true, questionText: ctx.questionText, itemUnusable: ctx.itemUnusable, pool_hash: ctx.pool_hash, members: ctx.members, unusable: ctx.unusable });
  }

  const verdict = validateQuestionAnswersFile(json, { questions });
  result.ok = verdict.ok;
  result.fileErrors = verdict.fileErrors;
  if (!verdict.ok) return result;

  // A refused entry whose work is already done is "already applied", not a refusal (second apply is a no-op).
  const doneAlready = (entry) => {
    if (!entry || typeof entry.subject_ref !== "string") return false;
    const flag = flagByRef.get(entry.subject_ref);
    if (entry.outcome === "unanswerable_from_holdings") {
      const o = flag ? recordedOutcome(flag) : null;
      return !!o && o.pool_hash === entry.pool_hash;
    }
    if (entry.outcome === "answered" && !flag) {
      return (inferences.get(entry.subject_ref) ?? []).some((r) => r.claim_text === entry.answer);
    }
    return false;
  };
  for (const r of verdict.refused) {
    if (doneAlready(json.entries[r.index])) result.alreadyApplied.push({ index: r.index, subject_ref: r.subject_ref, why: "already applied" });
    else result.refused.push(r);
  }
  for (const e of verdict.valid) {
    if (doneAlready(e)) result.alreadyApplied.push({ index: json.entries.indexOf(e), subject_ref: e.subject_ref, why: "unanswerable outcome already recorded at this pool_hash" });
    else result.valid.push(e);
  }
  if (!result.valid.length) return result;

  const sb = execute ? deps.rpcClient() : null;
  for (const entry of result.valid) {
    const ctx = ctxByRef.get(entry.subject_ref);
    const flag = ctx.flag;
    if (!execute) {
      result.written.push({ subject_ref: entry.subject_ref, outcome: entry.outcome, mode: "dry", inference_id: null });
      continue;
    }
    try {
      if (entry.outcome === "answered") {
        const existing = currentInference(inferences.get(entry.subject_ref));
        let inferenceId;
        let wrote = false;
        if (existing && existing.claim_text === entry.answer) {
          inferenceId = existing.inference_id; // crash recovery: the inference exists, only the flag close is owed
        } else {
          inferenceId = await registerFirstInference(sb, {
            subjectId: ctx.item?.instrument_entity_id ?? null,
            claimText: entry.answer, statusToken: entry.status_token, confidence: entry.confidence,
            citedItemIds: entry.cited_item_ids, triggerQuestionRef: entry.subject_ref, batch: json.batch,
            supersedes: existing?.inference_id ?? null,
          });
          wrote = true;
          result.report.inferences_written += 1;
        }
        const closed = await deps.guardedUpdateByIds(
          "integrity_flags", [flag.id],
          { status: "resolved", resolved_at: now(), resolved_by: RESOLVED_BY, resolution_note: buildResolutionNote(inferenceId, entry, json.batch) },
          { cite: CITE, applyMatch: (q) => q.in("status", ["open", "in_review"]) },
        );
        result.report.questions_closed += closed.updated;
        result.written.push({ subject_ref: entry.subject_ref, outcome: "answered", mode: wrote ? "inference_and_close" : "close_only", inference_id: inferenceId, flag_id: flag.id });
      } else {
        await deps.guardedUpdateByIds(
          "integrity_flags", [flag.id],
          { recommended_actions: withUnanswerableOutcome(flag.recommended_actions, entry, json.batch, now()) },
          { cite: CITE, applyMatch: (q) => q.in("status", ["open", "in_review"]) },
        );
        result.report.outcomes_recorded += 1;
        result.report.unanswerable_needs.push({ subject_ref: entry.subject_ref, missing: entry.missing });
        result.written.push({ subject_ref: entry.subject_ref, outcome: entry.outcome, mode: "outcome_recorded", inference_id: null, flag_id: flag.id });
      }
    } catch (err) {
      result.writeFailures.push({ subject_ref: entry.subject_ref, error: String(err?.message ?? err) });
    }
  }

  if (execute && result.written.length) {
    const flagIds = result.written.map((w) => w.flag_id);
    const backFlags = new Map((await deps.readAllByIds("integrity_flags", `${FLAG_COLUMNS}, resolution_note`, flagIds)).map((r) => [r.id, r]));
    const infIds = result.written.map((w) => w.inference_id).filter(Boolean);
    const backInf = new Map((infIds.length ? await deps.readAllByIds("inference_records", "inference_id, trigger_question_ref, claim_text", infIds, { idColumn: "inference_id" }) : []).map((r) => [r.inference_id, r]));
    for (const w of result.written) {
      const f = backFlags.get(w.flag_id);
      const entry = result.valid.find((e) => e.subject_ref === w.subject_ref);
      let ok;
      if (w.outcome === "answered") {
        const inf = backInf.get(w.inference_id);
        ok = !!f && f.status === "resolved" && String(f.resolution_note ?? "").includes(w.inference_id) && !!inf && inf.trigger_question_ref === w.subject_ref;
      } else {
        const o = f ? recordedOutcome(f) : null;
        ok = !!f && f.status !== "resolved" && !!o && o.pool_hash === entry.pool_hash;
      }
      if (!ok) result.readBackFailures.push(w.subject_ref);
    }
  }
  return result;
}

/** The harness-run artifact input for one apply run. Pure. */
export function applyArtifactInput({ parsed, r, answersPath, startedAt }) {
  const readBackBad = new Set(r.readBackFailures);
  const failed = new Map(r.writeFailures.map((f) => [f.subject_ref, f.error]));
  const writtenBy = new Map(r.written.map((w) => [w.subject_ref, w]));
  const perItem = [
    ...r.valid.map((e) => {
      const w = writtenBy.get(e.subject_ref);
      const tail = e.outcome === "answered" ? (w?.inference_id ? `inference ${w.inference_id}` : "answer") : `needs: ${e.missing}`;
      let outcome = parsed.execute ? `applied_${e.outcome}` : `valid_dry_${e.outcome}`;
      let error = null;
      if (failed.has(e.subject_ref)) { outcome = "write_failed"; error = failed.get(e.subject_ref); }
      else if (readBackBad.has(e.subject_ref)) { outcome = "written_readback_failed"; error = "the stored question flag or inference did not match what was written"; }
      return { id: e.subject_ref, outcome, verdict: tail, evidence_refs: [answersPath], error };
    }),
    ...r.alreadyApplied.map((a) => ({ id: a.subject_ref, outcome: "already_applied", verdict: a.why, evidence_refs: [answersPath], error: null })),
    ...r.refused.map((f) => ({ id: f.subject_ref ?? `entry-${f.index}`, outcome: "refused", verdict: f.errors[0] ?? "refused", evidence_refs: [answersPath], error: f.errors.join(" | ") })),
  ];
  return {
    action: "apply",
    startedAt,
    config: { mode: parsed.execute ? "apply" : "dry", batch: r.batch, answers_file: parsed.answers },
    inputsRef: [parsed.answers],
    perItem: perItem.length ? perItem : [{ id: r.batch ?? "batch", outcome: "no_entries", verdict: r.fileErrors.join(" | ") || "no valid entries", evidence_refs: [answersPath], error: r.fileErrors[0] ?? null }],
    metrics: {
      entries_total: r.valid.length + r.refused.length + r.alreadyApplied.length,
      valid: r.valid.length, refused: r.refused.length, already_applied: r.alreadyApplied.length,
      inferences_written: parsed.execute ? r.report.inferences_written : 0,
      questions_closed: parsed.execute ? r.report.questions_closed : 0,
      outcomes_recorded: parsed.execute ? r.report.outcomes_recorded : 0,
      search_targets_raised: 0,
      write_failures: r.writeFailures.length, read_back_failures: r.readBackFailures.length,
    },
    defectsFound: [
      ...r.fileErrors.map((e) => ({ description: `batch file refused: ${e}`, root_cause: "structural problem in the committed batch file", fix_ref: null })),
      ...r.refused.map((f) => ({ description: `entry ${f.index} (question ${f.subject_ref ?? "?"}) refused: ${f.errors.length} reason(s)`, root_cause: f.errors[0] ?? "", fix_ref: null })),
      ...r.writeFailures.map((f) => ({ description: `write for question ${f.subject_ref} failed`, root_cause: f.error, fix_ref: null })),
    ],
    fullTraceRefs: [answersPath],
    proposerNotes: "Auto-emitted by apply-question-answers.mjs. Refused entries are residue with their reasons in per_item. search_targets_raised is 0 by design: the existing gap-target mechanism cannot carry a free-text need (see the script header); unanswerable needs are recorded on the question flag and in per_item.verdict.",
  };
}

if (isMainModule(import.meta.url)) await main();

async function main() {
  loadLocalEnvFile();
  const parsed = parseArgs(process.argv.slice(2));
  if (!parsed.ok) {
    console.error(`apply-question-answers: ${parsed.error}\nusage: node scripts/turns/apply-question-answers.mjs --answers <batch.json> [--execute]`);
    process.exit(1);
  }
  if (!parsed.fixture && (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)) {
    console.error("apply-question-answers: no database credentials, cannot run here (exit 2).");
    process.exit(2);
  }
  const answersPath = resolve(parsed.answers);
  let json;
  try {
    json = JSON.parse(readFileSync(answersPath, "utf8"));
  } catch (err) {
    console.error(`apply-question-answers: cannot read or parse ${answersPath}: ${err.message}`);
    process.exit(1);
  }
  const startedAt = new Date().toISOString();
  let deps;
  if (parsed.fixture) {
    deps = fixtureDeps(JSON.parse(readFileSync(resolve(parsed.fixture), "utf8")));
  } else {
    const db = await import("../lib/db.mjs");
    deps = {
      readAll: db.readAll, readAllByIds: db.readAllByIds, guardedUpdateByIds: db.guardedUpdateByIds,
      // register_inference_record is a governed, atomic SQL function (migration 339), the same precedent
      // run-propagation-drain.mjs sets for its own RPC writes: a raw client is the supported way to call it.
      rpcClient: () => null,
    };
    if (parsed.execute) {
      const { createClient } = await import("@supabase/supabase-js");
      const sbClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
      deps.rpcClient = () => sbClient;
    }
  }
  const r = await applyQuestionAnswers({ json, execute: parsed.execute, deps });

  if (!r.ok) for (const e of r.fileErrors) console.error(`apply-question-answers: ${e}`);
  console.log(`apply-question-answers: batch ${r.batch ?? "(unnamed)"}: ${r.valid.length} valid, ${r.refused.length} refused, ${r.alreadyApplied.length} already applied${parsed.execute ? "" : " (DRY RUN, nothing written)"}.`);
  for (const f of r.refused) for (const e of f.errors) console.log(`  REFUSED ${e}`);
  for (const w of r.written) console.log(`  ${w.mode === "dry" ? "WOULD APPLY" : `APPLIED (${w.mode})`} ${w.outcome} ${w.subject_ref}${w.inference_id ? ` -> inference ${w.inference_id}` : ""}`);
  for (const f of r.writeFailures) console.error(`apply-question-answers: write FAILED for ${f.subject_ref}: ${f.error}`);
  if (r.readBackFailures.length) console.error(`apply-question-answers: read-back FAILED for ${r.readBackFailures.join(", ")}`);
  if (parsed.execute) console.log(`apply-question-answers: inferences written ${r.report.inferences_written}, questions closed ${r.report.questions_closed}, unanswerable outcomes recorded ${r.report.outcomes_recorded}, search targets raised ${r.report.search_targets_raised}`);

  const failed = !r.ok || r.readBackFailures.length > 0 || r.writeFailures.length > 0;
  if (parsed.fixture) {
    console.log("apply-question-answers: --fixture run, no harness-run artifact written.");
    process.exit(failed ? 1 : 0);
  }
  const artifactPath = emitQuestionAnswersArtifact(applyArtifactInput({ parsed, r, answersPath, startedAt }));
  console.log(`apply-question-answers: wrote ${artifactPath}`);
  process.exit(failed ? 1 : 0);
}
