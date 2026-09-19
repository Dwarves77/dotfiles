#!/usr/bin/env node
// governing-files.mjs — THE SINGLE SOURCE for every harness family's governing-file list (Wave
// GOV-SINGLE, 2026-09-04).
//
// WHY THIS EXISTS. Before this file, the SAME fact — "which files' content hash is this family's
// harness_version" — had TWO homes for every family with a canonical runner script: F28's own
// GOVERNING_FILES constant (.discipline/fitness/functions/F28-harness-run-integrity.mjs, the copy F28's
// rule (c) staleness coupling actually re-hashes and enforces against) and that runner's own
// `*_GOVERNING_FILES` export (the copy the runner hashes ITSELF with, to stamp `harness_version` on the
// artifacts it writes). Nothing forced the two to agree beyond a per-runner "matches F28's hardcoded
// entry" test that only THREE of eight runners even carried, and — proven live, 2026-09-04 — the two
// copies for `mint` had already drifted: F28's `GOVERNING_FILES.mint` gained
// `src/lib/agent/gate-a-scan.mjs` and `gate-a-match.mjs` (the Gate-A single-source collapse, PR #580)
// while `run-mint-batch.mjs`'s `MINT_GOVERNING_FILES` never did, because nothing checked the two against
// each other for that pair. Consequence: `mint-run-024/025/026` all stamped `harness_version
// sha256:4f09523532bb7aee` (the runner's own pre-fix 8-file hash — independently reproduced by hashing its
// exact pre-fix file list against this tree) while F28 (and the mint `PENDING-RUN.md` marker) compute
// `sha256:28c98ae2309a416a`, the 10-file hash — the mint marker can never be discharged by a real run
// until the two copies agree, because F28 rule (c) requires an artifact's OWN recorded `harness_version`
// to match the hash F28 itself computes. This is the "wrong copy of the truth" pattern
// `meta-harness-run-008` names as the wave's recurring defect, applied to itself.
//
// THE FIX: one array, here, per family. F28 imports it (see that file's own header for why a fitness
// function importing from `scripts/` is fine — it already did, for `run-artifact.mjs` and, before this
// change, for `screen-worklist.mjs`'s `SCREEN_GOVERNING_FILES`; no fitness/discipline rule forbids a
// cross-import from `.discipline/` into `scripts/`, and `getRepoRoot()`-relative resolution is unaffected
// by which file the import comes from). Every family's own canonical runner script (screen-worklist.mjs,
// run-mint-batch.mjs, run-extraction.mjs, run-ledger-consume.mjs, run-propagation-drain.mjs,
// run-change-detection.mjs, run-source-sweep.mjs) imports its ONE entry from here and re-exports it under
// its old `*_GOVERNING_FILES` name, so every existing importer/test keeps working unchanged and every
// runner's own self-hash (the thing it stamps onto the artifacts it writes) and F28's re-hash (the thing
// rule (c) checks a landed artifact against) are now, by construction, the identical array — not two
// hand-maintained copies a coordinator has to remember to keep in sync.
//
// WHERE THIS LIVES, AND WHY (coordinator's stated preference, verified against the fitness runner's own
// module-resolution rules before landing here): `scripts/harness-runs/` — the harness layer's own home,
// next to `CONVENTION.md` (the markdown table this module is now the machine-checked source for) — NOT
// under `.discipline/`. `.discipline/fitness/functions/F28-harness-run-integrity.mjs` already imports
// `scripts/lib/run-artifact.mjs` directly (`hashHarnessVersion`, `validateRunArtifact`, `ALLOWED_FAMILIES`)
// and, before this change, `scripts/mint/screen-worklist.mjs` (`SCREEN_GOVERNING_FILES`) — a fitness
// function importing from `scripts/` is therefore already the established pattern this repo's own gate
// runs on every push, not a new exception this file introduces. No F-function in
// `.discipline/fitness/functions/` forbids a cross-import in either direction (checked: F25's
// module-liveness import graph tracks orphaned MODULES, not import DIRECTION; F27's producer-seam-proof
// is about `resolveSpecifier`/`isTestFile` reuse, an unrelated seam). This module itself has NO imports
// (pure data, filesystem-free, $0, same discipline every other harness-run module — `run-artifact.mjs`,
// `screen-worklist.mjs` — already carries) — it cannot introduce a cycle: F28 and every runner import
// FROM here, nothing here imports back.
//
// SELF-REFERENTIAL, LIKE F28: this file is itself named in meta-harness's own governing files (see
// family-registry.mjs's family.json descriptors) - it derives what governs every family, exactly the
// role F28-harness-run-integrity.mjs already held alone (see scripts/harness-runs/meta-harness/
// PENDING-RUN.md, re-stamped alongside this change, for the hash this change moves and the run that
// will supersede it).
//
// LANE N2 (2026-09-19, build plan section 6.8, Rule A: "a harness family is a directory with a
// descriptor, never a line in three shared files"). Before this lane, GOVERNING_FILES was a hand-written
// object literal, one entry per family, and registering a new family meant appending to this SAME object
// (plus ALLOWED_FAMILIES in run-artifact.mjs, plus two places in CONVENTION.md), the exact shared
// insertion point that made three lanes (M8, M9b, M9a) collide on 2026-09-18 registering three different
// families in the same window. GOVERNING_FILES is now DERIVED from FAMILIES (scripts/harness-runs/
// family-registry.mjs), which reads one family.json descriptor per family directory: registering a family
// now means adding a new subdirectory and its own family.json, and this file, run-artifact.mjs's
// ALLOWED_FAMILIES, and CONVENTION.md's per-family enumeration are none of them touched. The per-family
// prose that used to sit as a comment above each entry here now lives in that family's own family.json,
// under "rationale", in the family's own words.
//
// ONE deliberate exception, stated here and in the lane's own report: GOVERNING_FILES['meta-harness']
// additionally carries every family's own scripts/harness-runs/<family>/family.json path (sorted,
// appended after the five files family.json itself lists for meta-harness). Reason: before this lane, a
// registration moved the meta-harness family's own harness_version because it edited this file
// (governing-files.mjs, one of meta-harness's own governing files) directly. After this lane, a
// registration edits only its own family.json and touches nothing this file's own governing-file list
// already watched, so without this addition, "the loop applies to itself" (CONVENTION.md) would stop
// holding: registering a family would no longer move meta-harness's own hash the way it always has. Every
// family's family.json, including meta-harness's own, is added to the watch list so that registering ANY
// family (adding its descriptor) is still, structurally, a change to what meta-harness watches.
//
// CONVENTION.md's directory-layout section documents this derivation for a human reader; it no longer
// carries a hand-maintained per-family table to drift from this module (see that file's own "Registering
// a family" section).
//
// No I/O side effects on import beyond FAMILIES's own (family-registry.mjs reads the family.json files
// once, at import time, the same "read once, freeze, export" shape this module and run-artifact.mjs
// already used). No network, no DB.

import { FAMILIES } from './family-registry.mjs';

/**
 * Governing files per harness family, fsi-app-relative, the content `hashHarnessVersion`
 * (scripts/lib/run-artifact.mjs) hashes into that family's `harness_version`. DERIVED from FAMILIES
 * (family-registry.mjs): F28 imports this whole object; every family's own canonical runner script
 * imports its one entry and re-exports it under its historical `*_GOVERNING_FILES` name, unchanged by
 * this lane.
 */
function deriveGoverningFiles(families) {
  const base = Object.fromEntries(
    families.map((f) => [f.family, Object.freeze([...f.governing_files])]),
  );

  // The one deliberate addition described above: meta-harness watches every family's own descriptor file
  // too, sorted by family name so the list is deterministic regardless of FAMILIES's own sort order.
  const descriptorPaths = families
    .map((f) => `scripts/harness-runs/${f.family}/family.json`)
    .sort();

  return Object.freeze({
    ...base,
    'meta-harness': Object.freeze([...(base['meta-harness'] ?? []), ...descriptorPaths]),
  });
}

export const GOVERNING_FILES = deriveGoverningFiles(FAMILIES);
