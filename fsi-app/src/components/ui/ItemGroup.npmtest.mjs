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

test("header renders only when title or band is given (integrity rule: no invented header row)", () => {
  assert.match(SOURCE, /const hasHeader = Boolean\(title \|\| band\);/);
  assert.match(SOURCE, /\{hasHeader && \(/);
});

test("band pill: 6px dot, 9.5px/800 uppercase label, band-coloured", () => {
  assert.match(SOURCE, /width: 6, height: 6, borderRadius: "50%", background: pillBand\.cssVar/);
  assert.match(SOURCE, /fontSize: "var\(--fs-95, 9\.5px\)"/);
  assert.match(SOURCE, /fontWeight: 800,/);
  assert.match(SOURCE, /letterSpacing: "0\.08em"/);
});

// 2026-09-25 operator note (look-only pass against the new artboards): "band tag on every fact
// card should appear once, in the masthead, not per-card." The masthead's ActionCard already shows
// the item's band once; a group on the SAME item's own detail page must not repaint it. The pill
// is therefore gated on an EXPLICITLY passed `band` prop, never on the page's ambient BandProvider
// context, even though the header's tint/action-strip colour still reads the ambient band.
test("band pill renders only for an explicitly-passed band, never the ambient page band (band tag once, in the masthead)", () => {
  assert.match(SOURCE, /const pillBand = bandProp \?\? null;/);
  assert.match(SOURCE, /\{pillBand && \(/);
  assert.doesNotMatch(SOURCE, /\{band && \(\s*\n\s*<span data-part-slot="band-pill"/);
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
