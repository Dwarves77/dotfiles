import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mapClaimRows,
  mapSectionRows,
  forwardEventIdentityKey,
  classifyDefects,
  classifyAfterResidue,
  planItemRetext,
  buildRestoreSql,
  pgMd5,
  postRewriteKey,
  compareForSurvivor,
  planCollisions,
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

// ── collision resolution (lane RETEXT-COLLIDE, 2026-09-04) ─────────────────────────────────────────────

test("pgMd5: matches Postgres' md5(text) -- UTF-8 bytes, lowercase hex", () => {
  // Cross-checked against Postgres' own md5('') = 'd41d8cd98f00b204e9800998ecf8427e' and md5('abc') =
  // '900150983cd24fb0d6963f7d28e17f72' (both well-known, stable md5 test vectors).
  assert.equal(pgMd5(""), "d41d8cd98f00b204e9800998ecf8427e");
  assert.equal(pgMd5("abc"), "900150983cd24fb0d6963f7d28e17f72");
  // Unicode: hashed as UTF-8 bytes (5 bytes for "café", not 4 chars), same as Postgres text storage.
  assert.equal(pgMd5("café"), "07117fe4a1ebd544965dc19573183da2");
});

test("postRewriteKey: mirrors uq_item_forward_events_dedupe's own column order and coalesce", () => {
  const claimSourced = postRewriteKey({
    intelligence_item_id: "item-1", event_date: "2026-11-29", event_kind: "phase_step",
    after_text: "text A", source_claim_id: "claim-1", source_section_id: null,
  });
  assert.equal(claimSourced, `item-1|2026-11-29|phase_step|${pgMd5("text A")}|claim-1`);
  const sectionSourced = postRewriteKey({
    intelligence_item_id: "item-1", event_date: "2026-11-29", event_kind: "phase_step",
    after_text: "text A", source_claim_id: null, source_section_id: "section-1",
  });
  assert.equal(sectionSourced, `item-1|2026-11-29|phase_step|${pgMd5("text A")}|section-1`);
  // Different after_text -> different key even with everything else identical (the whole point: two rows
  // sharing a source object only collide once their TEXT also converges).
  assert.notEqual(
    postRewriteKey({ intelligence_item_id: "i", event_date: "d", event_kind: "k", after_text: "x", source_claim_id: "c" }),
    postRewriteKey({ intelligence_item_id: "i", event_date: "d", event_kind: "k", after_text: "y", source_claim_id: "c" }),
  );
});

test("compareForSurvivor: already-normalized row wins regardless of created_at/id; otherwise earliest created_at, then lowest id", () => {
  const normalized = { id: "z", obligation_text: "clean", after_text: "clean", created_at: "2026-09-04T09:00:00Z" };
  const stale = { id: "a", obligation_text: "garbled", after_text: "clean", created_at: "2026-01-01T00:00:00Z" };
  assert.equal(compareForSurvivor(normalized, stale), -1, "normalized-but-later/higher-id still wins");
  assert.equal(compareForSurvivor(stale, normalized), 1);

  const earlier = { id: "b", obligation_text: "g1", after_text: "clean", created_at: "2026-01-01T00:00:00Z" };
  const later = { id: "a", obligation_text: "g2", after_text: "clean", created_at: "2026-02-01T00:00:00Z" };
  assert.ok(compareForSurvivor(earlier, later) < 0, "earliest created_at wins when neither is normalized");

  const lowId = { id: "a", obligation_text: "g1", after_text: "clean", created_at: "same" };
  const highId = { id: "b", obligation_text: "g2", after_text: "clean", created_at: "same" };
  assert.ok(compareForSurvivor(lowId, highId) < 0, "lowest id wins on a full tie");
});

test("planCollisions: two retext-target rows sharing one source converge to the SAME after text (the year-appears-twice case) -- one survivor, one collide_delete", () => {
  const rows = [
    {
      id: "row-a", intelligence_item_id: "item-1", event_date: "2025-01-01", event_kind: "other",
      obligation_text: "garbled fragment one", after_text: "Targets will ensure that the greenhouse gas intensity of fuels used in the sector will gradually decrease.",
      source_kind: "section", source_claim_id: null, source_section_id: "section-9", created_at: "2026-09-01T00:00:00Z",
    },
    {
      id: "row-b", intelligence_item_id: "item-1", event_date: "2025-01-01", event_kind: "other",
      obligation_text: "garbled fragment two", after_text: "Targets will ensure that the greenhouse gas intensity of fuels used in the sector will gradually decrease.",
      source_kind: "section", source_claim_id: null, source_section_id: "section-9", created_at: "2026-09-01T00:00:01Z",
    },
  ];
  const { groups, survivorIds, deletions } = planCollisions(rows);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].survivor_id, "row-a", "earlier created_at wins -- neither row is already normalized");
  assert.deepEqual(groups[0].deleted_ids, ["row-b"]);
  assert.deepEqual(survivorIds, ["row-a"]);
  assert.equal(deletions.length, 1);
  assert.equal(deletions[0].id, "row-b");
  assert.equal(deletions[0].collides_with_survivor_id, "row-a");
  assert.equal(deletions[0].obligation_text, "garbled fragment two", "full row JSON, not just the id");
});

test("planCollisions: a retext target colliding with an UNTOUCHED row sharing the same source -- the already-normalized row survives even though it is not the earliest/lowest-id", () => {
  const rows = [
    {
      // Untouched: no fresh event matched it (or it already equals fresh), so after_text === obligation_text.
      id: "row-clean", intelligence_item_id: "item-1", event_date: "2026-11-29", event_kind: "phase_step",
      obligation_text: "It shall apply from 29 November 2026.", after_text: "It shall apply from 29 November 2026.",
      source_kind: "section", source_claim_id: null, source_section_id: "section-9", created_at: "2026-09-04T00:00:00Z",
    },
    {
      // Retext target: still garbled today, but the fresh text is the SAME sentence as row-clean above
      // (same shared source, same date/kind -- exactly the shape migration 275 allows pre-fix).
      id: "row-garbled", intelligence_item_id: "item-1", event_date: "2026-11-29", event_kind: "phase_step",
      obligation_text: "7/oj/eng **...** It shall apply from 29 November 2026.", after_text: "It shall apply from 29 November 2026.",
      source_kind: "section", source_claim_id: null, source_section_id: "section-9", created_at: "2026-01-01T00:00:00Z",
    },
  ];
  const { groups, deletions } = planCollisions(rows);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].survivor_id, "row-clean", "already-normalized row wins despite the later created_at");
  assert.deepEqual(groups[0].deleted_ids, ["row-garbled"]);
  assert.equal(deletions[0].id, "row-garbled");
});

test("planCollisions: a HALF-APPLIED table -- one row already rewritten to the target text by a prior run, its collision partner still garbled -- resolves the same way as a fresh run", () => {
  const rows = [
    {
      // Already rewritten (by a prior, partially-failed apply): its own obligation_text now EQUALS the
      // fresh after_text, so it reads as "untouched" (not a retext target) even though it started garbled.
      id: "row-already-fixed", intelligence_item_id: "item-1", event_date: "2026-11-29", event_kind: "phase_step",
      obligation_text: "It shall apply from 29 November 2026.", after_text: "It shall apply from 29 November 2026.",
      source_kind: "section", source_claim_id: null, source_section_id: "section-9", created_at: "2026-01-01T00:00:00Z",
    },
    {
      // Never reached before the run died -- still garbled, still needs the rewrite.
      id: "row-still-garbled", intelligence_item_id: "item-1", event_date: "2026-11-29", event_kind: "phase_step",
      obligation_text: "hicles | It shall apply from 29 November 2026.", after_text: "It shall apply from 29 November 2026.",
      source_kind: "section", source_claim_id: null, source_section_id: "section-9", created_at: "2026-01-01T00:00:01Z",
    },
  ];
  const { groups, deletions, survivorIds } = planCollisions(rows);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].survivor_id, "row-already-fixed");
  assert.deepEqual(survivorIds, ["row-already-fixed"]);
  assert.deepEqual(deletions.map((d) => d.id), ["row-still-garbled"]);
});

test("planCollisions: no collision reported when only one row exists per key, or when converged text differs", () => {
  assert.deepEqual(planCollisions([]), { groups: [], survivorIds: [], deletions: [] });
  const singleRow = [{ id: "a", intelligence_item_id: "i", event_date: "d", event_kind: "k", obligation_text: "x", after_text: "x", source_claim_id: "c" }];
  assert.equal(planCollisions(singleRow).groups.length, 0);
  const distinctAfter = [
    { id: "a", intelligence_item_id: "i", event_date: "d", event_kind: "k", obligation_text: "x", after_text: "one obligation", source_claim_id: "c" },
    { id: "b", intelligence_item_id: "i", event_date: "d", event_kind: "k", obligation_text: "y", after_text: "a totally different obligation", source_claim_id: "c" },
  ];
  assert.equal(planCollisions(distinctAfter).groups.length, 0, "same source/date/kind but genuinely distinct obligations (the NZIA case migration 275 preserves) never collide");
});

// ── main() end-to-end over fake deps ────────────────────────────────────────────────────────────────────

// A fake live table (id -> row), seeded from itemsById's existingRows, mutated by update/delete/restore
// exactly the way the real guarded db.mjs helpers would -- so readRowsByIds / a no-longer-existing id /
// a restored row all behave the same as a real dry-then-apply-then-restore sequence against Supabase would.
function fakeDeps({ itemsById = {} } = {}) {
  const table = new Map();
  for (const [itemId, def] of Object.entries(itemsById)) {
    for (const row of def.existingRows ?? []) table.set(row.id, { ...row, intelligence_item_id: itemId });
  }
  const updates = [];
  const deletes = [];
  const inserts = [];
  const poolReadCalls = []; // lane FE-SLOT-2b, 2026-09-04: which item ids readPoolForItem was actually
  // invoked for -- so a test can assert it was SKIPPED for an item with no context-needing claim.
  return {
    itemIds: Object.keys(itemsById),
    updates,
    deletes,
    inserts,
    table,
    poolReadCalls,
    readItemIdsWithForwardEvents: async () => Object.keys(itemsById),
    readForwardEventsForItem: async (id) => itemsById[id].existingRows,
    readClaimsForItem: async (id) => itemsById[id].claimRows ?? [],
    readSectionsForItem: async (id) => itemsById[id].sectionRows ?? [],
    // lane FE-SLOT-2, 2026-09-04: due_date slot context source pool -- defaults to [] for every existing
    // fixture (none of them carry a due_date slot claim, so attachDueDateContext is a no-op on them).
    // lane FE-SLOT-2b, 2026-09-04: main() now calls this ONLY when at least one of the item's claims
    // needs context (claimNeedsDueDateContext) -- poolReadCalls records every id it actually WAS called
    // for, so a test can assert the skip.
    readPoolForItem: async (id) => {
      poolReadCalls.push(id);
      return itemsById[id]?.poolRows ?? [];
    },
    updateObligationText: async (id, text) => {
      if (!table.has(id)) return { updated: 0, rows: [] }; // tolerant: row no longer exists (deleted/already applied)
      table.get(id).obligation_text = text;
      updates.push({ id, text });
      return { updated: 1, rows: [{ id, obligation_text: text }] };
    },
    deleteForwardEvents: async (ids) => {
      const removed = [];
      for (const id of ids) {
        if (table.has(id)) {
          removed.push(table.get(id));
          table.delete(id);
        }
      }
      deletes.push(...ids);
      return { deleted: removed.length, snapshot: "fake-snapshot_item_forward_events.jsonl", rows: removed.map((r) => ({ id: r.id })) };
    },
    readRowsByIds: async (ids) => ids.filter((id) => table.has(id)).map((id) => ({ id, obligation_text: table.get(id).obligation_text })),
    readSnapshotEntries: async () => [],
    restoreOne: async () => ({ updated: 1 }),
    restoreDeletedRow: async (row) => {
      inserts.push(row);
      table.set(row.id, { ...row });
      return { inserted: row, snapshot: "fake-snapshot_item_forward_events.jsonl" };
    },
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

// ── main() collision resolution end-to-end (lane RETEXT-COLLIDE, 2026-09-04) ───────────────────────────
// The Maintenance #35 shape: two EXISTING rows sharing one source_section_id, same event_date/event_kind
// (legitimately coexisting pre-fix because their obligation_text differs), both matching the SAME single
// fresh event under forwardEventIdentityKey -- so both become retext targets with the IDENTICAL `after`
// text, which is exactly what the live uq_item_forward_events_dedupe index would then reject.

function collidingItemFixture() {
  return {
    "item-1": {
      existingRows: [
        {
          id: "row-early", event_date: "2026-11-29", event_kind: "phase_step",
          obligation_text: "7/oj/eng **Primary headline compliance deadline — FACT:** \"It shall apply from 29 November 2026 for new types of vehicles of categories M₁ and N₁ and components, systems and separate technical units intended for vehicles of categories M₁ or N₁ type-approv",
          source_kind: "section", source_claim_id: null, source_section_id: "s1",
          created_at: "2026-09-04T09:00:00.000Z",
        },
        {
          id: "row-late", event_date: "2026-11-29", event_kind: "phase_step",
          obligation_text: "hicles (M₂, M₃, N₂, N₃) | MONITORING **FACT — deadline:** \"It shall apply from 29 November 2026 for new types of vehicles of categories M₁ and N₁ and components, systems and separate technical units intended for vehicles of categories M₁ or N₁ type-approv",
          source_kind: "section", source_claim_id: null, source_section_id: "s1",
          created_at: "2026-09-04T09:00:01.000Z",
        },
      ],
      sectionRows: [{ id: "s1", section_key: "2", content_md: EURO7_PHASE_SECTION_MD }],
    },
  };
}

test("main dry: collision -- two rows sharing one source that would converge to the same after-text are reported, deleted nothing yet", async () => {
  const deps = fakeDeps({ itemsById: collidingItemFixture() });
  const s = await main({ mode: "dry" }, deps);
  assert.equal(s.counts.retext_target_total, 2, "both rows are independently retext targets");
  assert.equal(s.counts.collision_group_total, 1);
  assert.equal(s.counts.collision_delete_total, 1);
  assert.equal(s.collisions.groups.length, 1);
  assert.equal(s.collisions.groups[0].survivor_id, "row-early", "earliest created_at wins -- neither row is pre-normalized");
  assert.deepEqual(s.collisions.deletions.map((d) => d.id), ["row-late"]);
  assert.equal(s.collisions.deletions[0].intelligence_item_id, "item-1", "full row JSON, not just an id");
  assert.equal(deps.deletes.length, 0, "dry mode deletes nothing");
  assert.equal(deps.updates.length, 0, "dry mode writes nothing");
});

test("main apply: collision resolution deletes the loser BEFORE rewriting the survivor, and the rewrite loop skips the deleted id entirely", async () => {
  const deps = fakeDeps({ itemsById: collidingItemFixture() });
  const s = await main({ mode: "apply" }, deps);
  assert.equal(s.exitCode, 0);

  // The delete happened (guardedDelete, chunked) -- confirmed both by deps.deletes and by the table itself.
  assert.deepEqual(deps.deletes, ["row-late"]);
  assert.equal(deps.table.has("row-late"), false);
  assert.equal(s.collisions.deleted.deleted, 1);
  assert.equal(s.collisions.read_back.deleted_total, 1);
  assert.deepEqual(s.collisions.read_back.still_present_ids, []);

  // The rewrite pass never even attempted the deleted row -- it was filtered out of targetsToApply, not
  // sent to updateObligationText and silently no-op'd.
  assert.deepEqual(deps.updates.map((u) => u.id), ["row-early"]);
  assert.equal(s.applied, 1);
  assert.equal(s.per_item.length, 1);
  assert.equal(s.per_item[0].id, "row-early");
  assert.equal(s.counts.no_op_total, 0);

  // Final state: exactly one row left, carrying the honest text, and it no longer collides with anything.
  assert.equal(deps.table.size, 1);
  const survivor = deps.table.get("row-early");
  assert.ok(!survivor.obligation_text.startsWith("7/oj/eng"));
  assert.equal(s.read_back.retexted_total, 1);
  assert.deepEqual(s.read_back.not_confirmed_ids, []);
});

test("main apply: HALF-APPLIED table -- one collision side already carries the target text from a prior partial run; this run deletes the still-garbled loser and rewrites nothing (no_op-free, since the survivor was never a target)", async () => {
  const fixture = collidingItemFixture();
  // Simulate a prior run that already rewrote row-early to the fresh text before dying. It now reads back
  // as "untouched" (fresh.obligation_text === row.obligation_text), so it is NOT a retext target this run --
  // exactly the half-applied shape the live 6-second failure left behind.
  // Exact literal output of extractForwardEvents({claims:[], sections:[{...EURO7_PHASE_SECTION_MD}]}) --
  // computed once and pinned here, not re-derived, so this fixture fails loudly if the extractor's output
  // shape ever changes (a leading quote character is fine, per classifyAfterResidue; the trailing "…" is
  // the honest-fragment marker for a window truncated by DEFAULT_MAX_BEFORE).
  const alreadyFixedText =
    "\"It shall apply from 29 November 2026 for new types of vehicles of categories M₁ and N₁ and " +
    "components, systems and separate technical units intended for vehicles of categories M₁ or N₁ " +
    "type-approv…";
  fixture["item-1"].existingRows[0].obligation_text = alreadyFixedText;

  const deps = fakeDeps({ itemsById: fixture });
  const s = await main({ mode: "apply" }, deps);
  assert.equal(s.exitCode, 0);
  assert.equal(s.counts.retext_target_total, 1, "only row-late is still stale");
  assert.equal(s.counts.collision_group_total, 1, "row-early (untouched, already normalized) still collides with row-late's planned after-text");
  assert.deepEqual(deps.deletes, ["row-late"]);
  assert.equal(deps.updates.length, 0, "row-early needed no rewrite; row-late was deleted, never rewritten");
  assert.equal(deps.table.size, 1);
  assert.ok(deps.table.has("row-early"));
});

test("main restore: apply reinserts a collide_delete'd row VERBATIM (same id) from guardedDelete's full-row snapshot", async () => {
  const citeMarker = "MAINT forward-events-retext dispatch (Lane FWD-TEXT, 2026-09-04)";
  const fullRow = {
    id: "row-late", intelligence_item_id: "item-1", event_date: "2026-11-29", date_precision: "day",
    event_kind: "phase_step", obligation_text: "hicles (M₂, M₃) | MONITORING **FACT — deadline:** ...",
    source_kind: "section", source_claim_id: null, source_section_id: "s1",
    source_span: "It shall apply from 29 November 2026", confidence: "medium",
    extractor_version: "fe1-2026-09-04.2", created_at: "2026-09-04T09:00:01.000Z",
  };
  const deps = fakeDeps({ itemsById: {} });
  deps.readSnapshotEntries = async () => [
    { table: "item_forward_events", prior: fullRow, _cite: { reason: `${citeMarker}, collision resolution (lane RETEXT-COLLIDE)` } },
  ];
  const s = await main({ mode: "apply", arg: "restore:row-late" }, deps);
  assert.equal(s.exitCode, 0);
  assert.equal(deps.inserts.length, 1);
  assert.deepEqual(deps.inserts[0], fullRow, "reinserted verbatim, same id, every column");
  assert.deepEqual(s.read_back.restored_ids, ["row-late"]);
});

test("main restore: dry plan distinguishes a reinsert (full row) from a text-only update, without applying either", async () => {
  const citeMarker = "MAINT forward-events-retext dispatch (Lane FWD-TEXT, 2026-09-04)";
  const deps = fakeDeps({ itemsById: {} });
  deps.readSnapshotEntries = async () => [
    { table: "item_forward_events", prior: { id: "row-updated", obligation_text: "old text" }, _cite: { reason: citeMarker } },
    { table: "item_forward_events", prior: { id: "row-deleted", intelligence_item_id: "item-1", event_date: "2026-11-29", obligation_text: "old text 2" }, _cite: { reason: citeMarker } },
  ];
  const s = await main({ mode: "dry", arg: "restore:row-updated,row-deleted" }, deps);
  assert.equal(s.exitCode, 0);
  const byId = Object.fromEntries(s.plan.map((p) => [p.id, p]));
  assert.equal(byId["row-updated"].action, "update_text");
  assert.equal(byId["row-deleted"].action, "reinsert");
  assert.equal(deps.inserts.length, 0, "dry restore applies nothing");
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

// ---------------------------------------------------------------------------
// classifyAfterResidue: contains_record_facts_wrapper — lane FWD-TEXT-3, 2026-09-04. Extends the dry
// report's existing "prove the fix against itself on every future run" role (the honest_fragment_marked/
// contains_star/etc. classes above, from FWD-TEXT-2) to the record-facts template-leak defect this lane
// fixes in extract-forward-events.mjs's own clauseStart/clauseAround/unwrapRecordFactsTemplate. Checked
// independently of that module -- a future regression there still shows up here even if this file's own
// planItemRetext-level test below is skipped (no live fixture in this checkout).
// ---------------------------------------------------------------------------

test("classifyAfterResidue: a fresh text still carrying a record-facts wrapper token is flagged, never silently 'clean'", () => {
  const examples = [
    '[due_date] The captured source states a due date (date_precision: day), verbatim: «by 31 December 2020»',
    "A full-brief regrounding will re-examine this gap when this item upgrades from record to brief. [primary_deadline] The captured source states, verbatim: «By 30 April 2022»",
    "…source's own applicability language places this item at «direct_duty» (Your duty), from the passage: «the operator shall submit»",
  ];
  for (const text of examples) {
    assert.ok(
      classifyAfterResidue(text).includes("contains_record_facts_wrapper"),
      `expected contains_record_facts_wrapper for: ${JSON.stringify(text)}`
    );
  }
});

test("classifyAfterResidue: a genuinely clean, already-unwrapped passage is NOT flagged", () => {
  // Ends in the honest-fragment ellipsis (the source span itself was truncated by record-facts.mjs's own
  // capture window) -- classified "honest_fragment_marked", never "contains_record_facts_wrapper" or any
  // other defect class.
  const clean = "By 30 April 2022 and in each subsequent year, the Secretary of State must publish a li…";
  assert.deepEqual(classifyAfterResidue(clean), ["honest_fragment_marked"]);
});

test("classifyAfterResidue: a normal (non-record-facts) obligation_text mentioning 'source' in ordinary prose is not flagged (no false positive on the word alone)", () => {
  const ordinary = "The competent authority shall confirm receipt of the notification by 1 January 2028.";
  assert.deepEqual(classifyAfterResidue(ordinary), ["clean"]);
});

// ---------------------------------------------------------------------------
// planItemRetext: end-to-end over a real record-facts section (lane FWD-TEXT-3) — proves the retext step's
// own dry-run wiring picks up the extractor fix with NO change to this file's rewrite logic: planItemRetext
// calls the imported (unmodified-by-this-lane) extractForwardEvents, whose internals now unwrap the
// template; classifyAfterResidue (this file's own function, extended above) then reports the after text as
// clean. Verbatim content_md from the same live row extract-forward-events.test.mjs's "example 2" uses (see
// that file's own header for the SQL) — one item, one retext target.
// ---------------------------------------------------------------------------

test("planItemRetext: a record-facts-template residue row is retexted to the unwrapped passage, and after_defect_classes reports it clean", () => {
  const sectionMd =
    "[effective_date] No verbatim effective date statement was located in the captured source text for this record-grade item. A full-brief regrounding will re-examine this gap when this item upgrades from record to brief.\n" +
    "[jurisdictional_scope] The captured source states, verbatim: «Member States” substitute “the United Kingdom”»\n" +
    "[penalty_summary] No verbatim penalty summary statement was located in the captured source text for this record-grade item. A full-brief regrounding will re-examine this gap when this item upgrades from record to brief.\n" +
    "[primary_deadline] The captured source states, verbatim: «By 30 April 2022 and in each subsequent year, the Secretary of State must publish a li»\n" +
    "[binding_position] No verbatim applicability language naming a duty-holder class was located in the captured source text for this record-grade item. A full-brief regrounding will re-examine this gap when this item upgrades from record to brief.\n" +
    "[due_date] The captured source states a due date (date_precision: day), verbatim: «By 30 April 2022 and in each subsequent year, the Secretary of State must publish a li»";

  const existingRows = [
    {
      id: "row-residue-1",
      event_date: "2022-04-30",
      event_kind: "compliance_deadline",
      source_kind: "section",
      source_claim_id: null,
      source_section_id: "sec-1",
      obligation_text:
        "A full-brief regrounding will re-examine this gap when this item upgrades from record to brief. [primary_deadline] The captured source states, verbatim: «By 30 April 2022 and in each subsequent year, the Secretary of State must publish a li» [binding_position] No verbatim applicability language naming a duty-holder class was loc…",
    },
  ];

  const { retextTargets } = planItemRetext({
    itemId: "item-record-facts-1",
    existingRows,
    claims: [],
    sections: [{ section_id: "sec-1", key: "record_facts", md: sectionMd }],
  });

  assert.equal(retextTargets.length, 1);
  const target = retextTargets[0];
  assert.equal(target.after, "By 30 April 2022 and in each subsequent year, the Secretary of State must publish a li…");
  assert.ok(!target.after.includes("A full-brief regrounding"));
  // Trailing "…" only (record-facts.mjs's own capture window truncated the source span) -- honest_fragment_
  // marked, never contains_record_facts_wrapper/bad_leading_char/anything else.
  assert.deepEqual(target.after_defect_classes, ["honest_fragment_marked"]);
});

// ---------------------------------------------------------------------------
// main(): the pool read is per-item conditional (lane FE-SLOT-2b, 2026-09-04) — deps.readPoolForItem is
// called ONLY for an item carrying a claim claimNeedsDueDateContext says would actually consult it. See
// this file's own header, "POOL READ IS PER-ITEM CONDITIONAL".
// ---------------------------------------------------------------------------

test("main: readPoolForItem is NOT called for an item with no due_date claims at all", async () => {
  const deps = fakeDeps({
    itemsById: {
      "item-1": {
        existingRows: [],
        claimRows: [{ id: "c1", claim_kind: "FACT", claim_text: "[title] ordinary claim", source_span: "x" }],
        sectionRows: [],
      },
    },
  });
  await main({ mode: "dry" }, deps);
  assert.deepEqual(deps.poolReadCalls, []);
});

test("main: readPoolForItem is NOT called for an item whose due_date claim is a relative deadline (no calendar date)", async () => {
  const deps = fakeDeps({
    itemsById: {
      "item-1": {
        existingRows: [],
        claimRows: [
          {
            id: "c1",
            claim_kind: "FACT",
            claim_text: "[due_date] The captured source states a due date, verbatim: «within 15 days of the effective date of disapproval»",
            source_span: "within 15 days of the effective date of disapproval",
          },
        ],
        sectionRows: [],
      },
    },
  });
  await main({ mode: "dry" }, deps);
  assert.deepEqual(deps.poolReadCalls, []);
});

test("main: readPoolForItem IS called for an item whose due_date claim needs context, never for a sibling item that doesn't", async () => {
  const deps = fakeDeps({
    itemsById: {
      "item-needs": {
        existingRows: [],
        claimRows: [
          {
            id: "c1",
            claim_kind: "FACT",
            claim_text: "[due_date] The captured source states a due date, verbatim: «by 1 May 2021, notify the Commission of those rules»",
            source_span: "by 1 May 2021, notify the Commission of those rules",
          },
        ],
        sectionRows: [],
        poolRows: [
          {
            id: "search-1",
            result_content: "x".repeat(210) + " the operator shall by 1 May 2021, notify the Commission of those rules without delay",
            result_index: 0,
          },
        ],
      },
      "item-no-need": {
        existingRows: [],
        claimRows: [{ id: "c2", claim_kind: "FACT", claim_text: "[title] ordinary claim", source_span: "x" }],
        sectionRows: [],
      },
    },
  });
  await main({ mode: "dry" }, deps);
  assert.deepEqual(deps.poolReadCalls, ["item-needs"]);
});
