// Tests for OrganizationsTable.tsx (lane admin60, 2026-09-08, artboard 13).
//
// Two things are checked, and they are different in kind.
//
// 1. `membersCellLabel` is real logic this lane introduced: the artboard's
//    MEMBERS cell reads "2 · owners", the count AND the role summary in one
//    cell, which is where the ROLES column's data went when that column (which
//    dc.html p13 does not draw) was removed. It is a pure function, so it is
//    exercised directly rather than through the source text.
// 2. The rest is a structural regression check on the containment fix: ONE track
//    list shared by header and rows. The defect the train-59 fold reported was
//    the LAST ACTIVITY value clipped at the card's right edge, and its cause was
//    a header grid and a row grid with DIFFERENT track lists whose row minimum
//    (~858px) exceeded the ~780px content column. A second track list
//    reappearing anywhere in this file is that defect coming back.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const DIR = dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(resolve(DIR, "OrganizationsTable.tsx"), "utf8");
// Read from the SoT rather than typed here, so the two cannot drift silently.
const FORMAT_SOURCE = readFileSync(resolve(DIR, "../../lib/format.ts"), "utf8");
const FIXED_LOCALE = /FIXED_LOCALE\s*=\s*"([^"]+)"/.exec(FORMAT_SOURCE)[1];

// Compile just the module to JS and pull the pure export out of it, so the
// assertions below run the real function rather than a copy of it.
const { membersCellLabel } = await import(
  "data:text/javascript;base64," +
    Buffer.from(
      ts.transpileModule(SOURCE, {
        compilerOptions: { jsx: ts.JsxEmit.Preserve, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
      })
        .outputText // the JSX-bearing component is never called here; strip the imports it needs
        .replace(/^import[\s\S]*?;$/gm, "")
        // FOLD-61: stripping the imports also strips `formatNumber`, which lane opsclip's
        // "every rendered integer carries its separator" pass added to this module, so the real
        // function threw ReferenceError and four green tests went red on a change that was
        // correct. Rather than stub a second formatter (a copy of a SoT is the thing this repo
        // forbids), the ONE line of src/lib/format.ts is re-declared here from the same
        // FIXED_LOCALE, and `formatNumber agrees with src/lib/format.ts` below asserts the two
        // still say the same thing, so a change to the real formatter fails this file loudly.
        .replace(/^/, `const formatNumber = (v, o) => v.toLocaleString(${JSON.stringify(FIXED_LOCALE)}, o);\n`)
        .replace(/export function OrganizationsTable[\s\S]*$/m, "")
    ).toString("base64")
);

const roles = (o) => ({ owner: 0, admin: 0, viewer: 0, member: 0, other: 0, ...o });

test("the MEMBERS cell reads the artboard's own '2 · owners'", () => {
  assert.equal(membersCellLabel(2, roles({ owner: 2 })), "2 · owners");
});

test("several roles are listed in the fixed order owner, admin, viewer, member", () => {
  assert.equal(
    membersCellLabel(4, roles({ member: 1, owner: 1, viewer: 1, admin: 1 })),
    "4 · owners, admins, viewers, members"
  );
});

test("an unrecognised role is summarised as 'other', never dropped", () => {
  assert.equal(membersCellLabel(2, roles({ owner: 1, other: 1 })), "2 · owners, other");
});

test("no memberships renders the bare count, never a fabricated role summary", () => {
  assert.equal(membersCellLabel(0, roles({})), "0");
  assert.equal(membersCellLabel(3, undefined), "3");
});

test("header and rows share ONE track list, dc.html p13's own, so no cell can be clipped", () => {
  const tracks = SOURCE.match(/width: "(1fr|\d+px)"/g);
  assert.deepEqual(tracks, [
    'width: "1fr"',
    'width: "120px"',
    'width: "110px"',
    'width: "100px"',
    'width: "120px"',
    'width: "44px"',
  ]);
  // RowTable derives the header strip and every row from that one array; a
  // second gridTemplateColumns declared in this file would be the old defect.
  assert.equal(/gridTemplateColumns/.test(SOURCE), false);
});

test("no ROLES column: the artboard's five headers and a blank action column", () => {
  const labels = [...SOURCE.matchAll(/label: "([^"]*)"/g)].map((m) => m[1]);
  assert.deepEqual(labels, ["Name", "Slug", "Plan", "Members", "Last activity", ""]);
});

test("the empty row list renders the Absence convention, never a fabricated zero", () => {
  assert.match(SOURCE, /<Absence reason="connect data" \/>/);
});

test("the formatNumber this file re-declares agrees with src/lib/format.ts, for the values asserted above", () => {
  // The guard on the shim: src/lib/format.ts pins ONE locale and delegates to toLocaleString, and
  // this file re-declares exactly that. If formatNumber ever becomes more than a locale pin, this
  // fails and the shim gets rewritten rather than quietly disagreeing with the product.
  assert.match(FORMAT_SOURCE, /export function formatNumber\(value: number, options\?: Intl\.NumberFormatOptions\): string \{\s*return value\.toLocaleString\(FIXED_LOCALE, options\);/);
  for (const n of [0, 2, 3, 4, 1135, 1000000]) {
    assert.equal(n.toLocaleString(FIXED_LOCALE), membersCellLabel(n, undefined));
  }
});
