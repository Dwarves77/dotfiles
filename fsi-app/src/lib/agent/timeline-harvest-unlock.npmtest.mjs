// timeline-harvest-unlock.npmtest.mjs — DATECHAIN lane, 2026-09-11.
//
// Proves the split made in canonical-pipeline.ts: harvestItemTimeline() runs the §14 timeline harvest
// for a VERIFIED item (provenance_status='verified') — which sectionBrief's own F2 skip-if-verified
// guard used to block entirely, because the harvest lived INSIDE sectionBrief AFTER that guard's early
// return (see canonical-pipeline.ts's own comment on the guard: it exists to stop a section delete
// cascading section_claim_provenance, not to gate the timeline harvest, which never touches either
// table). This is an *.npmtest.mjs (not *.test.mjs) because canonical-pipeline.ts is only importable
// via jiti (its `@/` aliases are not portable to plain `node --test` — see slot-prompt.test.mjs's own
// header for the same constraint on this exact module).
//
// The proof is an injected fake Supabase client that RECORDS every table touched. The attack: if the
// guard were still coupling the harvest to the section reconcile, harvestItemTimeline would never be
// reachable for a verified item at all. This test calls it directly (the same call sectionBrief's
// verified-skip branch now makes) and asserts (a) item_timelines got a delete+insert with the parsed
// milestone, and (b) intelligence_item_sections / section_claim_provenance were NEVER touched — the
// guard's actual protection (the cascade) stays intact because nothing here goes near those tables.

import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..", "..");
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });

// canonical-pipeline.ts calls createClient(...) at module scope only inside svc(), lazily (never at
// import time), so importing it here with no env vars set is safe as long as we always pass our own
// injected client and never let svc() run.
const { harvestItemTimeline } = await jiti.import("./canonical-pipeline.ts");

const FULL_BRIEF_WITH_TIMELINE = `
## 14. Confirmed Regulatory Timeline

| Date | Milestone | Status |
|---|---|---|
| 12 August 2026 | Entry into force | Upcoming |
| 1 March 2027 | First compliance deadline | Upcoming |
`;

/** A fake Supabase client that records every .from(table) call and answers only the exact queries
 *  harvestItemTimeline is documented to make (intelligence_items read, item_timelines delete+insert). Any
 *  other table touched is still recorded (so the test can assert on it) but would return an unusable stub
 *  — the point is to prove which tables get called, not to fully emulate postgrest. */
function fakeClient({ itemType = "regulation", fullBrief = FULL_BRIEF_WITH_TIMELINE } = {}) {
  const calls = { tables: [], deletes: [], inserts: [] };
  return {
    calls,
    from(table) {
      calls.tables.push(table);
      if (table === "intelligence_items") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: { item_type: itemType, full_brief: fullBrief }, error: null }),
            }),
          }),
        };
      }
      if (table === "item_timelines") {
        return {
          delete: () => ({
            eq: (col, val) => {
              calls.deletes.push({ col, val });
              return Promise.resolve({ error: null });
            },
          }),
          insert: (rows) => {
            calls.inserts.push(rows);
            return Promise.resolve({ error: null });
          },
        };
      }
      // Any other table (intelligence_item_sections, section_claim_provenance) — the guard's actual
      // protected tables. Touching either here means the split failed to isolate the harvest.
      return {
        select: () => { throw new Error(`unexpected read from ${table}`); },
        delete: () => { throw new Error(`unexpected delete from ${table}`); },
        insert: () => { throw new Error(`unexpected insert into ${table}`); },
        update: () => { throw new Error(`unexpected update on ${table}`); },
      };
    },
  };
}

test("harvestItemTimeline writes item_timelines for a verified item and never touches sections", async () => {
  const sb = fakeClient();
  const result = await harvestItemTimeline("item-1", sb);

  assert.equal(result.ok, true);
  assert.match(result.detail, /timeline 2 milestones/);

  // item_timelines got the delete-then-insert replace.
  assert.equal(sb.calls.deletes.length, 1);
  assert.deepEqual(sb.calls.deletes[0], { col: "item_id", val: "item-1" });
  assert.equal(sb.calls.inserts.length, 1);
  assert.equal(sb.calls.inserts[0].length, 2);
  assert.equal(sb.calls.inserts[0][0].milestone_date, "2026-08-12");
  assert.equal(sb.calls.inserts[0][1].milestone_date, "2027-03-01");
  assert.equal(sb.calls.inserts[0][0].label, "Entry into force");
  for (const row of sb.calls.inserts[0]) assert.equal(row.item_id, "item-1");

  // The exact tables this call touched — intelligence_items (read) and item_timelines (delete+insert)
  // only. Neither intelligence_item_sections nor section_claim_provenance appears — the cascade the F2
  // guard protects is never in this call's blast radius.
  assert.deepEqual(new Set(sb.calls.tables), new Set(["intelligence_items", "item_timelines"]));
  assert.ok(!sb.calls.tables.includes("intelligence_item_sections"));
  assert.ok(!sb.calls.tables.includes("section_claim_provenance"));
});

test("harvestItemTimeline is a no-op (no writes) for a non-regulatory_fact_document item_type", async () => {
  const sb = fakeClient({ itemType: "market" });
  const result = await harvestItemTimeline("item-2", sb);
  assert.equal(result.ok, true);
  assert.match(result.detail, /no timeline harvest/);
  assert.equal(sb.calls.deletes.length, 0);
  assert.equal(sb.calls.inserts.length, 0);
});

test("harvestItemTimeline reports 0 rows honestly when §14 has no timeline block", async () => {
  const sb = fakeClient({ fullBrief: "## 1. Overview\n\nNo timeline section here." });
  const result = await harvestItemTimeline("item-3", sb);
  assert.equal(result.ok, true);
  assert.equal(sb.calls.deletes.length, 0);
  assert.equal(sb.calls.inserts.length, 0);
});
