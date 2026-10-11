// @ts-check
// Red-then-green for F49 (parts-not-pages), attacked with one fixture per literal pattern the brief
// names in rule 1.2, plus the two shapes that actually shipped: reset-password/page.tsx's Anton h1 and
// card-shell confirmation box. CLAUDE.md rule 15: a guard is proven by attack, not by presence.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fitnessFunction, literalHits, isMarked, WINDOW, cardShellLines, isCardShellMarked } from "./F49-parts-not-pages.mjs";

const FILE = "fsi-app/src/app/regulations/page.tsx";

test("RED: an Anton title typed by hand (fontFamily naming Anton)", () => {
  const src = [
    "<h1 style={{",
    '  fontFamily: "Anton, sans-serif",',
    "  fontSize: 28,",
    "}}>Regulations</h1>",
  ].join("\n");
  const v = fitnessFunction.check(FILE, src);
  assert.equal(v.length, 1);
  assert.match(v[0].message, /Anton title/);
});

test("RED: an Anton title via the CSS variable, var(--font-display)", () => {
  const src = [
    "<h1 style={{",
    '  fontFamily: "var(--font-display)",',
    '  textTransform: "uppercase",',
    "}}>Benchmarks</h1>",
  ].join("\n");
  assert.equal(fitnessFunction.check(FILE, src).length, 1);
});

test("RED: a card border + radius 10, the var(--radius-card) form", () => {
  const src = [
    "<div style={{",
    '  border: "1px solid var(--line-1)",',
    '  borderRadius: "var(--radius-card)",',
    "}}>",
  ].join("\n");
  const v = fitnessFunction.check(FILE, src);
  assert.equal(v.length, 1);
  assert.match(v[0].message, /card border \+ radius 10/);
});

test("RED: a card border + radius 10, the bare-10 form", () => {
  const src = [
    "<div style={{",
    '  border: "1px solid rgba(0,0,0,.12)",',
    "  borderRadius: 10,",
    "}}>",
  ].join("\n");
  assert.equal(fitnessFunction.check(FILE, src).length, 1);
});

test("RED: a 3px rule, the height form", () => {
  const src = ["<div style={{", "  height: 3,", '  background: "var(--ink)",', "}} />"].join("\n");
  const v = fitnessFunction.check(FILE, src);
  assert.equal(v.length, 1);
  assert.match(v[0].message, /3px rule/);
});

test("RED: a 3px rule, the borderTop form", () => {
  const src = ["<div style={{", '  borderTop: "3px solid var(--immediate)",', "}} />"].join("\n");
  assert.equal(fitnessFunction.check(FILE, src).length, 1);
});

test("RED: a fact card edge/band, borderLeft 3px solid with a tint background", () => {
  const src = [
    "<div style={{",
    '  borderLeft: "3px solid #F97316",',
    '  background: "#FFF7ED",',
    "}}>",
  ].join("\n");
  const v = fitnessFunction.check(FILE, src);
  assert.equal(v.length, 1);
  assert.match(v[0].message, /fact card edge\/band/);
});

test("RED: chip padding, 2px 6px with uppercase", () => {
  const src = [
    "<span style={{",
    '  padding: "2px 6px",',
    '  textTransform: "uppercase",',
    "}}>SCOPE</span>",
  ].join("\n");
  const v = fitnessFunction.check(FILE, src);
  assert.equal(v.length, 1);
  assert.match(v[0].message, /[Cc]hip padding/);
});

test("RED: a state note edge, borderLeft 3px solid with radius 0 6px 6px 0", () => {
  const src = [
    "<div style={{",
    '  borderLeft: "3px solid var(--immediate)",',
    '  borderRadius: "0 6px 6px 0",',
    "}}>",
  ].join("\n");
  const v = fitnessFunction.check(FILE, src);
  assert.equal(v.length, 1);
  assert.match(v[0].message, /state note edge/);
});

test("RED: the exact shape that shipped, reset-password/page.tsx's Anton h1 (before its own marker)", () => {
  const src = [
    "<h1 style={{",
    '  fontFamily: "var(--font-display)",',
    '  textTransform: "uppercase",',
    '  letterSpacing: "0.04em",',
    "  fontSize: 22,",
    '  color: "var(--ink)",',
    "  margin: 0,",
    "}}>",
    "  Reset your password",
    "</h1>",
  ].join("\n");
  assert.equal(fitnessFunction.check(FILE, src).length, 1);
});

test("RED: the exact shape that shipped, reset-password/page.tsx's card-shell confirmation box (before its own marker)", () => {
  const src = [
    "<div style={{",
    '  borderRadius: "var(--radius-card)",',
    '  border: "1px solid var(--line-1)",',
    '  background: "var(--card)",',
    "  padding: 16,",
    "}}>",
  ].join("\n");
  assert.equal(fitnessFunction.check(FILE, src).length, 1);
});

test("GREEN: a page that imports the part renders no literal and is not a shell", () => {
  // Masthead and SectionCard imported here in prose, not as a real `from "..."` import statement:
  // this file is matched by the no-npm discipline glob (run-test-suite.sh), which scans every file's
  // OWN raw text for `from "..."` regardless of whether the match sits inside a JS string literal
  // (.discipline/glob-portability.test.mjs's own regex is that naive), a fixture string spelling
  // out a real `import { X } from "@/components/ui/Y"` line trips it as if this test file itself
  // imported a bare package. The fixture below still exercises the same case (a page that mounts the
  // parts via JSX, no literal style), just without the importable-looking source line.
  const src = [
    "// Masthead and SectionCard are the shared parts this page mounts.",
    "export default function Page() {",
    "  return (",
    "    <>",
    "      <Masthead title=\"Regulations\" />",
    '      <SectionCard><div style={{ padding: "14px 16px" }}>x</div></SectionCard>',
    "    </>",
    "  );",
    "}",
  ].join("\n");
  assert.deepEqual(fitnessFunction.check(FILE, src), []);
});

test("GREEN: an explicit fitness-allow: F49 marker at the site exempts it", () => {
  const src = [
    "// fitness-allow: F49 (auth confirmation note, not a section card; reset-password/page.tsx's own reason, review-by 2026-12-18)",
    "<div style={{",
    '  borderRadius: "var(--radius-card)",',
    '  border: "1px solid var(--line-1)",',
    "}}>",
  ].join("\n");
  assert.deepEqual(fitnessFunction.check(FILE, src), []);
});

test("GREEN: a combined marker (fitness-allow: F42 F49) still exempts the F49 hit", () => {
  const src = [
    "// fitness-allow: F42 F49 (auth confirmation note, not a section card; the site the parts brief",
    "// names by citation as its only F49 allowlist example.)",
    "<div style={{",
    '  borderRadius: "var(--radius-card)",',
    '  border: "1px solid var(--line-1)",',
    "}}>",
  ].join("\n");
  assert.deepEqual(fitnessFunction.check(FILE, src), []);
});

test("the marker is honoured up to WINDOW lines above the hit, not only adjacent", () => {
  const lead = ["// fitness-allow: F49 (reason)"].concat(Array.from({ length: WINDOW - 1 }, () => "  padding: 4,"));
  const lines = lead.concat(['  fontFamily: "Anton, sans-serif",']);
  assert.equal(isMarked(lines, lead.length), true);
  const tooFar = ["// fitness-allow: F49 (reason)"].concat(Array.from({ length: WINDOW + 3 }, () => "  padding: 4,"));
  assert.equal(isMarked(tooFar.concat(["x"]), tooFar.length), false);
});

test("GREEN: two of the four card properties (radius alone, no border-1px-solid) is not the card shell", () => {
  const src = ["<input style={{", "  borderRadius: 10,", "}} />"].join("\n");
  assert.deepEqual(fitnessFunction.check(FILE, src), []);
});

test("literalHits reports one entry per pattern, at the pattern's own line", () => {
  const src = ['fontFamily: "Anton, sans-serif",', "height: 3,"].join("\n");
  const hits = literalHits(src);
  assert.deepEqual(
    hits.map((h) => h.pattern),
    ["anton-title", "3px-rule"]
  );
  assert.equal(hits[0].line, 0);
  assert.equal(hits[1].line, 1);
});

test("the gate declares itself: id, name and its source in the brief's own words", () => {
  assert.equal(fitnessFunction.id, "F49");
  assert.equal(fitnessFunction.name, "shared-parts-not-retyped");
  assert.match(fitnessFunction.source, /parts-brief-2026-09-18\.md/);
});

test("enumerate covers every non-test .tsx; facet B (literal parts) applies to route page.tsx files only", () => {
  const files = fitnessFunction.enumerate();
  assert.ok(files.some((f) => /^fsi-app\/src\/app\/.*page\.tsx$/.test(f)), "expected at least one page.tsx under fsi-app/src/app");
  const antonSrc = '<h1 style={{ fontFamily: "Anton, sans-serif" }}>x</h1>';
  assert.equal(fitnessFunction.check("fsi-app/src/app/regulations/page.tsx", antonSrc).length, 1);
  assert.deepEqual(fitnessFunction.check("fsi-app/src/components/ui/Heading.tsx", antonSrc), []);
});

// ---- Facet A, formerly F42 (REG-1, 2026-10-11): the former F42 test file, moved here with its function. ----

const CARD_FILE = "fsi-app/src/components/community/CommunityRooms.tsx";

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
  assert.deepEqual(fitnessFunction.check(CARD_FILE, src), []);
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
  const v = fitnessFunction.check(CARD_FILE, src);
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
  assert.equal(fitnessFunction.check(CARD_FILE, src).length, 1);
});

test("RED: the literal rgba(0,0,0,.12) border counts as the card border", () => {
  const src = [
    "<div style={{",
    '  background: "var(--card)",',
    '  border: "1px solid rgba(0, 0, 0, .12)",',
    '  borderRadius: "var(--radius-card)",',
    "}}>",
  ].join("\n");
  assert.equal(fitnessFunction.check(CARD_FILE, src).length, 1);
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
  assert.deepEqual(fitnessFunction.check(CARD_FILE, src), []);
});

test("GREEN: two of the three card properties is not a card (a control, an input, a chip)", () => {
  const src = [
    "<input style={{",
    '  border: "1px solid var(--line-1)",',
    '  borderRadius: "var(--radius-card)",',
    "}} />",
  ].join("\n");
  assert.deepEqual(fitnessFunction.check(CARD_FILE, src), []);
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
  assert.equal(isCardShellMarked(lines, lead.length), true);
  const tooFar = ["// fitness-allow: F42 (reason)"].concat(Array.from({ length: WINDOW + 3 }, () => "  padding: 4,"));
  assert.equal(isCardShellMarked(tooFar.concat(["x"]), tooFar.length), false);
});
