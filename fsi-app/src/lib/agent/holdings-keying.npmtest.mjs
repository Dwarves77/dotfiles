// @ts-check
// PROOF (B1 population seam, 2026-07-19): the holdings gate's SNAPSHOT half counts a raw_fetches
// snapshot ONLY when the source row IS the document (source.url == item.source_url canonically).
// raw_fetches has no URL column — it is per-SOURCE — so for a PORTAL-DERIVED item (B1: many items
// share the portal's source_id) the portal's snapshot proves NOTHING about the item's document and
// must not wall the mint as falsely "held" (the live failure: 3 fresh FR rules minted, all refused
// grounding because the FR portal row carried an old snapshot). The per-instrument corpus shape is
// UNCHANGED: canonical-equal urls still count the snapshot (the guard's original, ruled behavior).
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { holdingsForItem } = await jiti.import("./canonical-pipeline.ts");

// fake sb serving: sources.url (maybeSingle), raw_fetches.html_bytes (thenable after order/limit),
// agent_run_searches pool rows (thenable).
function fakeSb({ sourceUrl, snapshotBytes = 0, poolRows = [] }) {
  return {
    from(table) {
      const q = {
        select() { return this; },
        eq() { return this; },
        order() { return this; },
        limit() { return this; },
        maybeSingle: async () => ({ data: table === "sources" ? { url: sourceUrl } : null, error: null }),
        then(res) {
          const data = table === "raw_fetches" ? [{ html_bytes: snapshotBytes }]
            : table === "agent_run_searches" ? poolRows
            : [];
          return Promise.resolve({ data, error: null }).then(res);
        },
      };
      return q;
    },
  };
}

test("PORTAL-DERIVED item: the portal's snapshot does NOT count as the item's holdings", async () => {
  const sb = fakeSb({ sourceUrl: "https://federalregister.gov/", snapshotBytes: 76_000 });
  const h = await holdingsForItem(sb, "item-1", "src-portal",
    "https://www.federalregister.gov/documents/2026/07/06/2026-13550/neshap-plywood");
  assert.equal(h.snapshotBytes, 0, "a portal snapshot proves nothing about this document");
  assert.equal(h.usablePoolRows, 0);
});

test("PER-INSTRUMENT item (source IS the document, canonical-equal): snapshot still counts (ruled behavior unchanged)", async () => {
  const sb = fakeSb({ sourceUrl: "https://eur-lex.europa.eu/eli/reg/2020/1056/oj/", snapshotBytes: 76_000 });
  const h = await holdingsForItem(sb, "item-2", "src-instr",
    "https://eur-lex.europa.eu/eli/reg/2020/1056/oj");
  assert.equal(h.snapshotBytes, 76_000, "canonical url match (trailing slash) keeps the guard's original behavior");
});

test("pool half stays item-scoped: >=2 content-bearing rows count regardless of snapshot keying", async () => {
  const sb = fakeSb({
    sourceUrl: "https://federalregister.gov/",
    snapshotBytes: 76_000,
    poolRows: [{ result_content_excerpt: "x".repeat(300) }, { result_content_excerpt: "y".repeat(300) }, { result_content_excerpt: "thin" }],
  });
  const h = await holdingsForItem(sb, "item-3", "src-portal", "https://www.federalregister.gov/documents/d1");
  assert.equal(h.snapshotBytes, 0);
  assert.equal(h.usablePoolRows, 2, "the item's own pool rows are its holdings — unchanged");
});
