import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mapClaimRows,
  mapSectionRows,
  forwardEventIdentityKey,
  classifyDefects,
  planItemRetext,
  buildRestoreSql,
  main,
} from "./forward-events-retext.mjs";

// Fixtures reused from src/lib/forward-events/extract-forward-events.test.mjs's own header: read LIVE
// against kwrsbpiseruzbfwjpvsp 2026-09-04, verbatim (see that file for the exact SQL).
const EURO7_PHASE_CLAIM_SPAN =
  "It shall apply from 29 November 2026 for new types of vehicles of categories M 1 and N 1 and components, " +
  "systems and separate technical units intended for vehicles of categories M 1 or N 1 type-approved under " +
  "this Regulation and from 29 November 2027 for new vehicles of cat";

const EURO7_PHASE_SECTION_MD =
  "...published 8 May 2024, placing entry into force at **28 May 2024**. *Source: Regulation (EU) 2024/1257, " +
  "Article 21. https://eur-lex.europa.eu/eli/reg/2024/1257/oj/eng\n\n**Primary headline compliance deadline — " +
  'FACT:** "It shall apply from 29 November 2026 for new types of vehicles of categories M₁ and N₁ and ' +
  "components, systems and separate technical units intended for vehicles of categories M₁ or N₁ " +
  "type-approved under this Regulation and from 29 November 2027 for new vehicles of cat";

test("mapClaimRows / mapSectionRows: DB row shape to extractor input shape", () => {
  const claims = mapClaimRows([{ id: "c1", claim_kind: "FACT", claim_text: "[x] hi", source_span: "hi" }]);
  assert.deepEqual(claims, [{ claim_id: "c1", kind: "FACT", text: "[x] hi", span: "hi" }]);
  const sections = mapSectionRows([{ id: "s1", section_key: "2", content_md: "md text" }]);
  assert.deepEqual(sections, [{ section_id: "s1", key: "2", md: "md text" }]);
  // null content_md never crashes -- becomes an empty string, same as read-and-extract.mjs's own mapping.
  assert.deepEqual(mapSectionRows([{ id: "s2", section_key: "3", content_md: null }]), [{ section_id: "s2", key: "3", md: "" }]);
});

test("forwardEventIdentityKey: claim-sourced uses source_claim_id; section-sourced uses source_section_id", () => {
  assert.equal(
    forwardEventIdentityKey({ source_claim_id: "c1", source_section_id: null, event_date: "2026-11-29", event_kind: "phase_step" }),
    "c1|2026-11-29|phase_step"
  );
  assert.equal(
    forwardEventIdentityKey({ source_claim_id: null, source_section_id: "s1", event_date: "2026-11-29", event_kind: "phase_step" }),
    "s1|2026-11-29|phase_step"
  );
});

test("classifyDefects: names the observable defect class(es) on real garbled text", () => {
  assert.deepEqual(classifyDefects("venues generated from fines. By 25 September 2026"), ["starts_lowercase"]);
  assert.deepEqual(
    classifyDefects('7/oj/eng **Primary headline — FACT:** "It shall apply..."').sort(),
    ["bold_marker", "starts_nonletter", "url_tail"].sort()
  );
  assert.deepEqual(
    classifyDefects("hicles (M₂, M₃) | MONITORING **FACT:** \"By 29 November 2026...\"").sort(),
    ["bold_marker", "pipe_cell", "starts_lowercase"].sort()
  );
  assert.deepEqual(classifyDefects("By 1 September 2030, Member States shall inform the Commission"), ["other_or_dedupe_only"]);
});

test("planItemRetext: an existing row whose fresh text differs is a retext target; before/after and defect class are recorded", () => {
  const existingRows = [
    {
      id: "row-1",
      event_date: "2026-11-29",
      event_kind: "phase_step",
      obligation_text: "7/oj/eng **Primary headline compliance deadline — FACT:** \"It shall apply from 29 November 2026 for new types of vehicles of categories M₁ and N₁ and components, systems and separate technical units intended for vehicles of categories M₁ or N₁ type-approv",
      source_kind: "section",
      source_claim_id: null,
      source_section_id: "s1",
    },
  ];
  const { retextTargets, duplicateGroups } = planItemRetext({
    itemId: "item-1",
    existingRows,
    claims: [],
    sections: mapSectionRows([{ id: "s1", section_key: "2", content_md: EURO7_PHASE_SECTION_MD }]),
  });
  assert.equal(retextTargets.length, 1);
  assert.equal(retextTargets[0].id, "row-1");
  assert.equal(retextTargets[0].before, existingRows[0].obligation_text);
  assert.ok(!retextTargets[0].after.startsWith("7/oj/eng"));
  assert.ok(!retextTargets[0].after.includes("**"));
  assert.ok(retextTargets[0].defect_classes.includes("url_tail"));
  assert.ok(retextTargets[0].defect_classes.includes("bold_marker"));
  assert.equal(duplicateGroups.length, 0, "a single row with no claim counterpart is never a duplicate group");
});

test("planItemRetext: a row whose fresh text is UNCHANGED is never a retext target", () => {
  // Terminal period required (lane FWD-TEXT-2): normalizeObligationText now honestly
  // appends '…' to any window with no terminal punctuation, so an unterminated fixture
  // here would no longer round-trip unchanged -- give it a real sentence end instead.
  const clean = "By 1 September 2030, Member States shall inform the Commission of the application of this Regulation.";
  const existingRows = [{ id: "row-1", event_date: "2030-09-01", event_kind: "compliance_deadline", obligation_text: clean, source_kind: "claim", source_claim_id: "c1", source_section_id: null }];
  const { retextTargets } = planItemRetext({
    itemId: "item-1",
    existingRows,
    claims: mapClaimRows([{ id: "c1", claim_kind: "FACT", claim_text: clean, source_span: clean }]),
    sections: [],
  });
  assert.equal(retextTargets.length, 0);
});

test("planItemRetext: DUPLICATE GROUP — two existing rows (one claim, one section) that the fresh dedupe would now collapse are reported, id-matched to the REAL live rows, never fabricated", () => {
  const existingRows = [
    {
      id: "claim-row",
      event_date: "2026-11-29",
      event_kind: "phase_step",
      obligation_text: EURO7_PHASE_CLAIM_SPAN, // pre-fix, this claim row's text already happened to be clean
      source_kind: "claim",
      source_claim_id: "claim-1",
      source_section_id: null,
    },
    {
      id: "section-row",
      event_date: "2026-11-29",
      event_kind: "phase_step",
      obligation_text: "7/oj/eng **Primary headline compliance deadline — FACT:** \"It shall apply from 29 November 2026 for new types of vehicles of categories M₁ and N₁ and components, systems and separate technical units intended for vehicles of categories M₁ or N₁ type-approv",
      source_kind: "section",
      source_claim_id: null,
      source_section_id: "section-1",
    },
  ];
  const { duplicateGroups, retextTargets } = planItemRetext({
    itemId: "item-1",
    existingRows,
    claims: mapClaimRows([{ id: "claim-1", claim_kind: "FACT", claim_text: EURO7_PHASE_CLAIM_SPAN, source_span: EURO7_PHASE_CLAIM_SPAN }]),
    sections: mapSectionRows([{ id: "section-1", section_key: "2", content_md: EURO7_PHASE_SECTION_MD }]),
  });
  assert.equal(duplicateGroups.length, 1);
  assert.equal(duplicateGroups[0].would_drop_id, "section-row");
  assert.equal(duplicateGroups[0].would_keep_id, "claim-row");
  assert.equal(duplicateGroups[0].reason, "claim_backed_preferred_over_section_backed");
  // the section row is ALSO independently a retext target (its own text is garbled) -- both findings can
  // legitimately fire for the same row; the duplicate-group finding does not suppress the retext finding.
  assert.ok(retextTargets.some((t) => t.id === "section-row"));
});

test("planItemRetext: never fabricates a duplicate group when only one side of a fresh drop has a real matching existing row", () => {
  // Only the section row exists in the DB (e.g. the claim was re-grounded differently since); the dropped
  // detail's "kept" identity therefore matches no existing row, so no group is reported.
  const existingRows = [
    {
      id: "section-row",
      event_date: "2026-11-29",
      event_kind: "phase_step",
      obligation_text: "stale text",
      source_kind: "section",
      source_claim_id: null,
      source_section_id: "section-1",
    },
  ];
  const { duplicateGroups } = planItemRetext({
    itemId: "item-1",
    existingRows,
    claims: mapClaimRows([{ id: "claim-1", claim_kind: "FACT", claim_text: EURO7_PHASE_CLAIM_SPAN, source_span: EURO7_PHASE_CLAIM_SPAN }]),
    sections: mapSectionRows([{ id: "section-1", section_key: "2", content_md: EURO7_PHASE_SECTION_MD }]),
  });
  assert.equal(duplicateGroups.length, 0);
});

test("buildRestoreSql: restores the prior obligation_text verbatim, quotes escaped", () => {
  const sql = buildRestoreSql({ id: "row-1", obligation_text: "It's a test" });
  assert.equal(sql, "UPDATE item_forward_events SET obligation_text = 'It''s a test' WHERE id = 'row-1';");
});

// ── main() end-to-end over fake deps ────────────────────────────────────────────────────────────────────

function fakeDeps({ itemsById = {} } = {}) {
  const updates = [];
  return {
    itemIds: Object.keys(itemsById),
    updates,
    readItemIdsWithForwardEvents: async () => Object.keys(itemsById),
    readForwardEventsForItem: async (id) => itemsById[id].existingRows,
    readClaimsForItem: async (id) => itemsById[id].claimRows ?? [],
    readSectionsForItem: async (id) => itemsById[id].sectionRows ?? [],
    updateObligationText: async (id, text) => {
      updates.push({ id, text });
      return { updated: 1, rows: [{ id, obligation_text: text }] };
    },
    readRowsByIds: async (ids) => ids.map((id) => ({ id, obligation_text: updates.find((u) => u.id === id)?.text })),
    readSnapshotEntries: async () => [],
    restoreOne: async () => ({ updated: 1 }),
  };
}

test("main dry: reports counts, retext_targets, duplicate_groups; writes nothing", async () => {
  const deps = fakeDeps({
    itemsById: {
      "item-1": {
        existingRows: [
          {
            id: "row-1",
            event_date: "2026-11-29",
            event_kind: "phase_step",
            obligation_text: "7/oj/eng **Primary headline compliance deadline — FACT:** \"It shall apply from 29 November 2026 for new types of vehicles of categories M₁ and N₁ and components, systems and separate technical units intended for vehicles of categories M₁ or N₁ type-approv",
            source_kind: "section",
            source_claim_id: null,
            source_section_id: "s1",
          },
        ],
        sectionRows: [{ id: "s1", section_key: "2", content_md: EURO7_PHASE_SECTION_MD }],
      },
    },
  });
  const s = await main({ mode: "dry" }, deps);
  assert.equal(s.mode, "dry");
  assert.equal(s.counts.items_scanned, 1);
  assert.equal(s.counts.retext_target_total, 1);
  assert.ok(s.counts.by_defect_class.url_tail >= 1);
  assert.equal(deps.updates.length, 0, "dry mode never writes");
  assert.match(s.note, /never deletes a row/);
});

test("main apply: rewrites obligation_text through the guarded path, records restore_sql, reads back", async () => {
  const deps = fakeDeps({
    itemsById: {
      "item-1": {
        existingRows: [
          {
            id: "row-1",
            event_date: "2026-11-29",
            event_kind: "phase_step",
            obligation_text: "7/oj/eng **Primary headline compliance deadline — FACT:** \"It shall apply from 29 November 2026 for new types of vehicles of categories M₁ and N₁ and components, systems and separate technical units intended for vehicles of categories M₁ or N₁ type-approv",
            source_kind: "section",
            source_claim_id: null,
            source_section_id: "s1",
          },
        ],
        sectionRows: [{ id: "s1", section_key: "2", content_md: EURO7_PHASE_SECTION_MD }],
      },
    },
  });
  const s = await main({ mode: "apply" }, deps);
  assert.equal(s.exitCode, 0);
  assert.equal(s.applied, 1);
  assert.equal(deps.updates.length, 1);
  assert.equal(deps.updates[0].id, "row-1");
  assert.ok(!deps.updates[0].text.startsWith("7/oj/eng"));
  assert.equal(s.per_item.length, 1);
  assert.equal(
    s.per_item[0].before.obligation_text,
    "7/oj/eng **Primary headline compliance deadline — FACT:** \"It shall apply from 29 November 2026 for new types of vehicles of categories M₁ and N₁ and components, systems and separate technical units intended for vehicles of categories M₁ or N₁ type-approv"
  );
  assert.ok(!s.per_item[0].after.obligation_text.startsWith("7/oj/eng"));
  assert.ok(s.per_item[0].restore_sql.startsWith("UPDATE item_forward_events SET obligation_text ="));
  assert.equal(s.read_back.retexted_total, 1);
  assert.deepEqual(s.read_back.not_confirmed_ids, []);
});

test("main apply: 0 targets writes nothing and says so", async () => {
  const deps = fakeDeps({
    itemsById: {
      "item-1": {
        // Terminal period required (lane FWD-TEXT-2): see comment on the identically-shaped
        // fixture above -- an unterminated window no longer round-trips unchanged.
        existingRows: [
          { id: "row-1", event_date: "2030-09-01", event_kind: "compliance_deadline", obligation_text: "By 1 September 2030, Member States shall inform the Commission of the application of this Regulation.", source_kind: "claim", source_claim_id: "c1", source_section_id: null },
        ],
        claimRows: [{ id: "c1", claim_kind: "FACT", claim_text: "By 1 September 2030, Member States shall inform the Commission of the application of this Regulation.", source_span: "By 1 September 2030, Member States shall inform the Commission of the application of this Regulation." }],
      },
    },
  });
  const s = await main({ mode: "apply" }, deps);
  assert.equal(s.counts.retext_target_total, 0);
  assert.equal(deps.updates.length, 0);
  assert.match(s.note2, /nothing to rewrite/);
});

test("main --arg ids: scopes the sweep to named items only", async () => {
  const deps = fakeDeps({
    itemsById: {
      "item-1": { existingRows: [], sectionRows: [] },
      "item-2": { existingRows: [], sectionRows: [] },
    },
  });
  const s = await main({ mode: "dry", arg: "ids:item-1" }, deps);
  assert.equal(s.counts.items_scanned, 1);
});

test("main restore: refuses with no ids; reports missing ids it cannot find a snapshot for", async () => {
  const deps = fakeDeps({ itemsById: {} });
  const s1 = await main({ mode: "dry", arg: "restore:" }, deps);
  assert.equal(s1.exitCode, 1);
  assert.match(s1.note, /usage: --arg restore:/);

  const s2 = await main({ mode: "dry", arg: "restore:row-x" }, deps);
  assert.equal(s2.exitCode, 1);
  assert.deepEqual(s2.missing_ids, ["row-x"]);
});

test("main restore: apply replays the matched snapshot's prior obligation_text", async () => {
  const citeMarker = "MAINT forward-events-retext dispatch (Lane FWD-TEXT, 2026-09-04)";
  const deps = fakeDeps({ itemsById: {} });
  deps.readSnapshotEntries = async () => [
    { table: "item_forward_events", prior: { id: "row-1", obligation_text: "old text" }, _cite: { reason: citeMarker } },
  ];
  const restored = [];
  deps.restoreOne = async (id, text) => { restored.push({ id, text }); return { updated: 1 }; };
  const s = await main({ mode: "apply", arg: "restore:row-1" }, deps);
  assert.equal(s.exitCode, 0);
  assert.deepEqual(restored, [{ id: "row-1", text: "old text" }]);
});
