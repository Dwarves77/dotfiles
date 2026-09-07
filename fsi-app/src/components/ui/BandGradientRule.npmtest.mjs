// Repo-wide regression test for operator audit item 5.2 (2026-09-07, CLOSED ruling): "the
// band-proportion gradient rule stays, but ONLY in one place sitewide: the 3px cap above 'Caro's
// Ledge' in the left nav card (and its mobile equivalents, the 56px top bar and the drawer). Every
// other 3px rule in the product ... uses the DARK GREY GRADATION [SectionRule] ... One coloured
// rule per screen." This walks every .tsx source file under src/ and asserts <BandGradientRule
// mounts nowhere but the three ruled locations (Sidebar's desktop nav card + mobile drawer,
// TopBar's mobile top bar) — a fourth mount anywhere else is exactly the regression this guards.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = resolve(here, "..", "..");

const ALLOWED_MOUNT_FILES = new Set([
  resolve(SRC_ROOT, "components", "Sidebar.tsx"),
  resolve(SRC_ROOT, "components", "layout", "TopBar.tsx"),
]);

// Counts only the real JSX mount `<BandGradientRule ... />` on a code line — ignores mentions
// inside `//` line comments, `/** ... */` block comments, or backtick-quoted prose (both
// AppShell.tsx and TopBar.tsx name the component in their own doc comments; that is documentation,
// not a fourth mount).
function countRealMounts(text) {
  let count = 0;
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (line.startsWith("//") || line.startsWith("*") || line.startsWith("/*")) continue;
    if (/`<BandGradientRule/.test(line)) continue;
    if (/^\s*<BandGradientRule\b/.test(rawLine)) count += 1;
  }
  return count;
}

function walk(dir, out) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (name.endsWith(".tsx")) out.push(full);
  }
}

test("<BandGradientRule /> mounts only in Sidebar.tsx and TopBar.tsx sitewide", () => {
  const files = [];
  walk(SRC_ROOT, files);
  const offenders = [];
  for (const file of files) {
    if (file === resolve(SRC_ROOT, "components", "ui", "BandGradientRule.tsx")) continue;
    const text = readFileSync(file, "utf8");
    const mounts = countRealMounts(text);
    if (mounts > 0 && !ALLOWED_MOUNT_FILES.has(file)) {
      offenders.push(`${file} (${mounts} mount${mounts === 1 ? "" : "s"})`);
    }
  }
  assert.deepEqual(offenders, [], `BandGradientRule mounted outside the ruled locations:\n${offenders.join("\n")}`);
});

test("Sidebar.tsx mounts BandGradientRule exactly twice (desktop nav card cap + mobile drawer cap)", () => {
  const text = readFileSync(resolve(SRC_ROOT, "components", "Sidebar.tsx"), "utf8");
  const mounts = countRealMounts(text);
  assert.equal(mounts, 2);
});

test("TopBar.tsx mounts BandGradientRule exactly once (the 56px mobile top bar cap)", () => {
  const text = readFileSync(resolve(SRC_ROOT, "components", "layout", "TopBar.tsx"), "utf8");
  const mounts = countRealMounts(text);
  assert.equal(mounts, 1);
});
