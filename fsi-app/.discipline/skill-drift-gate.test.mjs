// SKILL-DRIFT GATE (U8, flywheel build plan 2026-08-10; range-based acknowledgment, plan 6.8 Rule B,
// lane N4, 2026-09-19): proof for skill-contract-map.mjs.
//
// Three things must be shown:
//
//   1. REAL-REPO PROOF: checkDrift() run against THIS checkout, right now, is clean (ok:true). This is the
//      live assertion that PINNED_MANIFEST's registered skills still exist on disk, every live citation
//      resolves to a registered skill, and this branch's own range (if it changed a pinned SKILL.md or
//      moved a citation) carries its own skill-ack.
//
//   2. REGISTRATION SEEDED-DRIFT PROOF (checkManifestDrift): a small synthetic fixture repo, built fresh
//      per test in a temp directory (never the real repo), seeds each registration-time drift shape
//      independently and confirms it turns red; a clean fixture (no seeding) stays green.
//
//   3. RANGE-ACK SEEDED-DRIFT PROOF (checkRangeAcks, the plan 6.8 Rule B mechanism this lane built): a
//      throwaway LOCAL git repo (a fake `refs/remotes/origin/master` ref standing in for a real remote, so
//      resolveRange's merge-base computation has something to diff against without a network) proves: red
//      for a changed skill file with no ack, red for a moved citation with no ack, green once the ack is
//      added in the same range, and the no-range case (no origin/master ref at all) SKIPS rather than
//      fails, and says why.
//
// Pure: fs-only for (1)-(2) (temp dir under os.tmpdir(), cleaned up after each test); (3) additionally
// shells out to a LOCAL git repo it creates and destroys itself, never the real repo and never a network
// call, safe for the no-npm discipline suite (glob-portability's node:-builtins-and-relative-imports rule;
// git itself is a subprocess, not an npm import).

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  checkDrift,
  checkManifestDrift,
  checkRangeAcks,
  parseSkillAck,
  extractCitedSlugs,
  scanCitations,
  resolveSkillPath,
  listSkillSlugs,
  PINNED_MANIFEST,
} from "./governance/skill-contract-map.mjs";

// ---------------------------------------------------------------------------------------------------------
// 1. REAL-REPO PROOF
// ---------------------------------------------------------------------------------------------------------

test("skill-contract-map: checkDrift is clean on this checkout right now (registration + this branch's own range)", () => {
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

test("parseSkillAck: requires BOTH headings and lists every skill named under '## Skill'", () => {
  const good = "## Skill\ndemo-skill\nother-skill\n\n## Citing files reviewed\n- fsi-app/src/citer.mjs\n";
  assert.deepEqual(parseSkillAck(good), new Set(["demo-skill", "other-skill"]));
  assert.equal(parseSkillAck("## Skill\ndemo-skill\n"), null, "missing 'Citing files reviewed' heading");
  assert.equal(parseSkillAck("## Citing files reviewed\n- x\n"), null, "missing 'Skill' heading");
});

// ---------------------------------------------------------------------------------------------------------
// 3. RANGE-ACK SEEDED-DRIFT PROOF (checkRangeAcks): a throwaway LOCAL git repo per test.
// ---------------------------------------------------------------------------------------------------------

/** A local git repo shaped like the real one's relevant corner: fsi-app/.claude/skills/demo-skill/SKILL.md
 *  + fsi-app/src/citer.mjs (no citation yet). `refs/remotes/origin/master` is set to the base commit --
 *  standing in for a real remote so resolveRange's merge-base computation has something to diff against,
 *  with no network call and no real repo touched. Returns { root, git }; `git(args)` runs one git command
 *  in this fixture repo. */
function buildGitFixture() {
  const root = mkdtempSync(join(tmpdir(), "skill-ack-fixture-"));
  const git = (args) => execFileSync("git", args, { cwd: root, encoding: "utf8" });
  git(["init", "-q", "-b", "master"]);
  git(["config", "user.email", "skill-ack-fixture@test.local"]);
  git(["config", "user.name", "skill-ack-fixture"]);
  git(["config", "commit.gpgsign", "false"]);
  const skillDir = join(root, FSI, ".claude", "skills", "demo-skill");
  const srcDir = join(root, FSI, "src");
  mkdirSync(skillDir, { recursive: true });
  mkdirSync(srcDir, { recursive: true });
  writeFileSync(join(skillDir, "SKILL.md"), "Operative clause: widgets must be blue.\n");
  writeFileSync(join(srcDir, "citer.mjs"), "export const x = 1; // no citation yet\n");
  git(["add", "."]);
  git(["commit", "-q", "-m", "base"]);
  git(["update-ref", "refs/remotes/origin/master", "HEAD"]);
  return { root, git };
}

test("checkRangeAcks RED: a range that changes a registered skill's SKILL.md with no ack is caught", () => {
  const { root, git } = buildGitFixture();
  try {
    writeFileSync(
      join(root, FSI, ".claude", "skills", "demo-skill", "SKILL.md"),
      "Operative clause: widgets must be RED now (drift, no ack).\n",
    );
    git(["add", "."]);
    git(["commit", "-q", "-m", "edit skill, no ack"]);
    const { ok, problems, skipped } = checkRangeAcks(REGISTERED_DEMO_SKILL, root, { cwd: root });
    assert.equal(skipped, undefined, "a resolvable range must not be reported as skipped");
    assert.equal(ok, false, "expected the seeded skill-file change with no ack to be caught");
    assert.ok(
      problems.some((p) => p.type === "missing-skill-ack" && p.skill === "demo-skill"),
      `expected a missing-skill-ack problem, got: ${JSON.stringify(problems)}`,
    );
  } finally {
    cleanFixture(root);
  }
});

test("checkRangeAcks RED: a range that moves a GOVERNING SKILL citation with no ack is caught", () => {
  const { root, git } = buildGitFixture();
  try {
    writeFileSync(
      join(root, FSI, "src", "citer.mjs"),
      "// GOVERNING SKILL: demo-skill (a newly added, unreviewed citation)\nexport const x = 1;\n",
    );
    git(["add", "."]);
    git(["commit", "-q", "-m", "add citation, no ack"]);
    const { ok, problems } = checkRangeAcks(REGISTERED_DEMO_SKILL, root, { cwd: root });
    assert.equal(ok, false, "expected the seeded moved-citation change with no ack to be caught");
    assert.ok(
      problems.some((p) => p.type === "missing-skill-ack" && p.skill === "demo-skill"),
      `expected a missing-skill-ack problem, got: ${JSON.stringify(problems)}`,
    );
  } finally {
    cleanFixture(root);
  }
});

test("checkRangeAcks GREEN: the same moved citation, acknowledged in the same range, passes", () => {
  const { root, git } = buildGitFixture();
  try {
    writeFileSync(
      join(root, FSI, "src", "citer.mjs"),
      "// GOVERNING SKILL: demo-skill (a newly added citation, reviewed)\nexport const x = 1;\n",
    );
    const ackDir = join(root, FSI, ".discipline", "governance", "skill-acks");
    mkdirSync(ackDir, { recursive: true });
    writeFileSync(
      join(ackDir, "2026-09-19-fixture.md"),
      "## Skill\ndemo-skill\n\n## Citing files reviewed\n- fsi-app/src/citer.mjs\n",
    );
    git(["add", "."]);
    git(["commit", "-q", "-m", "add citation, with ack"]);
    const { ok, problems } = checkRangeAcks(REGISTERED_DEMO_SKILL, root, { cwd: root });
    assert.equal(ok, true, `expected the acknowledged range to pass, got: ${JSON.stringify(problems)}`);
  } finally {
    cleanFixture(root);
  }
});

test("checkRangeAcks: the no-range case passes and says so (skipped, not failed)", () => {
  const root = mkdtempSync(join(tmpdir(), "skill-ack-norange-"));
  const git = (args) => execFileSync("git", args, { cwd: root, encoding: "utf8" });
  try {
    git(["init", "-q", "-b", "master"]);
    git(["config", "user.email", "skill-ack-fixture@test.local"]);
    git(["config", "user.name", "skill-ack-fixture"]);
    git(["config", "commit.gpgsign", "false"]);
    mkdirSync(join(root, FSI, ".claude", "skills", "demo-skill"), { recursive: true });
    writeFileSync(join(root, FSI, ".claude", "skills", "demo-skill", "SKILL.md"), "Operative clause.\n");
    git(["add", "."]);
    git(["commit", "-q", "-m", "base, no origin/master ref at all"]);
    // Deliberately no `refs/remotes/origin/master` -- resolveRange's merge-base has nothing to diff against.
    const { ok, problems, skipped, reason } = checkRangeAcks(REGISTERED_DEMO_SKILL, root, { cwd: root });
    assert.equal(ok, true);
    assert.deepEqual(problems, []);
    assert.equal(skipped, true);
    assert.ok(reason && reason.length > 0, "the skip must say why");
  } finally {
    cleanFixture(root);
  }
});
