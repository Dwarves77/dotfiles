// Run: node --test scripts/maintenance/retype-eu-decisions.test.mjs -- no DB, no jiti, deps injected.
// Covers: the write order (claims BEFORE the retype UPDATE, read-back AFTER, flywheel queued LAST), the
// verbatim-title rule (a re-extracted title is applied only when it is a literal substring of the pool
// text and differs from the current title; a fallback title is never applied), the non-verified
// read-back reporting (an item that does not stay `verified` is named in `not_verified`), and both
// flywheel branches (the ids entry point present vs absent on this branch).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isRetypeCandidate,
  partitionInitiativeRows,
  planTitleUpdate,
  planItemRetype,
  applyOneItem,
  main,
  queueFlywheelStep,
  parseBatchArgs,
  FLYWHEEL_NOT_PRESENT,
  SLOTS_TO_ADD,
  NEW_ITEM_TYPE,
  NEW_FORMAT_TYPE,
  OLD_ITEM_TYPE,
} from "./retype-eu-decisions.mjs";

// Mirrors item-type-required-slots.json's own live entries for the two item_types this file touches.
const REQUIRED_SLOTS = {
  regulation: ["effective_date", "jurisdictional_scope", "penalty_summary", "primary_deadline"],
  initiative: ["action_now", "conversion_trigger", "driving_parties", "signal_event", "corridor_identity"],
};

// A real-shaped EUR-Lex act body: carries an OJ act title (buildTitleForRow's extractOjActTitle branch),
// an effective_date trigger, and a jurisdictional_scope trigger ("Member States") -- but genuinely no
// penalty/deadline language, so penalty_summary and primary_deadline honestly resolve to GAP while
// jurisdictional_scope resolves to a real FACT. >200 chars (ADR-016 usability floor).
const CELEX_D_TEXT =
  "COMMISSION DECISION of 15 July 2020 confirming the measures notified by the Netherlands pursuant to " +
  "Article 6(6) of Directive 94/62/EC of the European Parliament and of the Council on packaging and " +
  "packaging waste (2020/1043). This Decision shall enter into force on the day of its notification. " +
  "This Decision is addressed to the Member States of the European Union.";

function makeItem(overrides = {}) {
  return {
    id: "item-1",
    title: "Placeholder title -- Commission",
    item_type: OLD_ITEM_TYPE,
    format_type: "market_signal_brief",
    source_id: "src-1",
    source_url: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32020D1043",
    canonical_instrument_key: "32020D1043",
    provenance_status: "verified",
    is_archived: false,
    ...overrides,
  };
}

test("isRetypeCandidate: a CELEX 'D'-letter initiative (sector 3) is a candidate; other letters/sectors and non-initiative types are not", () => {
  assert.equal(isRetypeCandidate(makeItem()), true);
  assert.equal(isRetypeCandidate(makeItem({ canonical_instrument_key: "32020L1043" })), false); // L -> directive, never this item_type in practice, but the key itself does not resolve to 'regulation'
  assert.equal(isRetypeCandidate(makeItem({ item_type: "market_signal" })), false);
  assert.equal(isRetypeCandidate(makeItem({ canonical_instrument_key: "not-a-celex-key" })), false);
  assert.equal(isRetypeCandidate(makeItem({ canonical_instrument_key: null })), false);
  // sector 2 and 4 D-letters are candidates too (task 1.3's map covers all three sectors).
  assert.equal(isRetypeCandidate(makeItem({ canonical_instrument_key: "22004D0806(01)" })), true);
  assert.equal(isRetypeCandidate(makeItem({ canonical_instrument_key: "42012D0708" })), true);
});

test("partitionInitiativeRows: splits CELEX-D candidates from the rest, reported separately", () => {
  const rows = [
    makeItem({ id: "a" }),
    makeItem({ id: "b", canonical_instrument_key: "not-celex" }),
    makeItem({ id: "c", canonical_instrument_key: "32020L1043" }), // CELEX-shaped, letter L (directive) -- not a D-letter-now-regulation candidate
  ];
  const { candidates, nonCelex } = partitionInitiativeRows(rows);
  assert.deepEqual(candidates.map((r) => r.id), ["a"]);
  assert.deepEqual(nonCelex.map((r) => r.id), ["b", "c"]);
});

test("planTitleUpdate: applies a re-extracted title only when it is verbatim in the pool text and differs from the current title", () => {
  const p1 = planTitleUpdate({ oldTitle: "Placeholder", capturedText: CELEX_D_TEXT, sourceUrl: "https://eur-lex.europa.eu/x" });
  assert.equal(p1.verbatim, true);
  assert.ok(p1.newTitle, "a real OJ act title was extracted and applied");
  assert.ok(CELEX_D_TEXT.toLowerCase().includes(p1.newTitle.toLowerCase()));

  // Re-extracting the SAME title as already stored is a no-op (newTitle null -- nothing to change).
  const p2 = planTitleUpdate({ oldTitle: p1.extractedTitle, capturedText: CELEX_D_TEXT, sourceUrl: "https://eur-lex.europa.eu/x" });
  assert.equal(p2.newTitle, null);

  // No usable pool text -> never invents a title.
  const p3 = planTitleUpdate({ oldTitle: "Placeholder", capturedText: "", sourceUrl: "https://eur-lex.europa.eu/x" });
  assert.equal(p3.newTitle, null);

  // Task 5.5b (2026-09-12): a bodyLeadTitle-tier extraction (buildTitleForRow's raw, un-extracted page-lead
  // slice, origin "captured_body_lead") is NEVER applied either, even though it is text-derived and passes
  // the verbatim check -- it is page boilerplate, not the act's own title (this is the exact defect the
  // retype-eu-decisions dry run's 369-item artifact surfaced: every one of its proposed titles came from
  // this exact tier). planTitleUpdate now calls buildTitleForRow with allowBodyLeadFallback: false, so a
  // text with no real OJ-act-heading shape never reaches that tier at all -- the item keeps its old title.
  const p4 = planTitleUpdate({ oldTitle: "Placeholder", capturedText: "short body with no act-title shape at all but over two hundred characters long so it clears the usability floor and reaches the fallback branch of buildTitleForRow for this exact test case here", sourceUrl: null });
  assert.equal(p4.newTitle, null);
  assert.equal(p4.extractedTitle, null);
});

test("planTitleUpdate: an item whose captured text has no act heading keeps its old title (task 5.5b -- never retitles from bodyLeadTitle's raw page-lead slice)", () => {
  // Real shape (b) OJ-header lead, shortened to omit the act heading entirely -- exactly the page chrome
  // the pre-5.5b bug turned into a title.
  const p = planTitleUpdate({
    oldTitle: "EUR-Lex - 32024D0837",
    capturedText:
      "Official Journal of the European Union EN Series L 2024/837 7.3.2024 no recognisable act heading " +
      "appears anywhere in this particular lead, only the page's own masthead and citation furniture here",
    sourceUrl: "https://eur-lex.europa.eu/x",
  });
  assert.equal(p.newTitle, null);
  assert.equal(p.titleOrigin, "source_name_fallback");
});

test("applyOneItem: an item whose captured text has no act heading is applied (retyped) but its title is kept, listed with title_changed false (task 5.5b)", async () => {
  const noHeadingText =
    "Official Journal of the European Union EN Series L 2024/837 7.3.2024 no recognisable act heading " +
    "appears anywhere in this particular lead, only the page's own masthead and citation furniture, and " +
    "this decision shall enter into force on the day of its notification and is addressed to the Member " +
    "States of the European Union.";
  const deps = fakeApplyDeps({ captures: [{ id: "cap-1", result_content: noHeadingText }] });
  const r = await applyOneItem(makeItem({ title: "EUR-Lex - 32020D1043" }), { apply: true, deps, requiredSlotsMap: REQUIRED_SLOTS });
  assert.equal(r.title_changed, false);
  assert.equal(r.new_title, "EUR-Lex - 32020D1043");
  const updateCall = deps.calls.find((c) => c.op === "updateItem");
  assert.ok(!("title" in updateCall.patch), "no title key is even sent when the item is kept");
});

test("planItemRetype: three slots claimed (FACT where the source states it, honest GAP where silent); predicts verified once all four regulation slots are covered", () => {
  const plan = planItemRetype({
    item: makeItem(),
    existingClaims: [{ claim_kind: "FACT", claim_text: "[effective_date] The captured source states, verbatim: «entered into force»" }],
    capturedText: CELEX_D_TEXT,
    requiredSlotsMap: REQUIRED_SLOTS,
  });
  assert.deepEqual(plan.slotClaims.map((s) => s.slotKey).sort(), [...SLOTS_TO_ADD].sort());
  const byslot = Object.fromEntries(plan.slotClaims.map((s) => [s.slotKey, s.claim.claim_kind]));
  assert.equal(byslot.jurisdictional_scope, "FACT"); // "Member States ... European Union" is stated
  assert.equal(byslot.penalty_summary, "GAP"); // no penalty language in the fixture
  assert.equal(byslot.primary_deadline, "GAP"); // no deadline language in the fixture
  assert.equal(plan.unhandledMissingSlots.length, 0);
  assert.equal(plan.predictedProvenance, "verified");
});

test("planItemRetype: a slot already covered by an existing claim is never re-claimed", () => {
  const plan = planItemRetype({
    item: makeItem(),
    existingClaims: [
      { claim_kind: "FACT", claim_text: "[effective_date] ..." },
      { claim_kind: "GAP", claim_text: "[penalty_summary] No penalty stated." },
    ],
    capturedText: CELEX_D_TEXT,
    requiredSlotsMap: REQUIRED_SLOTS,
  });
  assert.deepEqual(plan.slotClaims.map((s) => s.slotKey).sort(), ["jurisdictional_scope", "primary_deadline"]);
});

test("planItemRetype: an unhandled missing slot outside this script's three-slot scope is reported, never patched", () => {
  const plan = planItemRetype({
    item: makeItem(),
    existingClaims: [], // effective_date itself is missing here -- outside SLOTS_TO_ADD
    capturedText: CELEX_D_TEXT,
    requiredSlotsMap: REQUIRED_SLOTS,
  });
  assert.deepEqual(plan.unhandledMissingSlots, ["effective_date"]);
  assert.equal(plan.predictedProvenance, "quarantined");
});

// ── applyOneItem: write order + row shape ──────────────────────────────────────────────────────────

function fakeApplyDeps({ captures, claims = [], sections = [], provenanceAfter = "verified" } = {}) {
  const calls = [];
  return {
    calls,
    readCaptures: async () => captures,
    readClaims: async () => claims,
    readSections: async () => sections,
    insertSection: async (row) => { calls.push({ op: "insertSection", row }); return { id: "sec-new" }; },
    insertClaim: async (row) => { calls.push({ op: "insertClaim", row }); return { id: `claim-${calls.length}` }; },
    updateSectionContent: async (id, content_md) => { calls.push({ op: "updateSectionContent", id, content_md }); },
    updateItem: async (id, patch) => { calls.push({ op: "updateItem", id, patch }); },
    readProvenanceStatus: async () => provenanceAfter,
  };
}

test("applyOneItem dry: plans and writes nothing", async () => {
  const deps = fakeApplyDeps({ captures: [{ id: "cap-1", result_content: CELEX_D_TEXT }] });
  const r = await applyOneItem(makeItem(), { apply: false, deps, requiredSlotsMap: REQUIRED_SLOTS });
  assert.equal(r.outcome, "would_apply");
  assert.equal(deps.calls.length, 0);
  assert.equal(r.slots.length, 3);
});

test("applyOneItem apply: claims inserted BEFORE the retype UPDATE, section content appended, provenance read back AFTER", async () => {
  const deps = fakeApplyDeps({ captures: [{ id: "cap-1", result_content: CELEX_D_TEXT }] });
  const r = await applyOneItem(makeItem(), { apply: true, deps, requiredSlotsMap: REQUIRED_SLOTS });

  const ops = deps.calls.map((c) => c.op);
  const firstUpdateItemIdx = ops.indexOf("updateItem");
  const claimIdxs = ops.reduce((acc, op, i) => (op === "insertClaim" ? [...acc, i] : acc), []);
  assert.ok(claimIdxs.length === 3, "one claim per slot in SLOTS_TO_ADD");
  assert.ok(claimIdxs.every((i) => i < firstUpdateItemIdx), "every claim insert happens BEFORE the retype UPDATE");
  assert.ok(ops.indexOf("updateSectionContent") > claimIdxs[claimIdxs.length - 1], "section content is appended after the claims are inserted");
  assert.ok(ops.indexOf("updateSectionContent") < firstUpdateItemIdx, "section content is still updated before the retype");

  const updateCall = deps.calls.find((c) => c.op === "updateItem");
  assert.equal(updateCall.patch.item_type, NEW_ITEM_TYPE);
  assert.equal(updateCall.patch.format_type, NEW_FORMAT_TYPE);
  assert.ok("title" in updateCall.patch, "a verbatim re-extracted title is included in the same patch");

  // FACT claim carries a search_result_id resolved to the real capture; GAP claims never do.
  const claimRows = deps.calls.filter((c) => c.op === "insertClaim").map((c) => c.row);
  for (const row of claimRows) {
    if (row.claim_kind === "FACT") {
      assert.equal(row.search_result_id, "cap-1");
      assert.equal(row.source_id, "src-1");
    } else {
      assert.equal(row.search_result_id, null);
      assert.equal(row.source_id, null);
    }
  }

  assert.equal(r.outcome, "applied");
  assert.equal(r.provenance_status_after, "verified");
  assert.equal(r.stayed_verified, true);
});

test("applyOneItem apply: a new record_facts section is created when none exists yet", async () => {
  const deps = fakeApplyDeps({ captures: [{ id: "cap-1", result_content: CELEX_D_TEXT }], sections: [] });
  await applyOneItem(makeItem(), { apply: true, deps, requiredSlotsMap: REQUIRED_SLOTS });
  assert.ok(deps.calls.some((c) => c.op === "insertSection" && c.row.section_key === "record_facts"));
});

test("applyOneItem apply: an EXISTING record_facts section is reused, content appended not overwritten", async () => {
  const deps = fakeApplyDeps({
    captures: [{ id: "cap-1", result_content: CELEX_D_TEXT }],
    sections: [{ id: "sec-existing", item_id: "item-1", section_key: "record_facts", section_order: 2, content_md: "- [title] existing line" }],
  });
  await applyOneItem(makeItem(), { apply: true, deps, requiredSlotsMap: REQUIRED_SLOTS });
  assert.ok(!deps.calls.some((c) => c.op === "insertSection"));
  const upd = deps.calls.find((c) => c.op === "updateSectionContent");
  assert.equal(upd.id, "sec-existing");
  assert.ok(upd.content_md.startsWith("- [title] existing line"), "prior content is preserved, new claims appended");
});

test("applyOneItem: an item with no usable capture is held, never written", async () => {
  const deps = fakeApplyDeps({ captures: [{ id: "cap-1", result_content: "too short" }] });
  const r = await applyOneItem(makeItem(), { apply: true, deps, requiredSlotsMap: REQUIRED_SLOTS });
  assert.equal(r.outcome, "held_no_usable_capture");
  assert.equal(deps.calls.length, 0);
});

test("applyOneItem: an item that does NOT stay verified after the retype is reported honestly", async () => {
  const deps = fakeApplyDeps({ captures: [{ id: "cap-1", result_content: CELEX_D_TEXT }], provenanceAfter: "quarantined" });
  const r = await applyOneItem(makeItem(), { apply: true, deps, requiredSlotsMap: REQUIRED_SLOTS });
  assert.equal(r.provenance_status_after, "quarantined");
  assert.equal(r.stayed_verified, false);
});

// ── queueFlywheelStep: both branches ───────────────────────────────────────────────────────────────

test("queueFlywheelStep: named skip when the ids entry point is not present on this branch (module import throws)", async () => {
  const r = await queueFlywheelStep(["i1"], {
    mode: "apply",
    importFlywheel: async () => { throw new Error("Cannot find module '../turns/run-population-flywheel.mjs'"); },
  });
  assert.equal(r.outcome, "skipped");
  assert.equal(r.reason, FLYWHEEL_NOT_PRESENT);
});

test("queueFlywheelStep: named skip when the module imports fine but the export is absent (today's real branch state)", async () => {
  const r = await queueFlywheelStep(["i1"], {
    mode: "apply",
    importFlywheel: async () => ({ someOtherExport: () => {} }),
  });
  assert.equal(r.outcome, "skipped");
  assert.equal(r.reason, FLYWHEEL_NOT_PRESENT);
});

test("queueFlywheelStep: queues when the export IS present (Part 3 merged)", async () => {
  const calls = [];
  const r = await queueFlywheelStep(["i1", "i2"], {
    mode: "apply",
    db: { fake: true },
    importFlywheel: async () => ({
      runUnscopedFlywheelSteps: async (mode, ids, db) => { calls.push({ mode, ids, db }); return { ok: true }; },
    }),
  });
  assert.equal(r.outcome, "queued");
  assert.deepEqual(calls, [{ mode: "apply", ids: ["i1", "i2"], db: { fake: true } }]);
});

test("queueFlywheelStep: dry mode never calls the real function even when present", async () => {
  const r = await queueFlywheelStep(["i1"], {
    mode: "dry",
    importFlywheel: async () => ({ runUnscopedFlywheelSteps: async () => { throw new Error("must not be called in dry mode"); } }),
  });
  assert.equal(r.outcome, "would_queue");
});

test("queueFlywheelStep: an empty batch (nothing applied) is skipped, never imports anything", async () => {
  let imported = false;
  const r = await queueFlywheelStep([], { mode: "apply", importFlywheel: async () => { imported = true; return {}; } });
  assert.equal(r.outcome, "skipped");
  assert.equal(imported, false);
});

test("parseBatchArgs: --limit and --after-id parsed; absent flags are undefined", () => {
  assert.deepEqual(parseBatchArgs([]), { limit: undefined, afterId: undefined });
  assert.deepEqual(parseBatchArgs(["--limit", "50"]), { limit: 50, afterId: undefined });
  assert.deepEqual(parseBatchArgs(["--after-id", "abc"]), { limit: undefined, afterId: "abc" });
});

// ── main(): end-to-end orchestration over fakes ────────────────────────────────────────────────────

function fakeMainDeps({ initiativeRows, marketSignalRows = [], captureByItem = {}, claimsByItem = {}, provenanceAfterByItem = {} } = {}) {
  const writes = [];
  const flywheelCalls = [];
  return {
    writes,
    flywheelCalls,
    requiredSlotsMap: REQUIRED_SLOTS,
    readInitiativeRows: async () => initiativeRows,
    readMarketSignalRows: async () => marketSignalRows,
    readCaptures: async (id) => captureByItem[id] ?? [],
    readClaims: async (id) => claimsByItem[id] ?? [],
    readSections: async () => [],
    insertSection: async (row) => { writes.push({ op: "insertSection", row }); return { id: `sec-${row.item_id}` }; },
    insertClaim: async (row) => { writes.push({ op: "insertClaim", row }); return { id: `claim-${writes.length}` }; },
    updateSectionContent: async (id, content_md) => { writes.push({ op: "updateSectionContent", id, content_md }); },
    updateItem: async (id, patch) => { writes.push({ op: "updateItem", id, patch }); },
    readProvenanceStatus: async (id) => provenanceAfterByItem[id] ?? "verified",
    readAllRegulationStatuses: async () => Object.values(provenanceAfterByItem).map((s) => ({ provenance_status: s })),
    queueFlywheel: async (ids, opts) => { flywheelCalls.push({ ids, opts }); return { outcome: "skipped", reason: FLYWHEEL_NOT_PRESENT }; },
  };
}

test("main dry: reports EU-decision candidates, non-CELEX initiatives, and market_signal rows separately; writes nothing", async () => {
  const rows = [
    makeItem({ id: "a" }),
    makeItem({ id: "b", canonical_instrument_key: "not-celex", title: "A non-CELEX initiative" }),
  ];
  const marketSignals = [makeItem({ id: "m1", item_type: "market_signal", title: "A market signal" })];
  const deps = fakeMainDeps({
    initiativeRows: rows,
    marketSignalRows: marketSignals,
    captureByItem: { a: [{ id: "cap-a", result_content: CELEX_D_TEXT }] },
  });
  const s = await main({ mode: "dry" }, deps);
  assert.equal(s.step, "retype-eu-decisions");
  assert.equal(s.counts.eu_decision_candidates, 1);
  assert.equal(s.counts.non_celex_initiatives, 1);
  assert.equal(s.counts.market_signals, 1);
  assert.deepEqual(s.non_celex_initiatives.map((r) => r.id), ["b"]);
  assert.deepEqual(s.market_signals.map((r) => r.id), ["m1"]);
  assert.equal(deps.writes.length, 0);
  assert.equal(s.applied, 0);
  // dry mode still asks the flywheel step what it WOULD do, over an empty batch (nothing applied yet).
  assert.equal(deps.flywheelCalls.length, 1);
  assert.deepEqual(deps.flywheelCalls[0].ids, []);
});

test("main apply: retypes every EU-decision candidate, reports items that did not stay verified, queues the flywheel with the applied ids", async () => {
  const rows = [
    makeItem({ id: "a" }),
    makeItem({ id: "b" }),
  ];
  const deps = fakeMainDeps({
    initiativeRows: rows,
    captureByItem: {
      a: [{ id: "cap-a", result_content: CELEX_D_TEXT }],
      b: [{ id: "cap-b", result_content: CELEX_D_TEXT }],
    },
    provenanceAfterByItem: { a: "verified", b: "quarantined" },
  });
  const s = await main({ mode: "apply" }, deps);
  assert.equal(s.applied, 2);
  assert.equal(s.counts.stayed_verified, 1);
  assert.deepEqual(s.not_verified.map((r) => r.id), ["b"]);
  assert.equal(deps.flywheelCalls.length, 1);
  assert.deepEqual(deps.flywheelCalls[0].ids.sort(), ["a", "b"]);
  assert.ok(deps.writes.some((w) => w.op === "updateItem" && w.id === "a" && w.patch.item_type === NEW_ITEM_TYPE));
  assert.ok(s.read_back.regulation_total >= 0);
});

test("main: --limit bounds the page, --after-id resumes past a prior run", async () => {
  const rows = [makeItem({ id: "a" }), makeItem({ id: "b" }), makeItem({ id: "c" })];
  const captureByItem = Object.fromEntries(rows.map((r) => [r.id, [{ id: `cap-${r.id}`, result_content: CELEX_D_TEXT }]]));

  const d1 = fakeMainDeps({ initiativeRows: rows, captureByItem });
  const s1 = await main({ mode: "dry", limit: 1 }, d1);
  assert.equal(s1.counts.page_size, 1);
  assert.equal(s1.last_id_processed, "a");

  const d2 = fakeMainDeps({ initiativeRows: rows, captureByItem });
  const s2 = await main({ mode: "dry", afterId: "a" }, d2);
  assert.equal(s2.counts.page_size, 2);
  assert.equal(s2.last_id_processed, "c");
});

test("main: an item held for lacking a usable capture is counted and never retyped", async () => {
  const rows = [makeItem({ id: "a" })];
  const deps = fakeMainDeps({ initiativeRows: rows, captureByItem: { a: [{ id: "cap-a", result_content: "too short" }] } });
  const s = await main({ mode: "apply" }, deps);
  assert.equal(s.counts.held_no_usable_capture, 1);
  assert.equal(s.applied, 0);
  assert.ok(!deps.writes.some((w) => w.op === "updateItem"));
});
