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
// collapsed that to two (Account as the menu trigger, Admin alongside it). Operator ruling
// 2026-09-07 then superseded R2 itself: "signout lives in account, keep it there" / "we don't need
// separate Account and Admin buttons visible if they pop up as options when you click the
// logged-in person's name" / "too tight". The footer is now ONE row (both variants, one
// implementation) — the logged-in person's name — opening the same UserMenuDropdown.

test("the old UserMenu component (the coordinator-default lane's deleted third row) stays gone, not merely unmounted", () => {
  assert.throws(() => readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), "auth", "UserMenu.tsx"),
    "utf8",
  ));
  assert.doesNotMatch(SOURCE, /UserMenuLazy/);
  assert.doesNotMatch(SOURCE, /from "@\/components\/auth\/UserMenu"/);
});

test("footer renders exactly one row: no separate Account link, no separate Admin link/OWNER badge, in EITHER variant", () => {
  const footerBlock = SOURCE.slice(SOURCE.indexOf("const footer = (variant"), SOURCE.indexOf("return (\n    <>"));
  // No role-gated Admin row left at all — `isAdmin &&` no longer gates any footer markup.
  assert.doesNotMatch(footerBlock, /isAdmin &&/);
  assert.doesNotMatch(footerBlock, />Admin</);
  assert.doesNotMatch(footerBlock, /OWNER/);
  // The two branches (signed-in trigger vs. signed-out fallback link) are the ONLY footer content —
  // the block closes right after the ternary's fallback `</Link>`, no sibling row after it.
  const afterFallbackClose = footerBlock.slice(footerBlock.lastIndexOf("</Link>"));
  assert.match(afterFallbackClose, /^<\/Link>\s*\)\}\s*<\/div>\s*\);\s*};/);
});

test("the footer row applies to BOTH variants (one implementation): the signed-in branch is not desktop-only", () => {
  // Was `{!drawer && user ? (` (coordinator-default lane, desktop-only trigger) — operator ruling
  // extends the single-row trigger to the drawer too.
  assert.doesNotMatch(SOURCE, /\{!drawer && user \? \(/);
  assert.match(SOURCE, /\{user \? \(/);
});

test("the footer row is the menu trigger: a <button> (not a <Link>) opening UserMenuDropdown, anchored to the row, when a user is present", () => {
  assert.match(SOURCE, /const UserMenuDropdownLazy = dynamic\(\(\) => import\("@\/components\/auth\/UserMenuDropdown"\)/);
  assert.match(SOURCE, /<button[\s\S]{0,400}?onClick=\{\(\) => setAccountMenuOpen/);
  assert.match(SOURCE, /aria-haspopup="menu"/);
  assert.match(SOURCE, /aria-expanded=\{accountMenuOpen\}/);
});

test("the row shows the logged-in person's name (avatar glyph + name) with the workspace name right-aligned, muted", () => {
  assert.match(SOURCE, /import \{ User \} from "lucide-react"/);
  assert.match(SOURCE, /<User size=\{16\}/);
  assert.match(SOURCE, /const displayName = user\?\.email\?\.split\("@"\)\[0\] \|\| "User"/);
  assert.match(SOURCE, /\{displayName\}/);
  assert.match(SOURCE, /\{orgName \|\| "—"\}/);
});

test("the trigger's menu contains Sign out plus Workspace profile / Admin panel / Settings (via UserMenuDropdown's own props)", () => {
  assert.match(SOURCE, /<UserMenuDropdownLazy[\s\S]{0,400}?onSignOut=\{signOut\}/);
  const dropdownSource = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), "auth", "UserMenuDropdown.tsx"),
    "utf8",
  );
  assert.match(dropdownSource, /onClick=\{onSignOut\}/);
  assert.match(dropdownSource, /Sign out/);
  assert.match(dropdownSource, /Workspace profile/);
  assert.match(dropdownSource, /Admin panel/);
  assert.match(dropdownSource, /Settings/);
  // Menu anchored ABOVE the row ("opens upward at the foot, as production does").
  assert.match(dropdownSource, /bottom-full/);
  // Items are 44px min-height / 12px padding, not the old cramped px-4 py-2 rows.
  assert.match(dropdownSource, /minHeight: 44, padding: 12,/);
});

test("the footer row keeps a 44px hit target, the nav card's 10px horizontal padding, 8px gaps, 14px text", () => {
  assert.match(SOURCE, /minHeight: 44,\s*\n\s*padding: "0 10px",\s*\n\s*gap: 8,\s*\n\s*color: "var\(--ink\)",\s*\n\s*background: accountMenuOpen/);
  assert.match(SOURCE, /style=\{\{ fontSize: 14, fontWeight: 700 \}\}/);
  assert.match(SOURCE, /style=\{\{ minHeight: 44, padding: "0 10px", gap: 8, color: "var\(--ink\)" \}\}/);
});
