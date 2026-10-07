// Structural regression test for src/components/ui/ItemGroup.tsx (lane w10-factcard-d,
// 2026-09-21; artboard 21c, parts-brief-2026-09-18.md section 2.2). No JSX render harness exists
// in this repo (see FactCard.npmtest.mjs's own header) - this reads the component's source text
// to guard the 2.2 contract: item band pill (6px dot, 9.5px/800 label), item title 13px/600,
// qualifier 11px muted, the shared MoreBelowDisclosure reuse for the 4-card overflow cap, and the
// ACTION-strip-is-a-StateNote convention (2.7).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "ItemGroup.tsx"), "utf8");

test("root element carries data-part=\"item-group\"", () => {
  assert.match(SOURCE, /data-part="item-group"/);
});

// 2026-09-25 live-render fix: gating on the ambient `band` (tint only) rendered an EMPTY tinted bar
// on every group on a single-item detail page once the pill stopped auto-inheriting that band.
// The header must render only when it has something to show: a title, or an explicit pill.
test("header renders only when title or an explicit pill band is given, never for tint alone (no empty header bar)", () => {
  assert.match(SOURCE, /const hasHeader = Boolean\(title \|\| pillBand\);/);
  assert.match(SOURCE, /\{hasHeader && \(/);
});

// Lane PAR-2 (2026-10-07, artboard 22 ruling A + coordinator ruling): the group header is the SHARED
// BandGroupHeader (white, 3px band rule, Anton 18 band name), the same part the list band blocks
// render; ItemGroup no longer draws its own tinted header or 6px dot pill.
test("header renders through the shared BandGroupHeader, white, with no band tint and no second implementation", () => {
  assert.match(SOURCE, /import \{ BandGroupHeader \} from "@\/components\/ui\/BandGroupHeader"/);
  assert.match(SOURCE, /<BandGroupHeader\s+band=\{pillBand \?\? band\}/);
  assert.match(SOURCE, /nameSlot="band-pill"/);
  assert.doesNotMatch(SOURCE, /background: band \? band\.tintCssVar : "var\(--page\)"/);
  assert.doesNotMatch(SOURCE, /width: 6, height: 6/);
});

test("BandGroupHeader: white, 3px band rule, Anton 18 band name in the band colour, definition truncates with a title", () => {
  const H = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "BandGroupHeader.tsx"), "utf8");
  assert.match(H, /background: "var\(--card\)"/);
  assert.match(H, /borderTop: band \? `3px solid \$\{band\.cssVar\}`/);
  assert.match(H, /fontFamily: "var\(--font-display\)"/);
  assert.match(H, /fontSize: 18,/);
  assert.match(H, /color: band\.cssVar/);
  assert.match(H, /data-guard-display="band-group-name"/);
  assert.match(H, /title=\{band\.window\}/);
  assert.doesNotMatch(H, /tintCssVar/);
});

// 2026-09-25 operator note (look-only pass against the new artboards): "band tag on every fact
// card should appear once, in the masthead, not per-card." The header-gating half stays: a header
// renders only for a title or an explicit band prop, never for the ambient band alone.
test("the header is gated on a title or an explicit band, never the ambient page band alone", () => {
  assert.match(SOURCE, /const pillBand = bandProp \?\? null;/);
  assert.match(SOURCE, /const hasHeader = Boolean\(title \|\| pillBand\);/);
});

test("item title is 13px/600; qualifier is 11px muted", () => {
  assert.match(SOURCE, /fontSize: "var\(--fs-13\)", fontWeight: 600, color: "var\(--ink\)"/);
  assert.match(SOURCE, /fontSize: "var\(--fs-11\)", color: "var\(--ink-3\)"/);
});

test("title carries data-guard-title (UX contract: title element of every row/card/group component)", () => {
  assert.match(SOURCE, /data-guard-title/);
});

// Build item 3: "At most 4 cards visible; the rest sit behind 'N more facts' with an arrow, the
// same disclosure the operations panel uses (reuse that control; closed by default, F43)."
test("visible-card cap is 4, overflow renders through the shared MoreBelowDisclosure (no second disclosure implementation)", () => {
  assert.match(SOURCE, /import \{ MoreBelowDisclosure \} from "@\/components\/shared\/MoreBelowDisclosure"/);
  assert.match(SOURCE, /const VISIBLE_CARD_CAP = 4;/);
  assert.match(SOURCE, /<MoreBelowDisclosure count=\{overflow\.length\} itemNoun="more facts">/);
});

// 2.7 StateNote convention: "Every group CLOSES with an ACTION strip = StateNote in the item's
// band tint, label 'ACTION' in the band colour, one sentence." actionStrip is optional and, per
// the component's own header note, not wired by any real call site in this lane (no data source
// for the sentence exists today) - the prop and its StateNote rendering exist for a future lane.
test("actionStrip renders as a StateNote labelled ACTION in the band colour, and is optional", () => {
  assert.match(SOURCE, /import \{ StateNote \} from "@\/components\/ui\/StateNote"/);
  assert.match(SOURCE, /\{actionStrip && \(/);
  assert.match(SOURCE, /<StateNote band=\{band\}>/);
  assert.match(SOURCE, />ACTION<\/strong>/);
  assert.match(SOURCE, /actionStrip\?: ItemGroupActionStrip \| null;/);
});

test("band comes from the one platform urgency vocabulary (src/lib/urgency/bands.ts), never a page-local vocabulary", () => {
  assert.match(SOURCE, /import type \{ UrgencyBand \} from "@\/lib\/urgency\/bands"/);
  assert.match(SOURCE, /band\?: UrgencyBand \| null;/);
});

test("groups are visually separated (1px rgba(0,0,0,.08) border) per 2.2", () => {
  assert.match(SOURCE, /border: "1px solid rgba\(0,0,0,\.08\)"/);
});
