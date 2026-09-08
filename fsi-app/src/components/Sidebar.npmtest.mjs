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

test("nav body is flex:1 so the footer (the single user row) sits at the card's foot on a stretched, long page", () => {
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

// Nav footer history: production first shipped THREE footer rows (Account, Admin, a third
// "jasonlosh ▾" UserMenu utility row) against R2's two unlabelled rows — a coordinator default
// collapsed that to two, then the operator ruling of 2026-09-07 collapsed it to ONE (the logged-in
// person's name, everything else inside its menu). The operator ruling of 2026-09-08 REVERSES that
// one-row ruling and restores the artboard's TWO rows: "Account" with the workspace name
// right-aligned, and "Admin" with the OWNER badge. What 2026-09-08 does NOT reverse is 2026-09-07's
// "signout lives in account". The Account row still opens the menu that holds Workspace profile,
// Settings and Sign out. A THIRD row stays forbidden throughout.

test("the old UserMenu component (the coordinator-default lane's deleted third row) stays gone, not merely unmounted", () => {
  assert.throws(() => readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), "auth", "UserMenu.tsx"),
    "utf8",
  ));
  assert.doesNotMatch(SOURCE, /UserMenuLazy/);
  assert.doesNotMatch(SOURCE, /from "@\/components\/auth\/UserMenu"/);
});

test("footer renders TWO rows (2026-09-08, reversing 2026-09-07): an Account row and a role-gated Admin row carrying the role badge", () => {
  const footerBlock = SOURCE.slice(SOURCE.indexOf("const footer = (variant"), SOURCE.indexOf("return (\n    <>"));
  assert.match(footerBlock, />Account</);
  assert.match(footerBlock, /\{isAdmin && \(/);
  assert.match(footerBlock, />Admin</);
  assert.match(footerBlock, /href="\/admin"/);
  // The badge word is the caller's real role, never a hardcoded OWNER.
  assert.match(footerBlock, /\{userRole\}/);
  assert.doesNotMatch(footerBlock, />OWNER</);
});

test("no THIRD footer row: the container's only children are the Account row and the isAdmin-gated Admin row", () => {
  const footerBlock = SOURCE.slice(SOURCE.indexOf("const footer = (variant"), SOURCE.indexOf("return (\n    <>"));
  // Everything after the Admin row's closing </Link> is the block's own close, with no sibling row.
  const afterAdminClose = footerBlock.slice(footerBlock.lastIndexOf("</Link>"));
  assert.match(afterAdminClose, /^<\/Link>\s*\)\}\s*<\/div>\s*\);\s*};/);
  // Exactly two direct-child row constructs in the block: the ternary and the isAdmin gate.
  assert.equal((footerBlock.match(/\{isAdmin && \(/g) || []).length, 1);
});

test("both rows apply to BOTH variants (one implementation): neither branch is desktop-only", () => {
  assert.doesNotMatch(SOURCE, /\{!drawer && user \? \(/);
  assert.match(SOURCE, /\{user \? \(/);
});

test("the Account row is the menu trigger: a <button> (not a <Link>) opening UserMenuDropdown, anchored to the row, when a user is present", () => {
  assert.match(SOURCE, /const UserMenuDropdownLazy = dynamic\(\(\) => import\("@\/components\/auth\/UserMenuDropdown"\)/);
  assert.match(SOURCE, /<button[\s\S]{0,400}?onClick=\{\(\) => setAccountMenuOpen/);
  assert.match(SOURCE, /aria-haspopup="menu"/);
  assert.match(SOURCE, /aria-expanded=\{accountMenuOpen\}/);
});

test("the Account row reads 'Account' with the workspace name right-aligned, muted (artboard p1)", () => {
  assert.match(SOURCE, /<span style=\{\{ fontSize: 14, fontWeight: 700 \}\}>Account<\/span>/);
  assert.match(SOURCE, /\{orgName \|\| "—"\}/);
});

test("the Admin row navigates to /admin carrying its attention count, and the menu no longer repeats Admin panel", () => {
  assert.match(SOURCE, /showAdminDot[\s\S]{0,200}?need attention/);
  assert.match(SOURCE, /formatNumber\(adminAttentionTotal\)/);
  const dropdownSource = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), "auth", "UserMenuDropdown.tsx"),
    "utf8",
  );
  assert.doesNotMatch(dropdownSource, /Admin panel/);
  assert.doesNotMatch(dropdownSource, /href="\/admin"/);
});

test("the trigger's menu still holds Sign out, Workspace profile and Settings (2026-09-07 'signout lives in account', NOT reversed)", () => {
  assert.match(SOURCE, /<UserMenuDropdownLazy[\s\S]{0,400}?onSignOut=\{signOut\}/);
  const dropdownSource = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), "auth", "UserMenuDropdown.tsx"),
    "utf8",
  );
  assert.match(dropdownSource, /onClick=\{onSignOut\}/);
  assert.match(dropdownSource, /Sign out/);
  assert.match(dropdownSource, /Workspace profile/);
  assert.match(dropdownSource, /Settings/);
  // Menu anchored ABOVE the row ("opens upward at the foot, as production does").
  assert.match(dropdownSource, /bottom-full/);
  // Items are 44px min-height / 12px padding, not the old cramped px-4 py-2 rows.
  assert.match(dropdownSource, /minHeight: 44, padding: 12,/);
});

test("both footer rows keep a 44px hit target, the nav card's 10px horizontal padding and 8px gaps (dc.html p1 measures)", () => {
  assert.match(SOURCE, /const rowStyle: React\.CSSProperties = \{\s*\n\s*minHeight: 44,\s*\n\s*padding: "0 10px",\s*\n\s*gap: 8,/);
  assert.match(SOURCE, /style=\{rowStyle\}/);
  assert.match(SOURCE, /style=\{\{ fontSize: 14, fontWeight: 700 \}\}/);
});

test("the OWNER badge carries dc.html p1's own measures: 9.5px / 700 / .08em in a 1px rgba(0,0,0,.2) border at radius 4", () => {
  assert.match(SOURCE, /fontSize: 9\.5,\s*\n\s*fontWeight: 700,\s*\n\s*letterSpacing: "0\.08em",/);
  assert.match(SOURCE, /border: "1px solid rgba\(0,0,0,\.2\)",\s*\n\s*borderRadius: 4,/);
});
