// @ts-check
// Red-then-green for F42 (card-shell-outside-SectionCard), attacked with the EXACT shells that
// shipped ruleless: CommunityRooms.tsx's local `CARD` object (radius 8, no shadow) and
// AccountPrimitives.tsx's `AccountCard` (no shadow). CLAUDE.md rule 15: a guard is proven by
// attack, not by presence.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fitnessFunction, cardShellLines, isMarked, WINDOW } from "./F42-card-shell-outside-section-card.mjs";

const FILE = "fsi-app/src/components/community/CommunityRooms.tsx";

test("RED: the exact shell that shipped — CommunityRooms' own CARD object, radius 8, no shadow", () => {
  const src = [
    "const CARD: React.CSSProperties = {",
    '  background: "var(--surface)",',
    '  border: "1px solid var(--color-border)",',
    "  borderRadius: 8,",
    '  overflow: "hidden",',
    "};",
  ].join("\n");
  // Radius 8 is not the card radius, so this exact object is NOT what the gate keys on; the
  // radius-10 / --radius-card forms are. Recorded so the boundary is explicit rather than assumed.
  assert.deepEqual(fitnessFunction.check(FILE, src), []);
});

test("RED: a hand-built card shell in a page component", () => {
  const src = [
    "return (",
    "  <div",
    "    style={{",
    '      background: "var(--card)",',
    '      border: "1px solid var(--line-1)",',
    '      borderRadius: "var(--radius-card)",',
    '      boxShadow: "var(--shadow-card)",',
    '      overflow: "hidden",',
    "    }}",
    "  >",
  ].join("\n");
  const v = fitnessFunction.check(FILE, src);
  assert.equal(v.length, 1);
  assert.match(v[0].message, /Card shell assembled by hand/);
  assert.match(v[0].message, /SectionCard/);
  // The line is the WINDOW's first line, which is where a reader starts reading the element, not
  // the line of the first card declaration inside it.
  assert.equal(v[0].line, 1, "the violation points at the element, not at the file");
});

test("RED: the radius-10 literal form is the same shell", () => {
  const src = [
    "<div style={{",
    '  background: "var(--surface)",',
    '  border: "1px solid var(--color-border)",',
    "  borderRadius: 10,",
    "}}>",
  ].join("\n");
  assert.equal(fitnessFunction.check(FILE, src).length, 1);
});

test("RED: the literal rgba(0,0,0,.12) border counts as the card border", () => {
  const src = [
    "<div style={{",
    '  background: "var(--card)",',
    '  border: "1px solid rgba(0, 0, 0, .12)",',
    '  borderRadius: "var(--radius-card)",',
    "}}>",
  ].join("\n");
  assert.equal(fitnessFunction.check(FILE, src).length, 1);
});

test("REGRESSION: the radius match must not depend on a trailing word boundary", () => {
  // The first cut wrote /borderRadius:\s*(?:"var\(--radius-card\)"|10)\b/. A quote followed by a
  // comma is not a word boundary, so the token form silently matched nothing and the gate saw 2 of
  // 9 known shells. Found by attack, kept as a test so the shape cannot come back.
  const src = [
    "<div style={{",
    '  background: "var(--card)",',
    '  border: "1px solid var(--line-1)",',
    '  borderRadius: "var(--radius-card)",',
    "}}>",
  ].join("\n");
  assert.deepEqual(cardShellLines(src), [0]);
});

test("GREEN: SectionCard.tsx itself is the one file allowed to declare the shell", () => {
  const src = [
    "  const cardStyle: CSSProperties = {",
    "    ...style,",
    '    background: "var(--card)",',
    '    border: "1px solid var(--line-1)",',
    '    borderRadius: "var(--radius-card)",',
    '    boxShadow: "var(--shadow-card)",',
    '    overflow: "hidden",',
    "  };",
  ].join("\n");
  assert.deepEqual(fitnessFunction.check("fsi-app/src/components/ui/SectionCard.tsx", src), []);
});

test("GREEN: rendering <SectionCard> is not a shell", () => {
  const src = '<SectionCard dataAudit="legend-rail"><div style={{ padding: "14px 16px" }}>x</div></SectionCard>';
  assert.deepEqual(fitnessFunction.check(FILE, src), []);
});

test("GREEN: two of the three card properties is not a card (a control, an input, a chip)", () => {
  const src = [
    "<input style={{",
    '  border: "1px solid var(--line-1)",',
    '  borderRadius: "var(--radius-card)",',
    "}} />",
  ].join("\n");
  assert.deepEqual(fitnessFunction.check(FILE, src), []);
});

test("GREEN: an explicit fitness-allow: F42 marker at the site exempts it", () => {
  const src = [
    "// fitness-allow: F42 (THE NAV CARD: ruling 5.2 gives it the band-coloured rule.)",
    "<div style={{",
    '  background: "var(--card)",',
    '  border: "1px solid var(--line-1)",',
    '  borderRadius: "var(--radius-card)",',
    "}}>",
  ].join("\n");
  assert.deepEqual(fitnessFunction.check("fsi-app/src/components/Sidebar.tsx", src), []);
});

test("the marker is honoured up to WINDOW lines above the shell, not only adjacent", () => {
  const lead = ["// fitness-allow: F42 (reason)"].concat(Array.from({ length: WINDOW - 1 }, () => "  padding: 4,"));
  const lines = lead.concat(["  background: \"var(--card)\"", "  border: \"1px solid var(--line-1)\"", "  borderRadius: 10,"]);
  assert.equal(isMarked(lines, lead.length), true);
  const tooFar = ["// fitness-allow: F42 (reason)"].concat(Array.from({ length: WINDOW + 3 }, () => "  padding: 4,"));
  assert.equal(isMarked(tooFar.concat(["x"]), tooFar.length), false);
});

test("the gate declares itself: id, name and the operator's own words as its source", () => {
  assert.equal(fitnessFunction.id, "F42");
  assert.equal(fitnessFunction.name, "card-shell-outside-SectionCard");
  assert.match(fitnessFunction.source, /part of the card component, not a\s+decoration/);
});
