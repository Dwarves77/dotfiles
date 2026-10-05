// question-answers.test.mjs: the executable spec for the question-answers batch pattern (lane L4-B): the
// shared reads and bundle (data.mjs), the pure validator (schema.mjs), the export and the apply step, all over
// the fixture corpus with no database. Every refusal the brief names has a failing fixture here.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { buildExport, exportArtifactInput, parseArgs as parseExportArgs } from "../export-questions-for-answers.mjs";
import { applyQuestionAnswers, applyArtifactInput, buildResolutionNote, withUnanswerableOutcome, parseArgs as parseApplyArgs } from "../apply-question-answers.mjs";
import { fixtureDeps } from "./fixture-deps.mjs";
import { emitQuestionAnswersArtifact } from "./artifact.mjs";
import { sentencesOf, unquotedSentences, CEILINGS, MIN_SPAN_CHARS, validateQuestionAnswersFile } from "./schema.mjs";
import { parseQuestionRef, itemUnusableReason, currentInference, eventContextOf, needOfFlag, recordedAnswer, MAX_CONNECTED } from "./data.mjs";
import { validateRunArtifact } from "../../lib/run-artifact.mjs";
import { withoutCredentials } from "../../lib/env-file.mjs";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const CORPUS_PATH = join(HERE, "fixtures/corpus.fixture.json");
const BATCH_PATH = join(HERE, "fixtures/question-answers-000.fixture.json");
const CORPUS = JSON.parse(readFileSync(CORPUS_PATH, "utf8"));
const BATCH = JSON.parse(readFileSync(BATCH_PATH, "utf8"));
const clone = (x) => JSON.parse(JSON.stringify(x));
const NOW = () => "2026-10-05T12:00:00.000Z";
const cliEnv = { ...withoutCredentials(), FSI_NO_ENV_FILE: "1" };

const A = "aaaaaaaa-0000-4000-8000-000000000001";
const B = "aaaaaaaa-0000-4000-8000-000000000002";
const C = "aaaaaaaa-0000-4000-8000-000000000003";
const D = "aaaaaaaa-0000-4000-8000-000000000004";
const E = "aaaaaaaa-0000-4000-8000-000000000005";
const REF_WHAT = `${A}:regulations:what`;
const REF_COMPLY = `${A}:regulations:comply`;
const REF_E = `${E}:operations:what`;

const entryOf = (ref) => clone(BATCH.entries.find((e) => e.subject_ref === ref));
const batchOf = (...entries) => ({ ...clone(BATCH), entries });
const run = (json, { execute = false, corpus = CORPUS } = {}) => {
  const deps = fixtureDeps(clone(corpus));
  return applyQuestionAnswers({ json, execute, deps, now: NOW }).then((r) => ({ r, deps }));
};
const refusal = async (entry, corpus = CORPUS) => {
  const { r } = await run(batchOf(entry), { corpus });
  assert.equal(r.valid.length, 0, `expected a refusal, got valid: ${JSON.stringify(r.valid)}`);
  return r.refused.flatMap((f) => f.errors).join(" | ");
};

// ── pure helpers ──────────────────────────────────────────────────────────────────────────────────────────
test("parseQuestionRef: <item>:<surface>:<question> only", () => {
  assert.deepEqual(parseQuestionRef(REF_WHAT), { itemId: A, surface: "regulations", productQuestion: "what" });
  assert.equal(parseQuestionRef("theme-x"), null);
  assert.equal(parseQuestionRef(`${A}:regulations`), null);
});

test("itemUnusableReason: archived, unverified, Community-only (ADR-041) are not citable", () => {
  const ok = { is_archived: false, provenance_status: "verified", origin_class: "official" };
  assert.equal(itemUnusableReason(ok), null);
  assert.match(itemUnusableReason({ ...ok, is_archived: true }), /archived/);
  assert.match(itemUnusableReason({ ...ok, provenance_status: "quarantined" }), /not verified/);
  assert.match(itemUnusableReason({ ...ok, origin_class: "community" }), /Community/);
  assert.match(itemUnusableReason({ ...ok, origin_class: "community-corroborated" }), /Community/);
  assert.match(itemUnusableReason(null), /not found/);
});

test("eventContextOf reads the generator's own event_type from the flag rationale", () => {
  assert.deepEqual(eventContextOf(CORPUS.tables.integrity_flags[0]), { event_type: "item_minted_or_touched" });
  assert.equal(eventContextOf({ recommended_actions: [] }), null);
});

test("currentInference: the row no other row supersedes", () => {
  const rows = [
    { inference_id: "i1", supersedes: null, computed_at: "2026-10-01T00:00:00Z" },
    { inference_id: "i2", supersedes: "i1", computed_at: "2026-10-02T00:00:00Z" },
  ];
  assert.equal(currentInference(rows).inference_id, "i2");
  assert.equal(currentInference([]), null);
});

test("sentencesOf and unquotedSentences: a sentence is quoted when a whole evidence span contains it", () => {
  assert.deepEqual(sentencesOf("One two three. Four five!  Six"), ["One two three", "Four five", "Six"]);
  const spans = ["lowers the permitted relative humidity ceiling to 55 percent"];
  assert.deepEqual(unquotedSentences("Lowers the  permitted relative humidity ceiling.", spans), []);
  assert.deepEqual(unquotedSentences("Raises the ceiling.", spans), ["Raises the ceiling"]);
});

// ── export ────────────────────────────────────────────────────────────────────────────────────────────────
test("parseArgs (export): --out-dir required, budget floor, positive limit", () => {
  assert.equal(parseExportArgs([]).ok, false);
  assert.equal(parseExportArgs(["--out-dir", "x", "--char-budget", "10"]).ok, false);
  assert.equal(parseExportArgs(["--out-dir", "x", "--limit", "0"]).ok, false);
  assert.equal(parseExportArgs(["--out-dir", "x"]).limit, 100);
});

test("export lists an open question with its item's claims, forward events and pool text, and the connected item the same", async () => {
  const { file } = await buildExport(fixtureDeps(clone(CORPUS)), { charBudget: 60000, now: NOW });
  const b = file.bundles.find((x) => x.subject_ref === REF_WHAT);
  assert.ok(b, "the open question is listed");
  assert.deepEqual([b.item_id, b.surface, b.product_question, b.needs], [A, "regulations", "what", "unanswered"]);
  assert.match(b.question, /Bonded warehouse humidity amendment/);
  assert.deepEqual(b.event_context, { event_type: "item_minted_or_touched" });
  assert.match(b.pool_hash, /^[0-9a-f]{64}$/);
  const self = b.items.find((i) => i.relation === "self");
  assert.equal(self.item_id, A);
  assert.deepEqual(self.claims.map((c) => c.claim_id), ["c-a1"], "only FACT claims are grounded claims");
  assert.deepEqual(self.forward_events.map((e) => e.event_id), ["ev-a1"]);
  assert.match(self.pool[0].text, /relative humidity ceiling to 55 percent/);
  const conn = b.items.filter((i) => i.relation === "connected");
  assert.deepEqual(conn.map((i) => i.item_id), [B], "archived and Community items connected to A are not exported");
  assert.equal(conn[0].edge.relationship, "amends");
  assert.deepEqual(conn[0].claims.map((c) => c.claim_id), ["c-b1"]);
  assert.match(conn[0].pool[0].text, /Implementing guidance/);
  assert.equal(b.truncation.connected_not_citable, 2);
  assert.equal(b.truncation.connected_cap, MAX_CONNECTED);
});

test("export skips a resolved question, another namespace's flag, a question on an archived item, and an unanswerable one whose pool is unchanged", async () => {
  const { file, summary } = await buildExport(fixtureDeps(clone(CORPUS)), { charBudget: 60000, now: NOW });
  const refs = file.bundles.map((b) => b.subject_ref).sort();
  assert.deepEqual(refs, [REF_COMPLY, REF_WHAT].sort());
  assert.equal(summary.open_questions, 4, "resolved f-2 and the flywheel-gap flag are never read as open questions");
  assert.equal(summary.skipped_item_unavailable, 1);
  assert.deepEqual(summary.skipped_item_unavailable_by_reason, { archived: 1 });
  assert.equal(summary.skipped_unanswerable_unchanged, 1);
});

test("export lists an unanswerable question again, with its prior outcome, once the item's pool hash changes", async () => {
  const corpus = clone(CORPUS);
  corpus.tables.agent_run_searches.find((p) => p.id === "p-e").result_content += " A newly captured sentence changes the held pool of this item.";
  const { file } = await buildExport(fixtureDeps(corpus), { charBudget: 60000, now: NOW });
  const b = file.bundles.find((x) => x.subject_ref === REF_E);
  assert.ok(b, "listed again");
  assert.equal(b.needs, "reasked_after_new_holdings");
  assert.equal(b.prior_outcome.missing, "A berth assignment notice naming the vessel.");
  assert.equal(file.summary.listed_reasked, 1);
});

test("export budget: what the character budget omits is counted, never dropped silently", async () => {
  const { file } = await buildExport(fixtureDeps(clone(CORPUS)), { charBudget: 1500, now: NOW });
  const b = file.bundles.find((x) => x.subject_ref === REF_WHAT);
  const t = b.truncation;
  assert.ok(t.pool_chars_omitted > 0, "the small budget cuts pool text");
  assert.equal(t.pool_chars_included + t.pool_chars_omitted, t.pool_chars_total);
  const shown = b.items.flatMap((i) => i.pool).reduce((a, c) => a + c.text.length, 0);
  assert.equal(shown, t.pool_chars_included);
  for (const c of b.items.flatMap((i) => i.pool)) assert.equal(c.text.length, c.chars_included);
  assert.equal(file.summary.pool_chars_omitted, file.bundles.reduce((a, x) => a + x.truncation.pool_chars_omitted, 0));
});

test("export --limit stops at the limit and reports what it did not examine", async () => {
  const { file, summary } = await buildExport(fixtureDeps(clone(CORPUS)), { charBudget: 60000, limit: 1, now: NOW });
  assert.equal(file.bundles.length, 1);
  assert.ok(summary.not_examined_over_limit >= 1);
});

test("export caps connected items at MAX_CONNECTED, typed edges first", async () => {
  const corpus = clone(CORPUS);
  const t = corpus.tables;
  for (let i = 0; i < 10; i++) {
    const id = `bbbbbbbb-0000-4000-8000-0000000000${String(10 + i)}`;
    t.intelligence_items.push({ id, title: `Related ${i}`, item_type: "regulation", domain: 1, jurisdiction_iso: ["EU"], summary: "s", provenance_status: "verified", is_archived: false, origin_class: "official", instrument_entity_id: null });
    t.item_cross_references.push({ source_item_id: A, target_item_id: id, relationship: i === 9 ? "implements" : "related", origin: "provenance_discovery", basis: [], score: 0.9 - i * 0.01 });
  }
  const { file } = await buildExport(fixtureDeps(corpus), { charBudget: 60000, now: NOW });
  const b = file.bundles.find((x) => x.subject_ref === REF_WHAT);
  const conn = b.items.filter((i) => i.relation === "connected");
  assert.equal(conn.length, MAX_CONNECTED);
  assert.deepEqual(conn.slice(0, 2).map((i) => i.edge.relationship), ["amends", "implements"], "typed edges lead");
});

test("export artifact input validates against the family's run-artifact schema", async () => {
  const { file } = await buildExport(fixtureDeps(clone(CORPUS)), { charBudget: 60000, now: NOW });
  const input = exportArtifactInput({ parsed: { charBudget: 60000, limit: 100 }, file, outPath: "out.json", startedAt: NOW() });
  const dir = mkdtempSync(join(tmpdir(), "qa-art-"));
  const path = emitQuestionAnswersArtifact(input, { familyDir: dir });
  assert.deepEqual(validateRunArtifact(JSON.parse(readFileSync(path, "utf8"))), []);
  assert.ok(readdirSync(dir).includes("question-answers-run-001.json"));
});

// ── the validator: each refusal has a failing fixture ───────────────────────────────────────────────────────
test("the fixture batch is valid against the fixture corpus", async () => {
  const { r } = await run(clone(BATCH));
  assert.equal(r.ok, true);
  assert.deepEqual(r.refused, []);
  assert.equal(r.valid.length, 2);
});

test("REFUSED: a wrong pool_hash", async () => {
  const e = entryOf(REF_WHAT);
  e.pool_hash = "0".repeat(64);
  assert.match(await refusal(e), /pool_hash does not match the live held pool/);
});

test("REFUSED: a span that is not verbatim in the cited item's pool", async () => {
  const e = entryOf(REF_WHAT);
  e.evidence[0].source_span = "lowers the permitted relative humidity ceiling to 45 percent for stored artwork";
  assert.match(await refusal(e), /not a verbatim substring of the held pool text/);
});

test("REFUSED: a span that is real text of ANOTHER item's pool, cited against this item", async () => {
  const e = entryOf(REF_WHAT);
  e.evidence[0].source_span = e.evidence[1].source_span;
  assert.match(await refusal(e), /not a verbatim substring/);
});

test("REFUSED: a claim id that belongs to another item (or is not a grounded FACT claim)", async () => {
  const e = entryOf(REF_WHAT);
  e.evidence[0].claim_ids = ["c-b1"];
  assert.match(await refusal(e), /claim id "c-b1" is not a grounded claim of the cited item/);
  const e2 = entryOf(REF_WHAT);
  e2.evidence[0].claim_ids = ["c-a2"];
  assert.match(await refusal(e2), /claim id "c-a2" is not a grounded claim/, "an ANALYSIS claim is not grounded");
});

test("REFUSED: a cited item that is archived", async () => {
  const e = entryOf(REF_WHAT);
  e.cited_item_ids = [A, B, C];
  e.evidence.push({ item_id: C, claim_ids: [], source_span: "a span of text long enough to be evidence" });
  assert.match(await refusal(e), /cited item is not citable \(archived\)/);
});

test("REFUSED: a cited item that is unverified", async () => {
  const corpus = clone(CORPUS);
  corpus.tables.intelligence_items.find((i) => i.id === B).provenance_status = "quarantined";
  const e = entryOf(REF_WHAT);
  const out = await refusal(e, corpus);
  assert.match(out, /pool_hash does not match|not citable \(not verified/);
  assert.match(out, /not citable \(not verified \(provenance_status quarantined\)\)/);
});

test("REFUSED: a cited item sourced only from Community (ADR-041)", async () => {
  const e = entryOf(REF_WHAT);
  e.cited_item_ids = [A, B, D];
  e.evidence.push({ item_id: D, claim_ids: [], source_span: "a span of text long enough to be evidence" });
  assert.match(await refusal(e), /not citable \(sourced only from Community \(ADR-041\)\)/);
});

test("REFUSED: a cited item that is neither the question's item nor connected to it", async () => {
  const e = entryOf(REF_WHAT);
  e.cited_item_ids = [A, B, E];
  e.evidence.push({ item_id: E, claim_ids: [], source_span: "a span of text long enough to be evidence" });
  assert.match(await refusal(e), /neither the question's own item nor an item connected/);
});

test("REFUSED: an answered entry with no evidence", async () => {
  const e = entryOf(REF_WHAT);
  e.evidence = [];
  e.cited_item_ids = [];
  assert.match(await refusal(e), /needs at least one evidence record/);
});

test("REFUSED: an unanswerable entry with an answer, or with evidence, or with no 'missing'", async () => {
  const e = entryOf(REF_COMPLY);
  e.answer = "A made-up answer.";
  assert.match(await refusal(e), /carries no answer/);
  const e2 = entryOf(REF_COMPLY);
  e2.evidence = [{ item_id: A, claim_ids: [], source_span: "a span of text long enough to be evidence" }];
  assert.match(await refusal(e2), /carries no evidence/);
  const e3 = entryOf(REF_COMPLY);
  delete e3.missing;
  assert.match(await refusal(e3), /needs "missing"/);
});

test("REFUSED: confidence outside 0 to 1, a bad status token, REFUTED, a bad outcome", async () => {
  const e = entryOf(REF_WHAT);
  e.confidence = 1.2;
  assert.match(await refusal(e), /confidence must be a number from 0 to 1/);
  const e2 = entryOf(REF_WHAT);
  e2.status_token = "REFUTED";
  assert.match(await refusal(e2), /status_token must be one of HYPOTHESIS, CONFIRMED/);
  const e3 = entryOf(REF_WHAT);
  e3.outcome = "maybe";
  assert.match(await refusal(e3), /outcome must be one of/);
});

test("REFUSED: unknown subject_ref, and a question that is no longer open", async () => {
  const e = entryOf(REF_WHAT);
  e.subject_ref = `${B}:regulations:what`;
  assert.match(await refusal(e), /unknown question/);
  const e2 = entryOf(REF_WHAT);
  e2.subject_ref = `${A}:regulations:affects_me`;
  assert.match(await refusal(e2), /unknown question/, "a resolved flag is not an open question");
});

test("REFUSED: cited_item_ids that differ from the evidence item ids, or repeat one", async () => {
  const e = entryOf(REF_WHAT);
  e.cited_item_ids = [A];
  assert.match(await refusal(e), /cited_item_ids must equal the set of evidence item ids/);
  const e2 = entryOf(REF_WHAT);
  e2.cited_item_ids = [A, A, B];
  assert.match(await refusal(e2), /cited_item_ids has a duplicate/);
});

test("REFUSED: length ceilings, a too-short span, an id in the answer, an uncited figure", async () => {
  const e = entryOf(REF_WHAT);
  e.answer = "x ".repeat(CEILINGS.answer);
  assert.match(await refusal(e), new RegExp(`ceiling ${CEILINGS.answer}`));
  const e2 = entryOf(REF_WHAT);
  e2.evidence[0].source_span = "ceiling";
  assert.match(await refusal(e2), new RegExp(`under ${MIN_SPAN_CHARS} characters`));
  const e3 = entryOf(REF_WHAT);
  e3.answer = `See ${A} for the amendment.`;
  assert.match(await refusal(e3), /answer carries an id/);
  const e4 = entryOf(REF_WHAT);
  e4.answer = "The amendment lowers the ceiling to 40 percent and adds 12 inspection days.";
  assert.match(await refusal(e4), /answer states "40", "12" that no evidence span/);
});

test("CONFIRMED needs every sentence quoted from an evidence span; a paraphrase must be HYPOTHESIS", async () => {
  const e = entryOf(REF_WHAT);
  e.status_token = "CONFIRMED";
  assert.match(await refusal(e), /status_token CONFIRMED needs every sentence quoted/);
  const quote = entryOf(REF_WHAT);
  quote.status_token = "CONFIRMED";
  quote.answer = "lowers the permitted relative humidity ceiling to 55 percent for stored artwork. Applies to all climate controlled bonded stores holding fine art consignments.";
  const { r } = await run(batchOf(quote));
  assert.equal(r.valid.length, 1, JSON.stringify(r.refused));
});

test("a duplicate subject_ref in one batch refuses the later entry; file-level structure fails closed", async () => {
  const { r } = await run(batchOf(entryOf(REF_WHAT), entryOf(REF_WHAT)));
  assert.equal(r.valid.length, 1);
  assert.match(r.refused[0].errors[0], /duplicate subject_ref/);
  const v = validateQuestionAnswersFile({ batch: "nope", generated_at: "x", authored_by: "someone", entries: 3 }, { questions: new Map() });
  assert.equal(v.ok, false);
  assert.equal(v.fileErrors.length, 4);
  assert.equal(validateQuestionAnswersFile([], { questions: new Map() }).ok, false);
});

test("a refused entry never blocks the valid entry beside it", async () => {
  const bad = entryOf(REF_COMPLY);
  bad.answer = "x";
  const { r } = await run(batchOf(entryOf(REF_WHAT), bad));
  assert.equal(r.valid.length, 1);
  assert.equal(r.refused.length, 1);
});

// ── apply ─────────────────────────────────────────────────────────────────────────────────────────────────
test("parseArgs (apply): --answers required; --execute and --fixture optional", () => {
  assert.equal(parseApplyArgs([]).ok, false);
  const r = parseApplyArgs(["--answers", "b.json"]);
  assert.deepEqual([r.ok, r.execute, r.fixture], [true, false, null]);
  assert.equal(parseApplyArgs(["--answers", "b.json", "--execute"]).execute, true);
});

test("dry mode writes nothing: no inference, no flag change", async () => {
  const { r, deps } = await run(clone(BATCH));
  assert.equal(r.written.length, 2);
  assert.ok(r.written.every((w) => w.mode === "dry"));
  assert.equal(deps.tables.inference_records.length, 0);
  assert.deepEqual(deps.tables.integrity_flags, CORPUS.tables.integrity_flags);
});

test("execute: one inference with trigger_question_ref set, the flag closed naming the inference", async () => {
  const { r, deps } = await run(batchOf(entryOf(REF_WHAT)), { execute: true });
  assert.equal(r.readBackFailures.length, 0);
  assert.equal(r.report.inferences_written, 1);
  assert.equal(r.report.questions_closed, 1);
  assert.equal(deps.tables.inference_records.length, 1);
  const inf = deps.tables.inference_records[0];
  assert.equal(inf.trigger_question_ref, REF_WHAT);
  assert.equal(inf.origin_class, "derived");
  assert.equal(inf.status_token, "HYPOTHESIS");
  assert.deepEqual([...inf.cited_item_ids].sort(), [A, B]);
  assert.equal(inf.subject_id, "cl:instr:bonded-humidity");
  assert.equal(inf.computed_by, "question-answers:question-answers-000");
  assert.equal(inf.supersedes, null);
  const flag = deps.tables.integrity_flags.find((f) => f.subject_ref === REF_WHAT);
  assert.equal(flag.status, "resolved");
  assert.equal(flag.resolved_by, "apply-question-answers");
  assert.ok(flag.resolution_note.includes(inf.inference_id));
  assert.equal(flag.resolution_note, buildResolutionNote(inf.inference_id, BATCH.entries[0], "question-answers-000"));
});

test("a second execute of the same entry is a no-op", async () => {
  const deps = fixtureDeps(clone(CORPUS));
  const json = batchOf(entryOf(REF_WHAT), entryOf(REF_COMPLY));
  await applyQuestionAnswers({ json, execute: true, deps, now: NOW });
  const flagsAfterFirst = clone(deps.tables.integrity_flags);
  const second = await applyQuestionAnswers({ json, execute: true, deps, now: NOW });
  assert.equal(deps.tables.inference_records.length, 1, "no second inference");
  assert.deepEqual(deps.tables.integrity_flags, flagsAfterFirst, "no flag changed");
  assert.equal(second.valid.length, 0);
  assert.equal(second.refused.length, 0, "already applied is not a refusal");
  assert.equal(second.alreadyApplied.length, 2);
  assert.equal(second.report.inferences_written + second.report.questions_closed + second.report.outcomes_recorded, 0);
});

test("unanswerable: the outcome is recorded on the question flag, which stays open and is not re-listed until the pool changes", async () => {
  const { r, deps } = await run(batchOf(entryOf(REF_COMPLY)), { execute: true });
  assert.equal(r.report.outcomes_recorded, 1);
  assert.equal(r.report.search_targets_raised, 1);
  assert.equal(r.report.unanswerable_needs.length, 1);
  const flag = deps.tables.integrity_flags.find((f) => f.subject_ref === REF_COMPLY);
  assert.equal(flag.status, "open");
  const o = flag.recommended_actions.find((a) => a.action === "unanswerable_from_holdings");
  assert.equal(o.pool_hash, BATCH.entries[1].pool_hash);
  assert.equal(o.rationale, BATCH.entries[1].missing);
  assert.equal(flag.recommended_actions.length, 2, "the generator's own action is kept");
  assert.equal(deps.tables.inference_records.length, 0);
  const { file } = await buildExport(deps, { charBudget: 60000, now: NOW });
  assert.ok(!file.bundles.some((b) => b.subject_ref === REF_COMPLY), "not re-listed while the pool hash is unchanged");
  deps.tables.agent_run_searches.find((p) => p.id === "p-b").result_content += " More guidance text arrives for this connected item.";
  const again = await buildExport(deps, { charBudget: 60000, now: NOW });
  const b = again.file.bundles.find((x) => x.subject_ref === REF_COMPLY);
  assert.equal(b.needs, "reasked_after_new_holdings");
});

test("withUnanswerableOutcome replaces an earlier outcome element and keeps the rest", () => {
  const acts = [{ action: "answer-seeking", rationale: "r" }, { action: "unanswerable_from_holdings", rationale: "old", pool_hash: "h0" }];
  const out = withUnanswerableOutcome(acts, { missing: "new need", pool_hash: "h1" }, "question-answers-001", NOW());
  assert.equal(out.length, 2);
  assert.deepEqual(out[1], { action: "unanswerable_from_holdings", rationale: "new need", pool_hash: "h1", batch: "question-answers-001", recorded_at: NOW() });
});

test("crash recovery: an inference already written for an open question only closes the flag, never writes a second", async () => {
  const deps = fixtureDeps(clone(CORPUS));
  const first = batchOf(entryOf(REF_WHAT));
  await applyQuestionAnswers({ json: first, execute: true, deps, now: NOW });
  const flag = deps.tables.integrity_flags.find((f) => f.subject_ref === REF_WHAT);
  Object.assign(flag, { status: "open", resolved_at: null, resolved_by: null, resolution_note: null }); // the close never happened
  const r = await applyQuestionAnswers({ json: first, execute: true, deps, now: NOW });
  assert.equal(deps.tables.inference_records.length, 1);
  assert.equal(r.written[0].mode, "close_only");
  assert.equal(flag.status, "resolved");
  assert.equal(r.readBackFailures.length, 0);
});

test("a re-opened question answered again writes a NEW inference that supersedes the prior one", async () => {
  const deps = fixtureDeps(clone(CORPUS));
  await applyQuestionAnswers({ json: batchOf(entryOf(REF_WHAT)), execute: true, deps, now: NOW });
  const priorId = deps.tables.inference_records[0].inference_id;
  deps.tables.integrity_flags.push({ ...clone(CORPUS.tables.integrity_flags[0]), id: "f-reopen" }); // the re-open (same dedup rule: only one open row)
  const e = entryOf(REF_WHAT);
  e.answer = "The amendment lowers the permitted humidity ceiling to 55 percent for stored artwork.";
  e.cited_item_ids = [A];
  e.evidence = [e.evidence[0]];
  const r = await applyQuestionAnswers({ json: batchOf(e), execute: true, deps, now: NOW });
  assert.equal(r.readBackFailures.length, 0, JSON.stringify(r));
  assert.equal(deps.tables.inference_records.length, 2);
  assert.equal(deps.tables.inference_records[1].supersedes, priorId);
});

test("a write that fails is recorded as a failure for that entry and does not stop the next one", async () => {
  const deps = fixtureDeps(clone(CORPUS));
  const real = deps.rpcClient();
  let calls = 0;
  deps.rpcClient = () => ({ rpc: async (fn, args) => (calls++ === 0 ? { data: null, error: { message: "boom" } } : real.rpc(fn, args)) });
  const r = await applyQuestionAnswers({ json: batchOf(entryOf(REF_WHAT), entryOf(REF_COMPLY)), execute: true, deps, now: NOW });
  assert.equal(r.writeFailures.length, 1);
  assert.match(r.writeFailures[0].error, /boom/);
  assert.equal(deps.tables.integrity_flags.find((f) => f.subject_ref === REF_WHAT).status, "open", "no flag closed without its inference");
  assert.equal(r.report.outcomes_recorded, 1);
});

test("rule 17: the apply's run artifact reports inferences written, questions closed, outcomes recorded and targets raised", async () => {
  const { r } = await run(batchOf(entryOf(REF_WHAT), entryOf(REF_COMPLY)), { execute: true });
  const input = applyArtifactInput({ parsed: { execute: true, answers: "b.json" }, r, answersPath: "b.json", startedAt: NOW() });
  assert.deepEqual(
    [input.metrics.inferences_written, input.metrics.questions_closed, input.metrics.outcomes_recorded, input.metrics.search_targets_raised],
    [1, 1, 1, 1],
  );
  assert.ok(input.perItem.some((p) => p.outcome === "applied_answered" && /inference /.test(p.verdict)));
  assert.ok(input.perItem.some((p) => p.outcome === "applied_unanswerable_from_holdings" && /needs: /.test(p.verdict)));
  const dir = mkdtempSync(join(tmpdir(), "qa-art-"));
  const path = emitQuestionAnswersArtifact(input, { familyDir: dir });
  assert.deepEqual(validateRunArtifact(JSON.parse(readFileSync(path, "utf8"))), []);
});

test("a refused entry is recorded as residue with its reason in the artifact", async () => {
  const bad = entryOf(REF_WHAT);
  bad.pool_hash = "f".repeat(64);
  const { r } = await run(batchOf(bad));
  const input = applyArtifactInput({ parsed: { execute: false, answers: "b.json" }, r, answersPath: "b.json", startedAt: NOW() });
  assert.equal(input.perItem[0].outcome, "refused");
  assert.match(input.perItem[0].error, /pool_hash does not match/);
  assert.equal(input.defectsFound.length, 1);
});

// ── holdings-need targets (ADR-044 decision 2, coordinator ruling 2026-10-05) ──────────────────────────────
const needsOf = (deps, ref) => deps.tables.integrity_flags.filter((f) => f.created_by.startsWith("holdings-need:") && f.subject_ref === ref);

test("an unanswerable entry raises ONE open holdings-need target carrying the need and the question's structured context", async () => {
  const { r, deps } = await run(batchOf(entryOf(REF_COMPLY)), { execute: true });
  assert.equal(r.readBackFailures.length, 0, JSON.stringify(r.readBackFailures));
  const targets = needsOf(deps, REF_COMPLY);
  assert.equal(targets.length, 1);
  const t = targets[0];
  assert.deepEqual([t.created_by, t.status, t.category, t.subject_type], ["holdings-need:comply", "open", "coverage_gap", "item"]);
  assert.deepEqual(needOfFlag(t), { subject_ref: REF_COMPLY, need: BATCH.entries[1].missing, item_id: A, surface: "regulations", product_question: "comply" });
  assert.equal(t.recommended_actions[0].pool_hash, BATCH.entries[1].pool_hash);
  assert.ok(!t.created_by.startsWith("lineage-gap:"), "its own namespace, never the lineage-gap one");
});

test("the target is one per question: a second apply is a no-op, a re-ask with a fresh need refreshes it in place", async () => {
  const deps = fixtureDeps(clone(CORPUS));
  const json = batchOf(entryOf(REF_COMPLY));
  await applyQuestionAnswers({ json, execute: true, deps, now: NOW });
  const again = await applyQuestionAnswers({ json, execute: true, deps, now: NOW });
  assert.equal(again.alreadyApplied.length, 1);
  assert.equal(needsOf(deps, REF_COMPLY).length, 1);
  // new holdings arrive, the lane re-authors with a different need against the new pool hash
  deps.tables.agent_run_searches.find((p) => p.id === "p-b").result_content += " Additional guidance text arrives for this connected item.";
  const { file } = await buildExport(deps, { charBudget: 60000, now: NOW });
  const b = file.bundles.find((x) => x.subject_ref === REF_COMPLY);
  assert.equal(b.needs, "reasked_after_new_holdings");
  const e = entryOf(REF_COMPLY);
  e.pool_hash = b.pool_hash;
  e.missing = "A published penalty schedule for late filing of the storage plan.";
  const re = await applyQuestionAnswers({ json: batchOf(e), execute: true, deps, now: NOW });
  assert.equal(re.readBackFailures.length, 0, JSON.stringify(re));
  assert.equal(re.report.search_targets_refreshed, 1);
  assert.equal(re.report.search_targets_raised, 0);
  const t = needsOf(deps, REF_COMPLY);
  assert.equal(t.length, 1);
  assert.equal(needOfFlag(t[0]).need, e.missing);
});

test("the target is closed by rule when the question is later answered", async () => {
  const deps = fixtureDeps(clone(CORPUS));
  await applyQuestionAnswers({ json: batchOf(entryOf(REF_COMPLY)), execute: true, deps, now: NOW });
  const ans = entryOf(REF_WHAT);
  ans.subject_ref = REF_COMPLY;
  const r = await applyQuestionAnswers({ json: batchOf(ans), execute: true, deps, now: NOW });
  assert.equal(r.readBackFailures.length, 0, JSON.stringify(r));
  assert.equal(r.report.search_targets_closed, 1);
  const t = needsOf(deps, REF_COMPLY)[0];
  assert.equal(t.status, "resolved");
  assert.match(t.resolution_note, /answered by inference/);
});

// ── pool-hash drift is the invalidation signal for an answered question ────────────────────────────────────
test("an answered question records the pool_hash it answered against, and is not re-listed while the pool is unchanged", async () => {
  const { deps } = await run(batchOf(entryOf(REF_WHAT)), { execute: true });
  const flag = deps.tables.integrity_flags.find((f) => f.subject_ref === REF_WHAT);
  const a = recordedAnswer(flag);
  assert.equal(a.pool_hash, BATCH.entries[0].pool_hash);
  assert.equal(a.inference_id, deps.tables.inference_records[0].inference_id);
  const { file, summary } = await buildExport(deps, { charBudget: 60000, now: NOW });
  assert.ok(!file.bundles.some((b) => b.subject_ref === REF_WHAT));
  assert.equal(summary.skipped_answered_unchanged, 1);
});

test("an answered question whose held pool changed is listed as a re-answer carrying the prior inference id", async () => {
  const { deps } = await run(batchOf(entryOf(REF_WHAT)), { execute: true });
  const priorId = deps.tables.inference_records[0].inference_id;
  deps.tables.agent_run_searches.find((p) => p.id === "p-a").result_content += " A further sentence about bonded stores was captured later.";
  const { file, summary } = await buildExport(deps, { charBudget: 60000, now: NOW });
  const b = file.bundles.find((x) => x.subject_ref === REF_WHAT);
  assert.ok(b, "listed again");
  assert.equal(b.needs, "reanswer_after_new_holdings");
  assert.equal(b.prior_inference_id, priorId);
  assert.equal(summary.listed_reanswer, 1);
});

test("the apply of a re-answer writes the new inference with supersedes set to the prior id and re-closes the flag; a second apply is a no-op", async () => {
  const deps = fixtureDeps(clone(CORPUS));
  await applyQuestionAnswers({ json: batchOf(entryOf(REF_WHAT)), execute: true, deps, now: NOW });
  const priorId = deps.tables.inference_records[0].inference_id;
  deps.tables.agent_run_searches.find((p) => p.id === "p-a").result_content += " A further sentence about bonded stores was captured later.";
  const { file } = await buildExport(deps, { charBudget: 60000, now: NOW });
  const hash = file.bundles.find((x) => x.subject_ref === REF_WHAT).pool_hash;
  const e = entryOf(REF_WHAT);
  e.pool_hash = hash;
  e.answer = "The amendment lowers the permitted humidity ceiling to 55 percent for stored artwork.";
  e.cited_item_ids = [A];
  e.evidence = [e.evidence[0]];
  const r = await applyQuestionAnswers({ json: batchOf(e), execute: true, deps, now: NOW });
  assert.equal(r.readBackFailures.length, 0, JSON.stringify(r));
  assert.equal(deps.tables.inference_records.length, 2);
  assert.equal(deps.tables.inference_records[1].supersedes, priorId);
  const flag = deps.tables.integrity_flags.find((f) => f.subject_ref === REF_WHAT);
  assert.equal(flag.status, "resolved");
  assert.equal(recordedAnswer(flag).pool_hash, hash);
  assert.equal(recordedAnswer(flag).inference_id, deps.tables.inference_records[1].inference_id);
  const again = await applyQuestionAnswers({ json: batchOf(e), execute: true, deps, now: NOW });
  assert.equal(deps.tables.inference_records.length, 2);
  assert.equal(again.alreadyApplied.length, 1);
  const out = await buildExport(deps, { charBudget: 60000, now: NOW });
  assert.ok(!out.file.bundles.some((b) => b.subject_ref === REF_WHAT), "the re-answer's own hash is current");
});

test("an answered question whose pool has NOT moved cannot be answered again, and one that moved cannot be marked unanswerable", async () => {
  const deps = fixtureDeps(clone(CORPUS));
  await applyQuestionAnswers({ json: batchOf(entryOf(REF_WHAT)), execute: true, deps, now: NOW });
  const other = entryOf(REF_WHAT);
  other.answer = "The amendment lowers the permitted humidity ceiling to 55 percent for stored artwork.";
  other.cited_item_ids = [A];
  other.evidence = [other.evidence[0]];
  const r = await applyQuestionAnswers({ json: batchOf(other), execute: true, deps, now: NOW });
  assert.equal(r.valid.length, 0);
  assert.match(r.refused[0].errors[0], /no longer open/);
  deps.tables.agent_run_searches.find((p) => p.id === "p-a").result_content += " A further sentence about bonded stores was captured later.";
  const { file } = await buildExport(deps, { charBudget: 60000, now: NOW });
  const un = entryOf(REF_COMPLY);
  un.subject_ref = REF_WHAT;
  un.pool_hash = file.bundles.find((x) => x.subject_ref === REF_WHAT).pool_hash;
  const r2 = await applyQuestionAnswers({ json: batchOf(un), execute: false, deps, now: NOW });
  assert.match(r2.refused[0].errors.join(" "), /re-answered, never marked unanswerable/);
});

// ── the CLIs, fired end to end over the fixture corpus (no database, no credentials) ──────────────────────
const exportCli = join(HERE, "..", "export-questions-for-answers.mjs");
const applyCli = join(HERE, "..", "apply-question-answers.mjs");
const cli = (script, args) => spawnSync(process.execPath, [script, ...args], { encoding: "utf8", env: cliEnv });

test("CLIs: without credentials and without --fixture both exit 2; with --fixture they run", () => {
  assert.equal(cli(exportCli, ["--out-dir", mkdtempSync(join(tmpdir(), "qa-cli-"))]).status, 2);
  assert.equal(cli(applyCli, ["--answers", BATCH_PATH]).status, 2);
  const out = mkdtempSync(join(tmpdir(), "qa-cli-"));
  const ex = cli(exportCli, ["--out-dir", out, "--fixture", CORPUS_PATH]);
  assert.equal(ex.status, 0, ex.stderr);
  assert.match(ex.stdout, /2 question\(s\) exported of 4 open/);
  assert.equal(readdirSync(out).length, 1);
  const dry = cli(applyCli, ["--answers", BATCH_PATH, "--fixture", CORPUS_PATH]);
  assert.equal(dry.status, 0, dry.stderr);
  assert.match(dry.stdout, /2 valid, 0 refused, 0 already applied \(DRY RUN, nothing written\)/);
  const live = cli(applyCli, ["--answers", BATCH_PATH, "--fixture", CORPUS_PATH, "--execute"]);
  assert.equal(live.status, 0, live.stderr);
  assert.match(live.stdout, /inferences written 1, questions closed 1, unanswerable outcomes recorded 1, search targets raised 1 \(refreshed 0, closed 0\)/);
});
