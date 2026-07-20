// @ts-check
// PROOF (census-writer). The intake-census WRITE seam persists a dispositioned document's census verdict
// to census_worklist (migration 221). What this asserts:
//   1. censusDisposition maps every consume disposition to the census enum (or null for inconclusive).
//   2. buildCensusRow honors the DB CHECKs: hold REQUIRES hold_reason; enumeration_status is a valid
//      forward value; surface_tags + cap_hit + shape_class carried; dryrun_disposition is the enum value.
//   3. writeCensusRows upserts on (source_id, document_url) under a per-source lease; a skipped/no-url
//      outcome is NOT written (counted as skipped); a lease held by the other lane is a REFUSAL (no write,
//      leaseError set); a real DB error is NOT swallowed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { censusDisposition, buildCensusRow, isCensusWritable, writeCensusRows } = await jiti.import("./census-writer.mjs");

const OUT = (over) => ({ ledgerId: "l1", url: "https://x/doc", disposition: "would_mint", reason: "dry: minted", itemType: "regulation", surfaceTags: ["regulations"], ...over });

// ── 1. disposition map ────────────────────────────────────────────────────────────────────────────────
test("censusDisposition: maps every consume disposition to the census enum (or null)", () => {
  assert.equal(censusDisposition(OUT({ disposition: "would_mint" })), "would_mint");
  assert.equal(censusDisposition(OUT({ disposition: "promoted" })), "would_mint");
  assert.equal(censusDisposition(OUT({ disposition: "exists" })), "dedup_hit");
  assert.equal(censusDisposition(OUT({ disposition: "would_reject", reason: "chokepoint:congruence_1a — retyped" })), "congruence_reject");
  assert.equal(censusDisposition(OUT({ disposition: "rejected", reason: "chokepoint:unsourced — no source_id" })), "invariant_reject");
  assert.equal(censusDisposition(OUT({ disposition: "would_reject", reason: "chokepoint:duplicate — dedup: subject already exists as abc(reg_number)" })), "dedup_hit",
    "a dedup rejection means the document IS held — census-wise that is coverage confirmed, not a gate reject");
  assert.equal(censusDisposition(OUT({ disposition: "not_an_item", reason: "entity-gate: portal" })), "hold");
  assert.equal(censusDisposition(OUT({ disposition: "skipped", reason: "classify failed" })), null);
});

test("isCensusWritable: true for a dispositioned outcome, false for skipped", () => {
  assert.equal(isCensusWritable(OUT({ disposition: "would_mint" })), true);
  assert.equal(isCensusWritable(OUT({ disposition: "skipped" })), false);
});

// ── 2. row build honors the DB CHECKs ──────────────────────────────────────────────────────────────────
test("buildCensusRow: would_mint → dry_run_complete, surface_tags + cap_hit + shape_class carried", () => {
  const row = buildCensusRow(OUT({ surfaceTags: ["regulations", "market_intel"] }),
    { sourceId: "s1", lane: "A", createdBy: "session-A", capHit: true, shapeClass: "index_page", nowIso: "2026-07-19T00:00:00Z" });
  assert.equal(row.source_id, "s1");
  assert.equal(row.document_url, "https://x/doc");
  assert.equal(row.lane, "A");
  assert.equal(row.dryrun_disposition, "would_mint");
  assert.equal(row.enumeration_status, "dry_run_complete");
  assert.deepEqual(row.surface_tags, ["regulations", "market_intel"]);
  assert.equal(row.cap_hit, true);
  assert.equal(row.shape_class, "index_page");
  assert.equal(row.hold_reason, undefined, "only a hold carries hold_reason");
});

test("buildCensusRow: not_an_item → hold WITH hold_reason (DB CHECK) + enumeration_status classified", () => {
  const row = buildCensusRow(OUT({ disposition: "not_an_item", reason: "entity-gate: portal — institution landing", surfaceTags: [] }),
    { sourceId: "s1", lane: "A", createdBy: "session-A", nowIso: "2026-07-19T00:00:00Z" });
  assert.equal(row.dryrun_disposition, "hold");
  assert.ok(row.hold_reason, "a hold row MUST carry hold_reason or the DB CHECK rejects it");
  assert.match(row.hold_reason, /entity-gate: portal/);
  assert.equal(row.enumeration_status, "classified", "a portal was classified, never dry-run'd");
  assert.deepEqual(row.surface_tags, []);
});

// ── 3. writeCensusRows: upsert under lease, skip non-writable, refuse on held lease, rethrow DB error ────
function fakeSb({ upsertError = null, upsertCount = null, existingRows = [], existingErr = null } = {}) {
  const upserts = [];
  const selects = [];
  return {
    upserts,
    selects,
    from(table) {
      return {
        upsert(rows, opts) { upserts.push({ table, rows, opts }); return Promise.resolve({ error: upsertError, count: upsertCount ?? rows.length }); },
        select(cols) {
          return {
            eq(col, val) {
              return {
                in(inCol, vals) {
                  selects.push({ table, cols, eq: { col, val }, in: { inCol, vals } });
                  return Promise.resolve({ data: existingRows, error: existingErr });
                },
              };
            },
          };
        },
      };
    },
  };
}
// withLease fake: runs fn (acquired) unless heldBy is set, in which case it THROWS like the real one.
const fakeWithLease = (heldBy = null) => async (sb, key, holder, lane, fn) => {
  if (heldBy) { const e = new Error(`LEASE HELD by ${heldBy}`); e.leaseHeldBy = heldBy; throw e; }
  return fn();
};

test("writeCensusRows: upserts writable rows on (source_id, document_url) under the lease", async () => {
  const sb = fakeSb();
  const r = await writeCensusRows(sb, [OUT({ url: "https://x/a" }), OUT({ url: "https://x/b", disposition: "exists" })],
    { sourceId: "s1", lane: "A", createdBy: "session-A", withLease: fakeWithLease(), nowIso: "2026-07-19T00:00:00Z" });
  assert.equal(r.written, 2);
  assert.equal(r.skipped, 0);
  assert.equal(r.leaseError, null);
  assert.equal(sb.upserts.length, 1);
  assert.equal(sb.upserts[0].table, "census_worklist");
  assert.equal(sb.upserts[0].opts.onConflict, "source_id,document_url");
  assert.equal(sb.upserts[0].rows.length, 2);
});

test("writeCensusRows: a skipped outcome and a url-less outcome are NOT written (counted skipped)", async () => {
  const sb = fakeSb();
  const r = await writeCensusRows(sb, [OUT({ url: "https://x/a" }), OUT({ disposition: "skipped" }), OUT({ url: "" })],
    { sourceId: "s1", lane: "A", createdBy: "session-A", withLease: fakeWithLease() });
  assert.equal(r.written, 1);
  assert.equal(r.skipped, 2);
  assert.equal(sb.upserts[0].rows.length, 1, "only the one dispositioned+url'd outcome is upserted");
});

test("writeCensusRows: lease held by the other lane → REFUSAL (no write, leaseError set)", async () => {
  const sb = fakeSb();
  const r = await writeCensusRows(sb, [OUT()],
    { sourceId: "s1", lane: "A", createdBy: "session-A", withLease: fakeWithLease("session-C") });
  assert.equal(r.written, 0);
  assert.match(r.leaseError, /LEASE HELD by session-C/);
  assert.equal(sb.upserts.length, 0, "a held lease means we NEVER clobber the other lane's rows");
});

test("writeCensusRows: a real upsert DB error is NOT swallowed (rethrows)", async () => {
  const sb = fakeSb({ upsertError: { message: "check constraint violated" } });
  await assert.rejects(
    () => writeCensusRows(sb, [OUT()], { sourceId: "s1", lane: "A", createdBy: "session-A", withLease: fakeWithLease() }),
    /census_worklist upsert failed: check constraint violated/,
  );
});

test("writeCensusRows: a URL already owned by a different lane/created_by keeps its ORIGINAL identity on re-upsert (immutable-after-insert, migration 221 trigger)", async () => {
  const sb = fakeSb({ existingRows: [{ document_url: "https://x/a", lane: "C", created_by: "earlier-smoke-test" }] });
  const r = await writeCensusRows(sb, [OUT({ url: "https://x/a" })],
    { sourceId: "s1", lane: "A", createdBy: "session-A-census", withLease: fakeWithLease() });
  assert.equal(r.written, 1);
  assert.equal(sb.selects.length, 1, "looks up existing identity for this batch's URLs before upserting");
  assert.equal(sb.selects[0].eq.val, "s1");
  assert.deepEqual(sb.selects[0].in.vals, ["https://x/a"]);
  const row = sb.upserts[0].rows[0];
  assert.equal(row.lane, "C", "keeps the URL's ORIGINAL lane, not the current caller's");
  assert.equal(row.created_by, "earlier-smoke-test", "keeps the URL's ORIGINAL created_by, not the current caller's");
});

test("writeCensusRows: a genuinely NEW url gets the CURRENT caller's identity (no existing row to preserve)", async () => {
  const sb = fakeSb({ existingRows: [] });
  const r = await writeCensusRows(sb, [OUT({ url: "https://x/new" })],
    { sourceId: "s1", lane: "A", createdBy: "session-A-census", withLease: fakeWithLease() });
  assert.equal(r.written, 1);
  const row = sb.upserts[0].rows[0];
  assert.equal(row.lane, "A");
  assert.equal(row.created_by, "session-A-census");
});

test("writeCensusRows: identity lookup DB error is NOT swallowed (rethrows)", async () => {
  const sb = fakeSb({ existingErr: { message: "connection reset" } });
  await assert.rejects(
    () => writeCensusRows(sb, [OUT({ url: "https://x/a" })], { sourceId: "s1", lane: "A", createdBy: "session-A", withLease: fakeWithLease() }),
    /census_worklist identity lookup failed: connection reset/,
  );
});

test("writeCensusRows: empty/all-skipped batch → no upsert, no lease taken", async () => {
  const sb = fakeSb();
  const r = await writeCensusRows(sb, [OUT({ disposition: "skipped" })],
    { sourceId: "s1", lane: "A", createdBy: "session-A", withLease: fakeWithLease() });
  assert.equal(r.written, 0);
  assert.equal(r.skipped, 1);
  assert.equal(sb.upserts.length, 0);
});
