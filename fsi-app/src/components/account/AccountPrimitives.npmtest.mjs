// Structural regression test for src/components/account/AccountPrimitives.tsx (lane fix58-account,
// 2026-09-07, operator audit rows B137-B155). No JSX render harness exists in this repo for source
// files (see DetailShell.npmtest.mjs's own header for the same constraint) — this reads the
// component's source text to guard the exact geometry the design-audit harness measures at runtime
// (fsi-app/.discipline/rendering/audit/spec/account-members.json and settings-notifications.json).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "AccountPrimitives.tsx"),
  "utf8"
);

// Bounded to the NAMED FUNCTION, from its `export function` to the next top-level `export`, rather
// than to a fixed character count. It was a flat 2200-char window, which is a silent tripwire: lanes
// settings60 and admin60 each added a comment inside AccountCard at train 60's fold, and the two
// together pushed the head meta's `fontWeight: 600` to offset 2275 from the function start. The
// component was correct and the assertion still described it correctly; the WINDOW had fallen short,
// so a green test went red on prose alone. Every caller's invariant is unchanged, and the slice is
// still scoped to ONE function, so a value from a sibling can never satisfy it. (Fold 60.)
function slice(fnName) {
  const start = SOURCE.indexOf(fnName);
  assert.notEqual(start, -1, `${fnName} not found in source`);
  const next = SOURCE.indexOf("\nexport ", start + 1);
  return SOURCE.slice(start, next === -1 ? SOURCE.length : next);
}

test("AccountCard shell: border-radius uses the shared 10px card token, not a page-local 8px", () => {
  const body = slice("export function AccountCard");
  assert.match(body, /borderRadius:\s*"var\(--radius-card\)"/);
});

test("AccountCard header row: dc.html p14/p15 padding 14px 16px 10px + border-bottom rgba(0,0,0,.08)", () => {
  const body = slice("export function AccountCard");
  assert.match(body, /padding:\s*"14px 16px 10px"/);
  assert.match(body, /borderBottom:\s*"1px solid rgba\(0,0,0,\.08\)"/);
});

test("AccountCard title: Anton 20px, .04em, not the prior 12.5px Plus Jakarta Sans treatment", () => {
  const body = slice("export function AccountCard");
  assert.match(body, /fontFamily:\s*"var\(--font-display\)"/);
  assert.match(body, /fontSize:\s*"20px"/);
  assert.match(body, /letterSpacing:\s*"0\.04em"/);
});

test("AccountCard meta: font-weight 600 (dc.html's later, applied declaration), not 700", () => {
  const body = slice("export function AccountCard");
  const metaBlock = body.slice(body.indexOf("meta != null"));
  assert.match(metaBlock, /fontWeight:\s*600/);
});

test("ToggleSwitch: 32x18 track, 14x14 knob (dc.html p15), not the prior 36x20/16x16", () => {
  const body = slice("export function ToggleSwitch");
  assert.match(body, /width:\s*32,/);
  assert.match(body, /height:\s*18,/);
  const knob = body.slice(body.indexOf("<span"));
  assert.match(knob, /width:\s*14,/);
  assert.match(knob, /height:\s*14,/);
});

// ── SegmentedControl + AccountCard head/foot (lane settings60, 2026-09-08, artboard 15) ──────
// dc.html id="p15" draws the same joined-options control five times (Default sort, Default export,
// Alert bands, Cadence, Day). It is one shared part here rather than five inline copies, and these
// pin the values lifted from that markup plus the two accessibility shapes it has to keep.

test("SegmentedControl is exported once and carries dc.html p15's own box", () => {
  assert.match(SOURCE, /export function SegmentedControl</);
  assert.match(SOURCE, /border:\s*"1px solid var\(--color-border-medium\)"/);
  assert.match(SOURCE, /borderRadius:\s*6,\n\s*overflow:\s*"hidden"/);
  // Joined segments: only the seams carry a divider, never the first one.
  assert.match(SOURCE, /borderLeft:\s*index === 0 \? "none" : "1px solid rgba\(0,0,0,\.15\)"/);
});

test("a segment is a real button with the right role for its group kind", () => {
  // Single-select reads as a radiogroup; multi-select (Alert bands) as pressed buttons.
  assert.match(SOURCE, /role=\{multiple \? "group" : "radiogroup"\}/);
  assert.match(SOURCE, /role=\{multiple \? undefined : "radio"\}/);
  assert.match(SOURCE, /aria-checked=\{multiple \? undefined : on\}/);
  assert.match(SOURCE, /aria-pressed=\{multiple \? on : undefined\}/);
});

test("segments keep the 24px minimum box and never clip: a group that cannot fit wraps", () => {
  assert.match(SOURCE, /minHeight:\s*24/);
  assert.match(SOURCE, /flexWrap:\s*"wrap"/);
  // 10px, not dc.html's 12px — the built content column is narrower than the artboard's; see the
  // comment at the call site and DEVIATION-LOG 2026-09-08.
  assert.match(SOURCE, /padding:\s*"6px 10px"/);
});

test("AccountCard's head sits on the card's own white — dc.html p14 and p15 draw no plate behind it", () => {
  const head = SOURCE.slice(SOURCE.indexOf('padding: "14px 16px 10px"'), SOURCE.indexOf("{title}"));
  assert.ok(!/background:/.test(head), "the card head regained a tinted plate the artboards do not draw");
});

test("AccountCard's optional foot is the artboard's own strip, and is absent unless passed", () => {
  assert.match(SOURCE, /\{foot != null && \(/);
  assert.match(SOURCE, /padding:\s*"10px 16px",\n\s*borderTop:\s*"1px solid rgba\(0,0,0,\.08\)"/);
});

test("bodyPadding overrides the default body pad without changing any existing caller", () => {
  assert.match(SOURCE, /bodyPadding \? \{ padding: bodyPadding \} : bodyPad \? \{ padding: "16px 20px" \} : undefined/);
});
