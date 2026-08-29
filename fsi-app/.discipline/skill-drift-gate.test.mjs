// SKILL-DRIFT GATE (U8, flywheel build plan 2026-08-10) — proof for skill-contract-map.mjs.
//
// Two things must be shown, mirroring execution-wiring.test.mjs's pattern (real-repo positive proof +
// synthetic negative proof that the mechanism actually discriminates, not rubber-stamps):
//
//   1. REAL-REPO PROOF: checkDrift() run against THIS checkout, right now, is clean (ok:true). This is the
//      live assertion that PINNED_MANIFEST in skill-contract-map.mjs still matches the actual skill files
//      and citations under fsi-app/src/ and fsi-app/scripts/ — if someone edits a governing skill file or a
//      citing code comment without updating the manifest, THIS assertion is what reds.
//
//   2. SEEDED-DRIFT PROOF (the negative test the unit's proof clause demands): checkManifestDrift() is the
//      manifest-parameterized core (see skill-contract-map.mjs) so it can be exercised against a small
//      synthetic fixture repo built in a temp directory — never the real repo, so this test cannot mutate
//      anything it doesn't own. Each of the four drift types skill-contract-map.mjs detects is seeded
//      independently and MUST turn the corresponding check red; a clean fixture (no seeding) MUST stay green,
//      which is the control that proves the seeded cases are the reason for the failure, not an unrelated bug.
//
// Pure: fs-only (temp dir under os.tmpdir(), cleaned up after each test), no DB, no network — safe for the
// no-npm discipline suite (glob-portability's node:-builtins-and-relative-imports rule).

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  checkDrift,
  checkManifestDrift,
  scanCitations,
  hashFileContent,
  resolveSkillPath,
  listSkillSlugs,
  PINNED_MANIFEST,
} from "./governance/skill-contract-map.mjs";

// ---------------------------------------------------------------------------------------------------------
// 1. REAL-REPO PROOF
// ---------------------------------------------------------------------------------------------------------

test("skill-contract-map: PINNED_MANIFEST matches this checkout right now (no drift)", () => {
  const { ok, problems } = checkDrift();
  assert.equal(
    ok, true,
    `skill-contract-map drift detected — a governing skill file or a citing code comment changed without ` +
      `PINNED_MANIFEST in skill-contract-map.mjs being updated:\n` +
      problems.map((p) => `  [${p.type}] ${p.skill}${p.file ? " <- " + p.file : ""}: ${p.detail}`).join("\n"),
  );
});

test("skill-contract-map: PINNED_MANIFEST is non-trivial (a vacuous empty manifest would pass trivially)", () => {
  // Guards the guard: if PINNED_MANIFEST were ever emptied out, the test above would pass for the wrong
  // reason (nothing to check). Mirrors execution-wiring's own "positive: at least one real wired file" shape.
  const slugs = Object.keys(PINNED_MANIFEST);
  assert.ok(slugs.length >= 3, `expected several pinned skills, got ${slugs.length}`);
  const totalCitations = slugs.reduce((n, s) => n + PINNED_MANIFEST[s].citingFiles.length, 0);
  assert.ok(totalCitations >= 10, `expected many pinned citations, got ${totalCitations}`);
});

// ---------------------------------------------------------------------------------------------------------
// 2. SEEDED-DRIFT PROOF — synthetic fixture repo, one built fresh per test.
// ---------------------------------------------------------------------------------------------------------

const FSI = "fsi-app";

/** Build a minimal repo-shaped fixture: fsi-app/.claude/skills/<slug>/SKILL.md + fsi-app/src/<citer>.mjs
 *  citing it. Returns { root, cleanup }. */
function buildFixture({ skillBody = "Operative clause: widgets must be blue.\n", citer = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), "skill-drift-fixture-"));
  const skillDir = join(root, FSI, ".claude", "skills", "demo-skill");
  const srcDir = join(root, FSI, "src");
  mkdirSync(skillDir, { recursive: true });
  mkdirSync(srcDir, { recursive: true });
  writeFileSync(join(skillDir, "SKILL.md"), skillBody);
  if (citer) {
    writeFileSync(
      join(srcDir, "citer.mjs"),
      "// GOVERNING SKILL: demo-skill (widgets-must-be-blue rule)\nexport const x = 1;\n",
    );
  }
  return root;
}

function cleanFixture(root) {
  rmSync(root, { recursive: true, force: true });
}

/** A manifest pinned to match a freshly-built clean fixture exactly (skillBody's default content). */
function manifestForCleanFixture(root) {
  const skillPath = `${FSI}/.claude/skills/demo-skill/SKILL.md`;
  return {
    "demo-skill": {
      skillPath,
      contentHash: hashFileContent(root, skillPath),
      citingFiles: [`${FSI}/src/citer.mjs`],
    },
  };
}

test("skill-drift fixture sanity: scanCitations/resolveSkillPath see the fixture the same way the real scan works", () => {
  const root = buildFixture();
  try {
    assert.deepEqual(listSkillSlugs(root), ["demo-skill"]);
    assert.equal(resolveSkillPath(root, "demo-skill"), `${FSI}/.claude/skills/demo-skill/SKILL.md`);
    const live = scanCitations(root);
    assert.deepEqual(live, { "demo-skill": [`${FSI}/src/citer.mjs`] });
  } finally {
    cleanFixture(root);
  }
});

test("skill-drift fixture control: a clean, matching fixture is NOT flagged (no false positives)", () => {
  const root = buildFixture();
  try {
    const manifest = manifestForCleanFixture(root);
    const { ok, problems } = checkManifestDrift(manifest, root);
    assert.equal(ok, true, `expected clean fixture to pass, got: ${JSON.stringify(problems)}`);
  } finally {
    cleanFixture(root);
  }
});

test("seeded drift (skill edited, manifest not): skill file content changed after pinning turns RED", () => {
  const root = buildFixture();
  try {
    const manifest = manifestForCleanFixture(root); // pins the ORIGINAL content's hash
    // Now edit the skill file — the manifest still holds the stale hash, simulating an operator rewriting
    // the skill's operative clause without touching skill-contract-map.mjs.
    writeFileSync(
      join(root, FSI, ".claude", "skills", "demo-skill", "SKILL.md"),
      "Operative clause: widgets must be RED now (drift!).\n",
    );
    const { ok, problems } = checkManifestDrift(manifest, root);
    assert.equal(ok, false, "expected the seeded skill-content edit to be caught");
    assert.ok(
      problems.some((p) => p.type === "skill-content-changed" && p.skill === "demo-skill"),
      `expected a skill-content-changed problem, got: ${JSON.stringify(problems)}`,
    );
  } finally {
    cleanFixture(root);
  }
});

test("seeded drift (code edited, skill not): citing file drops its citation turns RED", () => {
  const root = buildFixture();
  try {
    const manifest = manifestForCleanFixture(root);
    // Overwrite the citing file so it no longer mentions the skill at all — simulating an edit that removed
    // the GOVERNING SKILL comment (or the code path it governed) without anyone updating the manifest.
    writeFileSync(join(root, FSI, "src", "citer.mjs"), "export const x = 1; // no citation anymore\n");
    const { ok, problems } = checkManifestDrift(manifest, root);
    assert.equal(ok, false, "expected the seeded dropped-citation edit to be caught");
    assert.ok(
      problems.some(
        (p) => p.type === "citation-dropped" && p.skill === "demo-skill" && p.file === `${FSI}/src/citer.mjs`,
      ),
      `expected a citation-dropped problem, got: ${JSON.stringify(problems)}`,
    );
  } finally {
    cleanFixture(root);
  }
});

test("seeded drift (new citation, unreviewed): a fresh file citing the skill turns RED until pinned", () => {
  const root = buildFixture();
  try {
    const manifest = manifestForCleanFixture(root);
    writeFileSync(
      join(root, FSI, "src", "second-citer.mjs"),
      "// GOVERNING SKILL: demo-skill (a second, unreviewed citation)\nexport const y = 2;\n",
    );
    const { ok, problems } = checkManifestDrift(manifest, root);
    assert.equal(ok, false, "expected the seeded new-citation to be caught");
    assert.ok(
      problems.some(
        (p) =>
          p.type === "citation-unpinned" &&
          p.skill === "demo-skill" &&
          p.file === `${FSI}/src/second-citer.mjs`,
      ),
      `expected a citation-unpinned problem, got: ${JSON.stringify(problems)}`,
    );
  } finally {
    cleanFixture(root);
  }
});

test("seeded drift (skill file deleted): a pinned skill file that vanishes turns RED, not silently passes", () => {
  const root = buildFixture();
  try {
    const manifest = manifestForCleanFixture(root);
    rmSync(join(root, FSI, ".claude", "skills", "demo-skill", "SKILL.md"));
    const { ok, problems } = checkManifestDrift(manifest, root);
    assert.equal(ok, false, "expected the seeded skill-file deletion to be caught");
    assert.ok(
      problems.some((p) => p.type === "skill-file-missing" && p.skill === "demo-skill"),
      `expected a skill-file-missing problem, got: ${JSON.stringify(problems)}`,
    );
  } finally {
    cleanFixture(root);
  }
});

test("unresolved skill not allowlisted: a manifest entry with no skillPath fails LOUDLY, never silently", () => {
  const root = buildFixture({ citer: false });
  try {
    const manifest = {
      "phantom-skill": { skillPath: null, contentHash: null, citingFiles: [] },
    };
    // Not in accountLevelSkills — must fail rather than silently accept a null pin.
    const { ok, problems } = checkManifestDrift(manifest, root, []);
    assert.equal(ok, false);
    assert.ok(problems.some((p) => p.type === "unresolved-skill-not-allowlisted" && p.skill === "phantom-skill"));
    // Now the SAME null pin, explicitly allowlisted as account-level — must pass (honest, not silent: the
    // module records the acknowledgement in ACCOUNT_LEVEL_SKILLS rather than omitting the entry).
    const { ok: ok2 } = checkManifestDrift(manifest, root, ["phantom-skill"]);
    assert.equal(ok2, true);
  } finally {
    cleanFixture(root);
  }
});
