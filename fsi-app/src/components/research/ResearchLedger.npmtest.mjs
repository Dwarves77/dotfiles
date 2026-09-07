// Structural regression test for src/components/research/ResearchLedger.tsx's theme TagChip
// addition (lane fix58-lists, 2026-09-07, design audit B136 / market-research-rows.json).
// README §0.4: "Market and Research rows add a signal-kind tag after the type — a tag, never a
// band." MarketIntelLedger.tsx already did this (its own `signalKindLabel` TagChip); this test
// guards that ResearchLedger.tsx now does too, mirroring the SAME pattern (a TagChip rendered
// beside the row's meta text, sourced from the row's own classified theme, never a second row).
//
// Text-level, same convention as ListRow.npmtest.mjs's own header explains (no JSX mount infra
// for plain `node --test`; the audit harness and the rendering guard's smoke specs are the
// real-DOM check, exercised live via market-research-rows.json's `research-row` fixture).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "ResearchLedger.tsx"),
  "utf8"
);

test("imports the shared TagChip, the same neutral tag every other surface uses", () => {
  assert.match(SOURCE, /import \{ TagChip \} from "@\/components\/ui\/Chips";/);
});

test("each row's theme classification renders as a TagChip beside meta, not a second row", () => {
  assert.match(SOURCE, /const themeKey = themeKeyOf\(r\);/);
  assert.match(SOURCE, /const themeLabel = themeKey \? \(THEME_LABELS as Record<string, string>\)\[themeKey\] \?\? themeKey : null;/);
  assert.match(SOURCE, /\{themeLabel && <TagChip>\{themeLabel\}<\/TagChip>\}/);
});

test("meta stays a single row cell (one `meta:` field on the row object), the tag augments it rather than forking a new row shape", () => {
  const metaFieldMatches = SOURCE.match(/\n\s*meta,\n/g) || [];
  assert.equal(metaFieldMatches.length, 1, "exactly one row object carries `meta` — the tag is composed into its value, not a sibling field");
});
