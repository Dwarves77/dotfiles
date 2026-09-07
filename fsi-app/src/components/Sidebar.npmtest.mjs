// Structural regression test for src/components/Sidebar.tsx — operator audit item 4.2 (2026-09-07,
// CLOSED ruling): "Nav card top margin becomes 20px (margin: 20px 0 16px 16px) so it aligns with
// the content column's 20px top padding. Fix it in the frame, once." Source-text regression (no
// JSX render harness in this repo — see WatchButton.npmtest.mjs's own header).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "Sidebar.tsx"),
  "utf8"
);

test("desktop nav card margin is 20px 0 16px 16px (item 4.2)", () => {
  assert.match(SOURCE, /margin: "20px 0 16px 16px"/);
  assert.doesNotMatch(SOURCE, /margin: "16px 0 16px 16px"/);
});

test("frame fix (2026-09-07, operator report 'the side navigation bar does not reach the length of the page'): desktop nav card stretches to the frame's own height, not a viewport-derived maxHeight", () => {
  // The prior fix (`maxHeight: calc(100vh - 36px)`, no align-self) tracked the raw viewport
  // instead of the frame row's actual box, so the card ended at its own content height whenever
  // those two differed. The card is now `align-self: stretch` with `height: auto` and carries no
  // `maxHeight` at all — it always equals the frame row's real box, the same way the content
  // column (AppShell's other flex item in the same row) already does.
  assert.match(SOURCE, /alignSelf: "stretch"/);
  assert.match(SOURCE, /height: "auto"/);
  // `maxHeight:` (the JS object property) must be gone from the aside's own style object; the
  // word can still appear in prose comments explaining what the OLD, defective code used to do.
  assert.doesNotMatch(SOURCE, /maxHeight:\s*"/);
});

test("nav body is flex:1 so the footer (Account / Admin) sits at the card's foot on a stretched, long page", () => {
  assert.match(SOURCE, /<nav className="py-3 px-2\.5 flex-1 flex flex-col/);
});

test("fix58-tokens (2026-09-07, design audit B95-B98): desktop card section label is 700/.14em (dc.html p1), not 800/.12em", () => {
  assert.match(SOURCE, /fontWeight:\s*700,\s*\n\s*letterSpacing:\s*"0\.14em",/);
  assert.doesNotMatch(SOURCE, /fontWeight:\s*drawer \? 700 : 800/);
});

test("fix58-tokens: active nav row (card variant) uses the inset 3px spine box-shadow, not border-left, and weighs 700 not 800", () => {
  assert.match(SOURCE, /boxShadow:\s*active \? "inset 3px 0px 0px var\(--brand\)" : "none"/);
  assert.match(SOURCE, /fontWeight:\s*active \? 700 : 600/);
  assert.doesNotMatch(SOURCE, /borderLeft:\s*`2px solid \$\{active/);
});

// Nav footer third-row defect (operator-confirmed, artboard 02 / R2, 2026-09-07): production
// rendered THREE footer rows (Account, Admin, a third "jasonlosh ▾" UserMenu utility row holding
// sign-out and its other items). R2 draws exactly two unlabelled rows below a divider. Coordinator
// default: delete the third row's markup; the Account row becomes the trigger for the same menu
// component, anchored to the row, so no function is lost.

test("nav footer has no third row: the old UserMenu component is gone, not merely unmounted", () => {
  // Deleted, not hidden (CLAUDE.md rule 13) — the file itself no longer exists.
  assert.throws(() => readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), "auth", "UserMenu.tsx"),
    "utf8",
  ));
  assert.doesNotMatch(SOURCE, /UserMenuLazy/);
  assert.doesNotMatch(SOURCE, /from "@\/components\/auth\/UserMenu"/);
});

test("footer renders at most two rows in the card variant: the Account trigger + the role-gated Admin link, nothing beneath them", () => {
  // The card branch closes right after the Admin `Link` — no third sibling element (a stray
  // `<div>`/component) between it and the footer's own closing `</div>`.
  const footerBlock = SOURCE.slice(SOURCE.indexOf("const footer = (variant"), SOURCE.indexOf("return (\n    <>"));
  const afterAdminClose = footerBlock.slice(footerBlock.lastIndexOf("</Link>"));
  assert.match(afterAdminClose, /^<\/Link>\s*\)\}\s*<\/div>\s*\);\s*};/);
});

test("the Account row is the menu trigger: a <button> (not a <Link>) opening UserMenuDropdown, anchored to the row, when a user is present", () => {
  assert.match(SOURCE, /import UserMenuDropdown from "@\/components\/auth\/UserMenuDropdown"|import\("@\/components\/auth\/UserMenuDropdown"\)/);
  assert.match(SOURCE, /const UserMenuDropdownLazy = dynamic\(\(\) => import\("@\/components\/auth\/UserMenuDropdown"\)/);
  assert.match(SOURCE, /\{!drawer && user \? \(/);
  assert.match(SOURCE, /<button[\s\S]{0,400}?onClick=\{\(\) => setAccountMenuOpen/);
  assert.match(SOURCE, /aria-haspopup="menu"/);
  assert.match(SOURCE, /aria-expanded=\{accountMenuOpen\}/);
});

test("the Account trigger's menu contains Sign out (via UserMenuDropdown's onSignOut wiring)", () => {
  assert.match(SOURCE, /<UserMenuDropdownLazy[\s\S]{0,400}?onSignOut=\{signOut\}/);
  const dropdownSource = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), "auth", "UserMenuDropdown.tsx"),
    "utf8",
  );
  assert.match(dropdownSource, /onClick=\{onSignOut\}/);
  assert.match(dropdownSource, /Sign out/);
});

test("the Account row keeps a 44px hit target in both the card trigger and the drawer link", () => {
  assert.match(SOURCE, /minHeight: 44,\s*\n\s*padding: "12px 14px 6px",\s*\n\s*color: "var\(--ink\)",\s*\n\s*background: accountMenuOpen/);
  assert.match(SOURCE, /\? \{ minHeight: 44, padding: "0 10px", color: "var\(--ink\)" \}\s*\n\s*: \{ minHeight: 44, padding: "12px 14px 6px", color: "var\(--ink\)" \}/);
});
