// read-and-extract.test.mjs — proves the shared reader's pure mapping/context functions, the live
// readExtractionInput/readAndExtractForwardEvents shape over a fake sb client, and the reader-collapse
// contract (lane FE-SLOT-2, 2026-09-04): the two script callers import this file's own row-mapping rather
// than re-typing it.
import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  CLAIM_KIND_FILTER,
  CLAIM_BASE_COLUMNS,
  SECTION_BASE_COLUMNS,
  POOL_BASE_COLUMNS,
  mapClaimRow,
  mapClaimRows,
  mapSectionRow,
  mapSectionRows,
  usableCapturesOrdered,
  buildDueDateContext,
  attachDueDateContext,
  readExtractionInput,
  readAndExtractForwardEvents,
} from "./read-and-extract.mjs";

// ── mapClaimRow(s) / mapSectionRow(s) ───────────────────────────────────────────────────────────────

describe("mapClaimRow / mapClaimRows", () => {
  test("maps a raw section_claim_provenance row to the extractor's claim shape", () => {
    const row = { id: "c1", claim_kind: "FACT", claim_text: "[title] ...", source_span: "span text" };
    assert.deepEqual(mapClaimRow(row), { claim_id: "c1", kind: "FACT", text: "[title] ...", span: "span text" });
  });

  test("a null source_span maps to null, never undefined (a GAP claim carries no span)", () => {
    const row = { id: "c2", claim_kind: "GAP", claim_text: "[due_date] No verbatim...", source_span: null };
    assert.equal(mapClaimRow(row).span, null);
  });

  test("ignores extra columns on the row (e.g. intelligence_item_id from a batched read) without erroring", () => {
    const row = { id: "c1", intelligence_item_id: "item-1", claim_kind: "FACT", claim_text: "t", source_span: "s" };
    assert.deepEqual(mapClaimRow(row), { claim_id: "c1", kind: "FACT", text: "t", span: "s" });
  });

  test("mapClaimRows is tolerant of null/undefined and maps every row", () => {
    assert.deepEqual(mapClaimRows(null), []);
    assert.deepEqual(mapClaimRows(undefined), []);
    const rows = [
      { id: "a", claim_kind: "FACT", claim_text: "x", source_span: "y" },
      { id: "b", claim_kind: "GAP", claim_text: "z", source_span: null },
    ];
    assert.deepEqual(mapClaimRows(rows), [
      { claim_id: "a", kind: "FACT", text: "x", span: "y" },
      { claim_id: "b", kind: "GAP", text: "z", span: null },
    ]);
  });
});

describe("mapSectionRow / mapSectionRows", () => {
  test("maps a raw intelligence_item_sections row, content_md null coerces to empty string", () => {
    assert.deepEqual(mapSectionRow({ id: "s1", section_key: "record_facts", content_md: null }), {
      section_id: "s1",
      key: "record_facts",
      md: "",
    });
  });

  test("mapSectionRows is tolerant of null/undefined", () => {
    assert.deepEqual(mapSectionRows(null), []);
    assert.deepEqual(
      mapSectionRows([{ id: "s1", section_key: "k", content_md: "## md" }]),
      [{ section_id: "s1", key: "k", md: "## md" }]
    );
  });
});

// ── usableCapturesOrdered / buildDueDateContext / attachDueDateContext ─────────────────────────────

describe("usableCapturesOrdered", () => {
  test("drops rows at or under the 200-char usability floor, keeps rows over it, ordered by result_index", () => {
    const rows = [
      { id: "long", result_content: "x".repeat(201), result_index: 2 },
      { id: "short", result_content: "y".repeat(50), result_index: 0 },
      { id: "first", result_content: "z".repeat(300), result_index: 0 },
    ];
    const out = usableCapturesOrdered(rows);
    assert.deepEqual(out.map((r) => r.id), ["first", "long"]);
  });

  test("a whitespace-only long row is not usable (trimmed length is what counts)", () => {
    const rows = [{ id: "blank", result_content: " ".repeat(300), result_index: 0 }];
    assert.deepEqual(usableCapturesOrdered(rows), []);
  });

  test("tolerant of null/undefined input", () => {
    assert.deepEqual(usableCapturesOrdered(null), []);
    assert.deepEqual(usableCapturesOrdered(undefined), []);
  });
});

describe("buildDueDateContext", () => {
  test("finds the FIRST usable capture (already ordered) containing the span verbatim, slices up to 240 chars either side", () => {
    const span = "30 June 2026";
    const before = "z".repeat(300) + " the operator shall provide data by ";
    const after = " on the practical application.";
    const captures = [{ id: "search-1", result_content: before + span + after }];
    const ctx = buildDueDateContext(span, captures);
    assert.equal(ctx.search_id, "search-1");
    assert.equal(ctx.before.length, 240);
    assert.ok(ctx.before.endsWith("the operator shall provide data by "));
    assert.equal(ctx.after, after);
  });

  test("skips a capture that does not contain the span, uses the next one that does", () => {
    const span = "30 June 2026";
    const captures = [
      { id: "no-match", result_content: "nothing relevant here at all" },
      { id: "match", result_content: `text before ${span} text after` },
    ];
    const ctx = buildDueDateContext(span, captures);
    assert.equal(ctx.search_id, "match");
  });

  test("case-sensitive exact substring — a differently-cased occurrence does not count as a match", () => {
    const span = "30 June 2026";
    const captures = [{ id: "wrong-case", result_content: "text before 30 june 2026 text after" }];
    assert.equal(buildDueDateContext(span, captures), null);
  });

  test("null when no capture contains the span, or span/captures are empty", () => {
    assert.equal(buildDueDateContext("30 June 2026", []), null);
    assert.equal(buildDueDateContext("30 June 2026", [{ id: "x", result_content: "unrelated text" }]), null);
    assert.equal(buildDueDateContext("", [{ id: "x", result_content: "30 June 2026" }]), null);
    assert.equal(buildDueDateContext(null, [{ id: "x", result_content: "30 June 2026" }]), null);
  });

  test("before/after are capped even when the surrounding text is much longer than 240 chars", () => {
    const span = "DATE";
    const captures = [{ id: "x", result_content: "a".repeat(1000) + span + "b".repeat(1000) }];
    const ctx = buildDueDateContext(span, captures);
    assert.equal(ctx.before.length, 240);
    assert.equal(ctx.after.length, 240);
  });
});

describe("attachDueDateContext", () => {
  test("attaches context only to due_date slot FACT claims, leaves every other claim byte-identical (no context key at all)", () => {
    const claims = [
      { claim_id: "due1", kind: "FACT", text: "[due_date] The captured source states a due date, verbatim: «1 Jan 2030»", span: "1 Jan 2030" },
      { claim_id: "plain1", kind: "FACT", text: "[title] The captured source's own text carries this item's title verbatim: «X»", span: "X" },
      { claim_id: "gap1", kind: "GAP", text: "[due_date] No verbatim due-date statement was located...", span: null },
    ];
    const poolRows = [{ id: "search-1", result_content: "x".repeat(210) + " context before 1 Jan 2030 context after", result_index: 0 }];
    const out = attachDueDateContext(claims, poolRows);

    assert.ok(Object.hasOwn(out[0], "context"));
    assert.equal(out[0].context.search_id, "search-1");

    assert.equal(Object.hasOwn(out[1], "context"), false);
    assert.deepEqual(out[1], claims[1]);

    // a due_date GAP claim has kind !== 'FACT' -- isDueDateSlotClaim requires FACT, so it too is untouched.
    assert.equal(Object.hasOwn(out[2], "context"), false);
  });

  test("context is null (not omitted) when no capture contains the span", () => {
    const claims = [{ claim_id: "due1", kind: "FACT", text: "[due_date] The captured source states a due date, verbatim: «1 Jan 2030»", span: "1 Jan 2030" }];
    const out = attachDueDateContext(claims, []);
    assert.equal(out[0].context, null);
  });

  test("tolerant of null/undefined claims", () => {
    assert.deepEqual(attachDueDateContext(null, []), []);
    assert.deepEqual(attachDueDateContext(undefined, []), []);
  });
});

// ── readExtractionInput / readAndExtractForwardEvents (fake sb client) ─────────────────────────────

function fakeSb(tables) {
  return {
    from(table) {
      const rows = tables[table] ?? [];
      const state = { eqs: [], ins: [] };
      const builder = {
        select() { return builder; },
        eq(col, val) { state.eqs.push([col, val]); return builder; },
        in(col, vals) { state.ins.push([col, vals]); return builder; },
        then(resolve) {
          const filtered = rows.filter((r) =>
            state.eqs.every(([col, val]) => r[col] === val) &&
            state.ins.every(([col, vals]) => vals.includes(r[col]))
          );
          resolve({ data: filtered, error: null });
        },
      };
      return builder;
    },
  };
}

describe("readExtractionInput (fake sb client)", () => {
  test("reads claims/sections/pool for one item, maps them, and attaches due_date context", async () => {
    const sb = fakeSb({
      section_claim_provenance: [
        {
          id: "due1",
          intelligence_item_id: "item-1",
          claim_kind: "FACT",
          claim_text: "[due_date] The captured source states a due date, verbatim: «1 Jan 2030»",
          source_span: "1 Jan 2030",
        },
        { id: "other-item", intelligence_item_id: "item-2", claim_kind: "FACT", claim_text: "x", source_span: "x" },
      ],
      intelligence_item_sections: [
        { id: "sec1", item_id: "item-1", section_key: "record_facts", content_md: "## md" },
      ],
      agent_run_searches: [
        { id: "search-1", intelligence_item_id: "item-1", result_content: "x".repeat(210) + " before 1 Jan 2030 after", result_index: 0 },
      ],
    });
    const { claims, sections } = await readExtractionInput(sb, "item-1");
    assert.equal(claims.length, 1);
    assert.equal(claims[0].claim_id, "due1");
    assert.ok(claims[0].context, "expected due_date context to be attached");
    assert.equal(claims[0].context.search_id, "search-1");
    assert.equal(sections.length, 1);
    assert.equal(sections[0].section_id, "sec1");
  });

  test("throws (never swallows) on a claim/section/pool read error", async () => {
    const sb = {
      from(table) {
        return {
          select() { return this; },
          eq() { return this; },
          in() { return this; },
          then: (resolve) => resolve({ data: null, error: { message: `${table} boom` } }),
        };
      },
    };
    await assert.rejects(() => readExtractionInput(sb, "item-1"), /section_claim_provenance read failed: section_claim_provenance boom/);
  });
});

describe("readAndExtractForwardEvents (fake sb client, integration)", () => {
  test("reads and extracts in one call, returning events/skipped alongside the exact claims/sections fed to the extractor", async () => {
    const sb = fakeSb({
      section_claim_provenance: [
        { id: "c1", intelligence_item_id: "item-1", claim_kind: "FACT", claim_text: "entered into force on 1 January 2027.", source_span: "entered into force on 1 January 2027." },
      ],
      intelligence_item_sections: [],
      agent_run_searches: [],
    });
    const { events, skipped, claims, sections } = await readAndExtractForwardEvents(sb, "item-1");
    assert.equal(events.length, 1);
    assert.equal(events[0].event_kind, "entry_into_force");
    assert.deepEqual(skipped, []);
    assert.equal(claims.length, 1);
    assert.equal(claims[0].claim_id, "c1");
    assert.deepEqual(sections, []);
  });
});

// ── shared column/filter constants used by both script callers ─────────────────────────────────────

test("CLAIM_KIND_FILTER / CLAIM_BASE_COLUMNS / SECTION_BASE_COLUMNS / POOL_BASE_COLUMNS are frozen and exact", () => {
  assert.deepEqual(CLAIM_KIND_FILTER, ["FACT", "GAP"]);
  assert.ok(Object.isFrozen(CLAIM_KIND_FILTER));
  assert.deepEqual(CLAIM_BASE_COLUMNS, ["id", "claim_kind", "claim_text", "source_span"]);
  assert.deepEqual(SECTION_BASE_COLUMNS, ["id", "section_key", "content_md"]);
  assert.deepEqual(POOL_BASE_COLUMNS, ["id", "result_content", "result_index"]);
});

// ---------------------------------------------------------------------------
// READER CONTRACT (lane FE-SLOT-2, 2026-09-04): the "no mirrored copies" collapse. Reads each of the
// three source files as text and fails if either script re-declares its own claim/section row-mapping
// instead of importing this file's own `mapClaimRow`/`mapSectionRow` — the exact duplication CLAUDE.md's
// "no mirrored copies" rule forbids, and this dispatch names by name. Same pattern this codebase already
// uses for a source-reading contract (scripts/mint/export-census-rows.test.mjs's own "read-shape / query-fn
// regression locks").
// ---------------------------------------------------------------------------

const HERE = dirname(fileURLToPath(import.meta.url));
const EXPORTER_PATH = join(HERE, "..", "..", "..", "scripts", "turns", "export-corpus-for-extraction.mjs");
const RETEXT_PATH = join(HERE, "..", "..", "..", "scripts", "maintenance", "forward-events-retext.mjs");

describe("reader contract: the two script callers import read-and-extract.mjs's row mapping, never re-type it", () => {
  test("export-corpus-for-extraction.mjs imports mapClaimRow/mapSectionRow/CLAIM_KIND_FILTER/attachDueDateContext from read-and-extract.mjs", () => {
    const src = readFileSync(EXPORTER_PATH, "utf8");
    assert.match(src, /from\s+["']\.\.\/\.\.\/src\/lib\/forward-events\/read-and-extract\.mjs["']/);
    assert.match(src, /\bmapClaimRow\b/);
    assert.match(src, /\bmapSectionRow\b/);
    assert.match(src, /\battachDueDateContext\b/);
    // never a hand-typed row-mapping literal of its own (the exact shape lane FE-SLOT-2 removed)
    assert.doesNotMatch(src, /claim_id:\s*r\.id/);
    assert.doesNotMatch(src, /section_id:\s*r\.id/);
  });

  test("forward-events-retext.mjs imports mapClaimRow/mapSectionRow/CLAIM_KIND_FILTER/attachDueDateContext from read-and-extract.mjs", () => {
    const src = readFileSync(RETEXT_PATH, "utf8");
    assert.match(src, /from\s+["']\.\.\/\.\.\/src\/lib\/forward-events\/read-and-extract\.mjs["']/);
    assert.match(src, /\bmapClaimRow\b/);
    assert.match(src, /\bmapSectionRow\b/);
    assert.match(src, /\battachDueDateContext\b/);
    assert.doesNotMatch(src, /claim_id:\s*r\.id/);
    assert.doesNotMatch(src, /section_id:\s*r\.id/);
  });

  test("both scripts still read section_claim_provenance/intelligence_item_sections themselves (their own DB-call mechanism, readAll — never removed, only the row-mapping moved)", () => {
    const exporterSrc = readFileSync(EXPORTER_PATH, "utf8");
    const retextSrc = readFileSync(RETEXT_PATH, "utf8");
    for (const src of [exporterSrc, retextSrc]) {
      assert.match(src, /readAll\(\s*"section_claim_provenance"/);
      assert.match(src, /readAll\(\s*"intelligence_item_sections"/);
      assert.match(src, /readAll\(\s*"agent_run_searches"/);
    }
  });
});
