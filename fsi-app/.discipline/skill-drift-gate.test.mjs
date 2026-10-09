// SKILL-DRIFT GATE (U8, flywheel build plan 2026-08-10): proof for skill-contract-map.mjs.
//
// Two things must be shown:
//
//   1. REAL-REPO PROOF: checkDrift() run against THIS checkout, right now, is clean (ok:true). This is the
//      live assertion that PINNED_MANIFEST's registered skills still exist on disk and every live citation
//      resolves to a registered skill.
//
//   2. REGISTRATION SEEDED-DRIFT PROOF (checkManifestDrift): a small synthetic fixture repo, built fresh
//      per test in a temp directory (never the real repo), seeds each registration-time drift shape
//      independently and confirms it turns red; a clean fixture (no seeding) stays green.
//
// Lane GATE-3 (2026-10-08): the range-based acknowledgment half (checkRangeAcks, parseSkillAck and the
// skill-acks directory) and its three git-fixture proofs were deleted; the gate fired once in 30 days.
//
// Pure: fs-only (temp dir under os.tmpdir(), cleaned up after each test), safe for the no-npm discipline
// suite (glob-portability's node:-builtins-and-relative-imports rule).

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  checkDrift,
  checkManifestDrift,
  extractCitedSlugs,
  scanCitations,
  resolveSkillPath,
  listSkillSlugs,
  PINNED_MANIFEST,
} from "./governance/skill-contract-map.mjs";

// ---------------------------------------------------------------------------------------------------------
// 1. REAL-REPO PROOF
// ---------------------------------------------------------------------------------------------------------

test("skill-contract-map: checkDrift is clean on this checkout right now (registration)", () => {
  const { ok, problems, rangeSkipped, rangeSkipReason } = checkDrift();
  assert.equal(
    ok, true,
    `skill-contract-map drift detected:\n` +
      problems.map((p) => `  [${p.type}] ${p.skill}${p.file ? " <- " + p.file : ""}: ${p.detail}`).join("\n"),
  );
  if (rangeSkipped) console.log(`  (range rule skipped: ${rangeSkipReason})`);
});

test("skill-contract-map: PINNED_MANIFEST is non-trivial (a vacuous empty manifest would pass trivially)", () => {
  // Guards the guard: if PINNED_MANIFEST were ever emptied out, the test above would pass for the wrong
  // reason (nothing to check). Mirrors execution-wiring's own "positive: at least one real wired file" shape.
  const slugs = Object.keys(PINNED_MANIFEST);
  assert.ok(slugs.length >= 3, `expected several registered skills, got ${slugs.length}`);
});

// ---------------------------------------------------------------------------------------------------------
// 2. REGISTRATION SEEDED-DRIFT PROOF (checkManifestDrift): synthetic fixture repo, no git.
// ---------------------------------------------------------------------------------------------------------

const FSI = "fsi-app";

/** Build a minimal repo-shaped fixture: fsi-app/.claude/skills/<slug>/SKILL.md + fsi-app/src/<citer>.mjs
 *  citing it. Returns the fixture root (a plain directory, no git). */
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

const REGISTERED_DEMO_SKILL = { "demo-skill": { skillPath: `${FSI}/.claude/skills/demo-skill/SKILL.md` } };

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

test("registration control: a clean, registered fixture is NOT flagged (no false positives)", () => {
  const root = buildFixture();
  try {
    const { ok, problems } = checkManifestDrift(REGISTERED_DEMO_SKILL, root);
    assert.equal(ok, true, `expected clean fixture to pass, got: ${JSON.stringify(problems)}`);
  } finally {
    cleanFixture(root);
  }
});

test("seeded (skill file deleted): a registered skill file that vanishes turns RED, not silently passes", () => {
  const root = buildFixture();
  try {
    rmSync(join(root, FSI, ".claude", "skills", "demo-skill", "SKILL.md"));
    const { ok, problems } = checkManifestDrift(REGISTERED_DEMO_SKILL, root);
    assert.equal(ok, false, "expected the seeded skill-file deletion to be caught");
    assert.ok(
      problems.some((p) => p.type === "skill-file-missing" && p.skill === "demo-skill"),
      `expected a skill-file-missing problem, got: ${JSON.stringify(problems)}`,
    );
  } finally {
    cleanFixture(root);
  }
});

test("seeded (citation to an unregistered skill): a live citation to a skill PINNED_MANIFEST never registered turns RED", () => {
  const root = buildFixture({ citer: false });
  const otherSkillDir = join(root, FSI, ".claude", "skills", "other-skill");
  mkdirSync(otherSkillDir, { recursive: true });
  writeFileSync(join(otherSkillDir, "SKILL.md"), "Operative clause: gadgets must be square.\n");
  writeFileSync(
    join(root, FSI, "src", "citer.mjs"),
    "// GOVERNING SKILL: other-skill (a skill nobody registered)\nexport const x = 1;\n",
  );
  try {
    // demo-skill is registered; other-skill resolves on disk (a real SKILL.md) but is absent from the
    // manifest passed in -- the exact "a real skill exists, nobody registered it" gap.
    const { ok, problems } = checkManifestDrift(REGISTERED_DEMO_SKILL, root);
    assert.equal(ok, false, "expected the seeded unregistered citation to be caught");
    assert.ok(
      problems.some(
        (p) => p.type === "citation-unregistered" && p.skill === "other-skill" && p.file === `${FSI}/src/citer.mjs`,
      ),
      `expected a citation-unregistered problem, got: ${JSON.stringify(problems)}`,
    );
  } finally {
    cleanFixture(root);
  }
});

test("unresolved skill not allowlisted: a manifest entry with no skillPath fails LOUDLY, never silently", () => {
  const root = buildFixture({ citer: false });
  try {
    const manifest = { "phantom-skill": { skillPath: null } };
    // Not in accountLevelSkills, must fail rather than silently accept a null entry.
    const { ok, problems } = checkManifestDrift(manifest, root, []);
    assert.equal(ok, false);
    assert.ok(problems.some((p) => p.type === "unresolved-skill-not-allowlisted" && p.skill === "phantom-skill"));
    // Now the SAME null entry, explicitly allowlisted as account-level, must pass (honest, not silent: the
    // module records the acknowledgement in ACCOUNT_LEVEL_SKILLS rather than omitting the entry).
    const { ok: ok2 } = checkManifestDrift(manifest, root, ["phantom-skill"]);
    assert.equal(ok2, true);
  } finally {
    cleanFixture(root);
  }
});

test("extractCitedSlugs: pure text scan agrees with scanCitations' own marker + window logic", () => {
  const text = "// GOVERNING SKILL: demo-skill (a rule)\nexport const x = 1;\n";
  assert.deepEqual(extractCitedSlugs(text, ["demo-skill", "other-skill"]), new Set(["demo-skill"]));
  assert.deepEqual(extractCitedSlugs("export const x = 1;\n", ["demo-skill"]), new Set());
});

// ── lane GATE-9 (2026-10-08, AUD-AT-5 gate-script neuter row): the CLI's EXIT STATUS, not only its output ──────
test("GATE-9 exit status: skill-contract-map.mjs exits 0 on the committed tree, and its only exit is 1 inside the drift branch", async () => {
  const { spawnSync } = await import("node:child_process");
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const { withoutCredentials } = await import("../scripts/lib/env-file.mjs");
  const script = fileURLToPath(new URL("./governance/skill-contract-map.mjs", import.meta.url));
  const r = spawnSync(process.execPath, [script, "--check"], { encoding: "utf8", env: withoutCredentials() });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /skill-contract-map: OK/);
  const src = readFileSync(script, "utf8");
  assert.deepEqual([...src.matchAll(/process\.exit\(([^)]*)\)/g)].map((m) => m[1]), ["1"]);
  assert.match(src, /\} else \{\s*for \(const p of problems\)[\s\S]*?process\.exit\(1\);\s*\}/, "the drift report is followed by exit 1");
  assert.doesNotMatch(src, /process\.exit\s*=[^=]|process\.exitCode\s*=/, "the exit status is never reassigned");
});
