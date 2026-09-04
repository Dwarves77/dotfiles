// governing-files.test.mjs — the ONE contract test for the "wrong copy of the truth" defect class Wave
// GOV-SINGLE (2026-09-04) closes: before this module existed, EVERY family with a canonical runner script
// had TWO hand-maintained governing-file arrays — F28's own `GOVERNING_FILES` and that runner's own
// `*_GOVERNING_FILES` export — kept in sync (when they were kept in sync at all) only by a per-runner
// "matches F28's hardcoded entry" string-match test that only THREE of eight runners even carried. Proven
// live: `mint`'s two copies had already drifted (F28's gained the two Gate-A `src/` files PR #580 added;
// `run-mint-batch.mjs`'s own copy never did), so real population runs stamped a `harness_version` no
// landed artifact could ever match against F28's own re-hash.
//
// This file replaces every one of those per-runner parity tests (removed from run-mint-batch.test.mjs and
// run-extraction.test.mjs, the only two that had them) with ONE structural proof, run once: no runner file
// declares its own governing-file array as a literal any more, every one of them imports it from THIS
// module, and F28 imports from here too — so the "two copies" defect class cannot recur by construction,
// not by discipline.
//
// node:test + node:assert/strict, no npm deps — same no-npm-ci discipline as run-artifact.test.mjs (this
// file's sibling), CONVENTION.md, and every other harness-runs module. Wired into
// .discipline/run-test-suite.sh's fsi-app/scripts/harness-runs/*.test.mjs glob (Wave GOV-SINGLE) so F23's
// orphaned-proof ratchet does not immediately red on this file's own existence.
//
// Run: node --test scripts/harness-runs/governing-files.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { GOVERNING_FILES } from "./governing-files.mjs";
import { ALLOWED_FAMILIES } from "../lib/run-artifact.mjs";
import { GOVERNING_FILES as F28_GOVERNING_FILES } from "../../.discipline/fitness/functions/F28-harness-run-integrity.mjs";
import { SCREEN_GOVERNING_FILES } from "../mint/screen-worklist.mjs";
import { MINT_GOVERNING_FILES } from "../mint/run-mint-batch.mjs";
import { FORWARD_EVENTS_GOVERNING_FILES } from "../forward-events/run-extraction.mjs";
import { LEDGER_CONSUME_GOVERNING_FILES } from "../turns/run-ledger-consume.mjs";
import { PROPAGATION_GOVERNING_FILES } from "../turns/run-propagation-drain.mjs";
import { CHANGE_DETECTION_GOVERNING_FILES } from "../turns/run-change-detection.mjs";
import { SOURCE_SWEEP_GOVERNING_FILES } from "../turns/run-source-sweep.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FSI_ROOT = resolve(HERE, "..", "..");

function readSrc(relFromFsiRoot) {
  return readFileSync(join(FSI_ROOT, relFromFsiRoot), "utf8");
}

// ── the module itself: shape ────────────────────────────────────────────────────────────────────

test("GOVERNING_FILES keys are exactly ALLOWED_FAMILIES (kept 1:1 by construction, same invariant F28's own test already asserted before this module existed)", () => {
  assert.deepEqual(Object.keys(GOVERNING_FILES).sort(), [...ALLOWED_FAMILIES].sort());
});

test("every family's governing-file list is non-empty", () => {
  for (const family of ALLOWED_FAMILIES) {
    assert.ok(
      Array.isArray(GOVERNING_FILES[family]) && GOVERNING_FILES[family].length > 0,
      `GOVERNING_FILES.${family} must be a non-empty array`,
    );
  }
});

// ── the CONFIRMED bug this module fixes: mint carries the two Gate-A src/ files, not a pre-fix drift ──
//
// Count history: 8 (pre-GOV-SINGLE, the runner's own drifted copy) → 10 (GOV-SINGLE fix, adding the two
// src/lib/agent/ Gate-A files that F28's copy already had) → 8 again (lane DEAD-EXEC, 2026-09-04, which
// deleted the two scripts/mint/lib/ Gate-A re-export shims themselves — their only real importer,
// validate-mint-payload.mjs, and their one test importer, record-facts.npmtest.mjs, now both import the
// two src/lib/agent/ files directly, so this list's CONTENT set is unchanged; only the two now-redundant
// shim paths dropped out of it). The two src/lib/agent/ files staying present is what this test still
// protects — the count number is incidental to that, not the invariant.

test("REGRESSION PROOF: GOVERNING_FILES.mint includes the two Gate-A src/ files (the exact pair the pre-GOV-SINGLE runner copy was missing) — measured 8 entries on the live tree post-DEAD-EXEC (the two scripts/mint/lib/ re-export shims removed, 2026-09-04), not the pre-DEAD-EXEC 10 or the 12 an earlier estimate cited; the two-file PRESENCE is the confirmed invariant, not the absolute count", () => {
  assert.ok(GOVERNING_FILES.mint.includes("src/lib/agent/gate-a-scan.mjs"));
  assert.ok(GOVERNING_FILES.mint.includes("src/lib/agent/gate-a-match.mjs"));
  assert.ok(!GOVERNING_FILES.mint.includes("scripts/mint/lib/gate-a-scan.mjs"), "the re-export shim was deleted lane DEAD-EXEC (2026-09-04) — its path must not remain in the list");
  assert.ok(!GOVERNING_FILES.mint.includes("scripts/mint/lib/gate-a-match.mjs"), "the re-export shim was deleted lane DEAD-EXEC (2026-09-04) — its path must not remain in the list");
  assert.equal(GOVERNING_FILES.mint.length, 8, `expected mint's 8-file list (post-DEAD-EXEC shim removal), got ${GOVERNING_FILES.mint.length}: ${JSON.stringify(GOVERNING_FILES.mint)}`);
});

// ── F28 imports the module (never declares its own copy) ───────────────────────────────────────────

test("F28-harness-run-integrity.mjs imports GOVERNING_FILES from this module, and re-exports the SAME object", () => {
  const src = readSrc(".discipline/fitness/functions/F28-harness-run-integrity.mjs");
  assert.match(
    src,
    /from ['"].*scripts\/harness-runs\/governing-files\.mjs['"]/,
    "F28-harness-run-integrity.mjs must import GOVERNING_FILES from scripts/harness-runs/governing-files.mjs",
  );
  // Reference identity, not just deep equality — F28 must not copy/clone the object, it must import it.
  assert.equal(F28_GOVERNING_FILES, GOVERNING_FILES);
});

// ── every family runner: imports its entry, never declares a literal array ────────────────────────

// One row per runner that has a canonical script (fetch-drain has none — a Deno function this repo does
// not import as a module; meta-harness has none — its list is declared directly in governing-files.mjs,
// self-referentially, same as F28's own entry). `research-sweep.mjs`'s `RESEARCH_SWEEP_GOVERNING_FILES`
// is DELIBERATELY EXCLUDED from this table — see "research-sweep is a documented exception" below.
const RUNNERS = [
  {
    family: "screen",
    relPath: "scripts/mint/screen-worklist.mjs",
    exportName: "SCREEN_GOVERNING_FILES",
    exported: SCREEN_GOVERNING_FILES,
  },
  {
    family: "mint",
    relPath: "scripts/mint/run-mint-batch.mjs",
    exportName: "MINT_GOVERNING_FILES",
    exported: MINT_GOVERNING_FILES,
  },
  {
    family: "forward-events",
    relPath: "scripts/forward-events/run-extraction.mjs",
    exportName: "FORWARD_EVENTS_GOVERNING_FILES",
    exported: FORWARD_EVENTS_GOVERNING_FILES,
  },
  {
    family: "ledger-consume",
    relPath: "scripts/turns/run-ledger-consume.mjs",
    exportName: "LEDGER_CONSUME_GOVERNING_FILES",
    exported: LEDGER_CONSUME_GOVERNING_FILES,
  },
  {
    family: "propagation",
    relPath: "scripts/turns/run-propagation-drain.mjs",
    exportName: "PROPAGATION_GOVERNING_FILES",
    exported: PROPAGATION_GOVERNING_FILES,
  },
  {
    family: "change-detection",
    relPath: "scripts/turns/run-change-detection.mjs",
    exportName: "CHANGE_DETECTION_GOVERNING_FILES",
    exported: CHANGE_DETECTION_GOVERNING_FILES,
  },
  {
    family: "source-sweep",
    relPath: "scripts/turns/run-source-sweep.mjs",
    exportName: "SOURCE_SWEEP_GOVERNING_FILES",
    exported: SOURCE_SWEEP_GOVERNING_FILES,
  },
];

// A literal governing-file array declaration looks like `<NAME>_GOVERNING_FILES = Object.freeze([` or
// `<NAME>_GOVERNING_FILES = [` (screen's old shape, before this wave, was a plain array with no freeze).
// Matched against the runner's OWN export name specifically, not any `_GOVERNING_FILES` substring, so this
// never false-positives on an unrelated identifier.
function literalArrayPattern(exportName) {
  return new RegExp(`\\b${exportName}\\s*=\\s*(Object\\.freeze\\()?\\s*\\[`);
}

for (const { family, relPath, exportName, exported } of RUNNERS) {
  test(`${exportName} (${relPath}): re-exports GOVERNING_FILES['${family}'] by reference (imported, not copied)`, () => {
    assert.equal(exported, GOVERNING_FILES[family], `${exportName} must be the SAME array as GOVERNING_FILES['${family}'], not a clone`);
  });

  test(`${relPath}: imports from governing-files.mjs, and contains NO literal array for ${exportName}`, () => {
    const src = readSrc(relPath);
    assert.match(
      src,
      /from ['"].*harness-runs\/governing-files\.mjs['"]/,
      `${relPath} must import GOVERNING_FILES from scripts/harness-runs/governing-files.mjs`,
    );
    assert.doesNotMatch(
      src,
      literalArrayPattern(exportName),
      `${relPath} must not declare ${exportName} as a literal array — it must import its entry from governing-files.mjs instead`,
    );
  });
}

// ── repo-wide sweep: no OTHER file re-introduces a literal governing-file array either ─────────────
//
// The per-file tests above prove the SEVEN known runners are fixed. This sweep proves nothing else in
// scripts/ (or .discipline/) quietly grew a competing literal copy — the exact "wrong copy of the truth"
// defect class this wave exists to close, checked structurally rather than by remembering every file name.
//
// research-sweep.mjs IS a documented, deliberate exception (see the next test below) — it is NOT a copy of
// any GOVERNING_FILES family entry; it is a genuinely different, "this subject's own" governing-file list
// for a subject that shares the `source-sweep` harness_family id but is not the family's own canonical
// runner. governing-files.mjs itself legitimately contains every literal array (it is the source) and is
// excluded from the sweep for that reason.
function walkMjsFiles(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.name === "node_modules" || e.name.startsWith(".") || e.name === "_archive") continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) walkMjsFiles(full, out);
    else if (e.isFile() && e.name.endsWith(".mjs") && !e.name.endsWith(".test.mjs")) out.push(full);
  }
  return out;
}

test("repo-wide sweep: no scripts/**/*.mjs file (other than governing-files.mjs and the documented research-sweep.mjs exception) declares a literal `*_GOVERNING_FILES` array", () => {
  const scriptsRoot = join(FSI_ROOT, "scripts");
  const exempt = new Set([
    join(scriptsRoot, "harness-runs", "governing-files.mjs"),
    join(scriptsRoot, "turns", "research-sweep.mjs"),
  ]);
  const offenders = [];
  for (const file of walkMjsFiles(scriptsRoot)) {
    if (exempt.has(file)) continue;
    const src = readFileSync(file, "utf8");
    if (/\b[A-Z][A-Z0-9_]*_GOVERNING_FILES\s*=\s*(Object\.freeze\()?\s*\[/.test(src)) {
      offenders.push(file);
    }
  }
  assert.deepEqual(offenders, [], `unexpected literal governing-file array(s) found in: ${offenders.join(", ")}`);
});

// ── research-sweep.mjs: a documented, deliberate exception, not a regression ────────────────────────

test("research-sweep.mjs's RESEARCH_SWEEP_GOVERNING_FILES remains a literal, independent list by design (documented in its own header: intentionally DIFFERENT from GOVERNING_FILES['source-sweep'])", () => {
  const src = readSrc("scripts/turns/research-sweep.mjs");
  assert.match(src, /RESEARCH_SWEEP_GOVERNING_FILES\s*=\s*Object\.freeze\(\s*\[/);
  assert.match(src, /Intentionally DIFFERENT from CONVENTION\.md's `source-sweep` row/);
});
