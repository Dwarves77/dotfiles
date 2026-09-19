// SKILL-CONTRACT-MAP: the skill/code drift gate (U8, flywheel build plan 2026-08-10; range-based
// acknowledgment mechanism, plan 6.8 Rule B, lane N4, 2026-09-19).
//
// WHY THIS EXISTS. execution-wiring.mjs made "proof exists but runs nowhere" mechanically impossible by
// deriving the executed-file set from the actual runners instead of trusting a claim. This module does the
// analogous thing for governing-skill citations: a code comment saying `GOVERNING SKILL: remediation-discipline`
// is a CLAIM that the skill's text and the code agree. Nothing previously checked that claim over time — a
// skill file could be rewritten (its "operative clauses" no longer say what the citing code assumes) or a
// citing file could be edited to drop the citation, and both would pass every existing gate silently. That is
// "skill says X, runtime encodes Y" — the exact drift class this closes, in EITHER direction.
//
// MECHANISM, TWICE OVER.
//   1. REGISTRATION (checkManifestDrift): PINNED_MANIFEST names the governing skills this gate watches, each
//      by its skillPath only. checkDrift() confirms every pinned skill file still exists on disk, and that
//      every LIVE `GOVERNING SKILL(S):` citation (scanCitations(), the mechanical mirror of
//      `grep -rn "GOVERNING SKILL" fsi-app/src fsi-app/scripts`) names a REGISTERED skill; a citation to a
//      skill this file has never heard of is 'citation-unregistered', never silently accepted.
//   2. DRIFT-OVER-TIME, BY ACKNOWLEDGMENT (checkRangeAcks, plan 6.8 Rule B): a stored content hash or citing-
//      file list is a value two lanes editing different things would collide on for no reason (Cause B, plan
//      6.8), so nothing is stored. Instead: if a git range changes a pinned SKILL.md, or ADDS/REMOVES/MOVES a
//      `GOVERNING SKILL(S):` citation of it (scanCitations on HEAD vs. the same scan on the base tree, read
//      through change-range.mjs's gitFileAtBase), that range must also ADD its own
//      fsi-app/.discipline/governance/skill-acks/<date>-<lane>.md naming the skill and the citing files it
//      reviewed, a lane's OWN file, so two lanes acknowledging in the same evening add two files, never one
//      shared line. Skipped, never failed, when no git range resolves (no baseline to diff against).
//
// SCOPE, HONESTLY. "Operative clauses" are NOT semantically parsed — that would require judgment this file
// cannot exercise mechanically. This gate proves a HUMAN LOOKED (the ack names the skill and the files) at the
// moment a citation or a governing SKILL.md moved; it never claims to distinguish a meaningful doctrine change
// from a typo, and it never invents a hash or a citing-file list for a file it did not read at check time.
//
// ACCOUNT-LEVEL SKILLS ARE OUT OF REACH. Some skills a session can `Skill`-invoke are account-level (not
// git-tracked here) — e.g. skills served by a marketplace/plugin rather than a SKILL.md under
// fsi-app/.claude/skills/ or the repo-root .claude/skills/. This module can only drift-check what is IN THE
// REPO. As of this build, EVERY `GOVERNING SKILL` citation found under fsi-app/src/ and fsi-app/scripts/
// resolves to a repo-tracked SKILL.md (see PINNED_MANIFEST); nothing here was registered blind. If a future
// citation names a skill with no resolvable SKILL.md, checkDrift() FAILS LOUDLY with
// type 'unresolved-skill-not-allowlisted' rather than silently skipping it; the fix is either to make the
// skill file resolvable, or to add its slug to ACCOUNT_LEVEL_SKILLS with an explicit `skillPath: null` entry
// (a conscious "this is out of reach" declaration, not an omission).
//
// SCAN ROOTS mirror the U8 inventory instruction exactly: fsi-app/src/** and fsi-app/scripts/** (source +
// script code that DOES things, not the discipline lane's own internal skill-routing tooling in
// .discipline/governance/ — skill-map.mjs and pretooluse-skill-gate.mjs already govern THAT layer's citations
// and would make this gate check itself if included, a different and already-covered problem).
//
// Pure: fs-only (no DB, no network) for the registration half; the range half additionally shells out to git
// through change-range.mjs, same discipline as F28/F45's own range rules. Safe to run in the no-npm suite.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, relative, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolveRange, gitChangedFiles, gitAddedFiles, gitFileAtBase } from '../lib/change-range.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..', '..');               // governance -> .discipline -> fsi-app -> repo root
const FSI = 'fsi-app';

// Directories a governing-skill's SKILL.md may live under, repo-relative, checked in this order.
const SKILL_ROOT_CANDIDATES = [`${FSI}/.claude/skills`, `.claude/skills`];

// Code directories scanned for `GOVERNING SKILL(S):` citations — the U8 inventory scope, verbatim.
const CITATION_SCAN_ROOTS = [`${FSI}/src`, `${FSI}/scripts`];
const CITATION_EXTS = ['.mjs', '.ts', '.tsx', '.js'];

// Where a lane's own acknowledgment file lives (plan 6.8 Rule B). One file per lane per day; never
// deleted by a lane (the coordinator's close lane prunes acked-and-landed files).
const SKILL_ACKS_DIR = `${FSI}/.discipline/governance/skill-acks`;

// The marker this codebase actually uses (confirmed by inventory): "GOVERNING SKILL" or "GOVERNING SKILLS",
// optionally followed by a short parenthetical (e.g. "(criteria derived from + confirmed against, not memory)"
// in format-structure.mjs), then a colon. This is what excludes db.mjs's unrelated prose ("the GOVERNING
// SKILL and why.") — no colon follows it on the same line, so it is correctly not a citation.
const CITATION_MARKER = /GOVERNING SKILLS?\s*(?:\([^)]{0,80}\))?\s*:/g;
// How far past a marker to look for known skill slugs. 800 chars comfortably covers every real citation block
// found in the inventory (the longest, format-structure.mjs, needs ~520 to reach its 2nd cited skill).
const CITATION_WINDOW = 800;

// Skills this module has consciously decided it cannot reach in this repo (see header). Register such a
// skill in PINNED_MANIFEST with `skillPath: null`; checkDrift() then requires it to be present here (so a
// silently-unresolvable citation cannot pass by accident) but never looks for a file on disk for it.
export const ACCOUNT_LEVEL_SKILLS = [];

// ---------------------------------------------------------------------------------------------------------
// PINNED MANIFEST: the registry of governing skills this gate watches, by skillPath only (plan 6.8 Rule
// B, lane N4, 2026-09-19: contentHash and citingFiles deleted). Citing files are derived live by
// scanCitations() below, never stored; drift IN a skill file or a citation moving over time is caught by
// checkRangeAcks()'s range rule, not by comparing to a pinned value here. The full history of what each
// skill's content used to be, and which files cited it when, lives in this file's git history (see git log
// -p on this file up to and including 2026-09-19, lane N4) rather than as growing prose beside the entries.
// Generated 2026-08-29 against this worktree via `grep -rln "GOVERNING SKILL" fsi-app/src fsi-app/scripts`
// cross-checked against scanCitations() -- the two agreed exactly. Registering a NEW skill here is a
// deliberate, reviewed act (the same "coordinator names the id" posture invariants.d/README.md uses for
// invariant ids): a live citation to an unregistered skill is 'citation-unregistered', never silently
// accepted into the set this gate watches.
// ---------------------------------------------------------------------------------------------------------
export const PINNED_MANIFEST = {
  'remediation-discipline': { skillPath: 'fsi-app/.claude/skills/remediation-discipline/SKILL.md' },
  'environmental-policy-and-innovation': { skillPath: 'fsi-app/.claude/skills/environmental-policy-and-innovation/SKILL.md' },
  'analysis-construction-spec': { skillPath: 'fsi-app/.claude/skills/analysis-construction-spec/SKILL.md' },
  'source-credibility-model': { skillPath: 'fsi-app/.claude/skills/source-credibility-model/SKILL.md' },
  'sprint-followups-discipline': { skillPath: 'fsi-app/.claude/skills/sprint-followups-discipline/SKILL.md' },
  'caros-ledge-platform-intent': { skillPath: 'fsi-app/.claude/skills/caros-ledge-platform-intent/SKILL.md' },
};

// ---- fs helpers ----

function toPosix(p) {
  return String(p).replaceAll('\\', '/');
}

function walkFiles(absDir, exts, out = []) {
  let entries;
  try {
    entries = readdirSync(absDir, { withFileTypes: true });
  } catch {
    return out; // directory absent — caller decides whether that's a problem
  }
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name.startsWith('.git')) continue;
    const full = join(absDir, e.name);
    if (e.isDirectory()) walkFiles(full, exts, out);
    else if (exts.some((ext) => e.name.endsWith(ext))) out.push(full);
  }
  return out;
}

/** Every governing-skill slug this repo has a SKILL.md for (derived by reading the skill dirs, not a hand list). */
export function listSkillSlugs(repoRoot) {
  const slugs = new Set();
  for (const root of SKILL_ROOT_CANDIDATES) {
    const abs = resolve(repoRoot, root);
    let entries;
    try {
      entries = readdirSync(abs, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) if (e.isDirectory()) slugs.add(e.name);
  }
  return [...slugs].sort();
}

/** Resolve a skill slug to its repo-relative SKILL.md path, or null if no candidate root has it. */
export function resolveSkillPath(repoRoot, slug) {
  for (const root of SKILL_ROOT_CANDIDATES) {
    const rel = `${root}/${slug}/SKILL.md`;
    if (existsSync(resolve(repoRoot, rel))) return rel;
  }
  return null;
}

/** Pure: every skill slug (from `slugs`) that a `GOVERNING SKILL(S):` citation in `text` names, matching
 *  the same marker + window scanCitations() uses. Extracted so a citation set can be taken from text that
 *  never touched the filesystem (a base tree's blob content, in checkRangeAcks() below), not only from a
 *  file scanCitations() itself read off disk; the two callers can never independently drift on what
 *  counts as a citation because both route through this one function. */
export function extractCitedSlugs(text, slugs) {
  CITATION_MARKER.lastIndex = 0;
  const found = new Set();
  let m;
  while ((m = CITATION_MARKER.exec(String(text ?? '')))) {
    const window = text.slice(m.index, m.index + CITATION_WINDOW);
    for (const slug of slugs) {
      const re = new RegExp('\\b' + slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b');
      if (re.test(window)) found.add(slug);
    }
  }
  return found;
}

/**
 * LIVE scan: every (skill, citingFile) pair found under CITATION_SCAN_ROOTS right now, matching the same
 * `GOVERNING SKILL(S):` marker + window PINNED_MANIFEST's registrations were derived from. Returns
 * { [slug]: string[] } (sorted repo-relative paths). This is what checkDrift() compares the registry
 * against; it can never itself drift from "what the grep would show" because it performs the equivalent
 * scan mechanically.
 */
export function scanCitations(repoRoot) {
  const slugs = listSkillSlugs(repoRoot);
  const bySkill = {};
  const files = CITATION_SCAN_ROOTS.flatMap((root) => walkFiles(resolve(repoRoot, root), CITATION_EXTS));
  for (const abs of files) {
    const rel = toPosix(relative(repoRoot, abs));
    const text = readFileSync(abs, 'utf8');
    for (const slug of extractCitedSlugs(text, slugs)) (bySkill[slug] ??= new Set()).add(rel);
  }
  const out = {};
  for (const [slug, set] of Object.entries(bySkill)) out[slug] = [...set].sort();
  return out;
}

/**
 * Compare a MANIFEST (same shape as PINNED_MANIFEST) against the live repo at repoRoot. Returns
 * { ok, problems }. `problems` is a flat list of { type, skill, file?, detail } — every entry is a FAIL;
 * `ok` is problems.length === 0. Manifest-parameterized (rather than hard-wired to PINNED_MANIFEST) so the
 * comparison logic is unit-testable against a small synthetic fixture repo, independent of this repo's real
 * skill files — see skill-drift-gate.test.mjs's seeded-drift negative tests. `accountLevelSkills` defaults
 * to ACCOUNT_LEVEL_SKILLS but is overridable for the same fixture-testing reason.
 *
 * Registration only (plan 6.8 Rule B, lane N4): no stored hash or citing-file list to compare against;
 * that comparison moved to checkRangeAcks() below, which catches drift OVER TIME by requiring a human
 * acknowledgment, rather than by diffing against a value this file would otherwise have to keep re-pinning.
 */
export function checkManifestDrift(manifest, repoRoot, accountLevelSkills = ACCOUNT_LEVEL_SKILLS) {
  const problems = [];
  const live = scanCitations(repoRoot);
  const pinnedSlugs = Object.keys(manifest);

  // 1: pinned skill file presence (account-level entries carry no file to check).
  for (const slug of pinnedSlugs) {
    const entry = manifest[slug];
    if (accountLevelSkills.includes(slug)) {
      if (entry.skillPath !== null) {
        problems.push({
          type: 'account-level-pin-invalid',
          skill: slug,
          detail: `"${slug}" is listed in ACCOUNT_LEVEL_SKILLS but its PINNED_MANIFEST entry has a ` +
            `skillPath, an account-level entry must be explicitly null.`,
        });
      }
      continue;
    }
    if (!entry.skillPath) {
      problems.push({
        type: 'unresolved-skill-not-allowlisted',
        skill: slug,
        detail: `PINNED_MANIFEST["${slug}"] has no skillPath and "${slug}" is not in ACCOUNT_LEVEL_SKILLS. ` +
          `Either the skill file should resolve (fix skillPath) or this is genuinely an account-level skill ` +
          `(add the slug to ACCOUNT_LEVEL_SKILLS with an explicit null entry); it cannot be left ambiguous.`,
      });
      continue;
    }
    if (!existsSync(resolve(repoRoot, entry.skillPath))) {
      problems.push({
        type: 'skill-file-missing',
        skill: slug,
        detail: `pinned skill file ${entry.skillPath} no longer exists in the repo.`,
      });
    }
  }

  // 2: every citation resolves to a REGISTERED skill (pinned in the manifest, whether account-level or
  // on-disk). A live citation to a slug this manifest has never heard of is unregistered, never silently
  // accepted -- scanCitations() only ever returns slugs with a resolvable SKILL.md (listSkillSlugs), so
  // this is "a real skill exists, but nobody registered it here", the missing half of that guarantee.
  const registeredSlugs = new Set(pinnedSlugs);
  for (const [slug, files] of Object.entries(live)) {
    if (registeredSlugs.has(slug)) continue;
    for (const f of files) {
      problems.push({
        type: 'citation-unregistered',
        skill: slug,
        file: f,
        detail: `${f} cites "${slug}" but PINNED_MANIFEST does not register that skill, register it ` +
          `(skillPath, or an ACCOUNT_LEVEL_SKILLS null entry) before citing it.`,
      });
    }
  }

  return { ok: problems.length === 0, problems };
}

// ---------------------------------------------------------------------------------------------------------
// RANGE-BASED ACKNOWLEDGMENT (plan 6.8, Rule B, lane N4). A pinned SKILL.md changing, or a
// `GOVERNING SKILL(S):` citation of a registered skill being added, removed or moved, within a git range,
// requires that SAME range to add its own fsi-app/.discipline/governance/skill-acks/<date>-<lane>.md
// naming the skill. Nothing about the skill's PAST content or citation set is stored anywhere -- the
// comparison is always HEAD vs. the range's own base tree, read live through change-range.mjs.
// ---------------------------------------------------------------------------------------------------------

/** The shape an ack file must have: a `## Skill` heading (its section names every skill it acknowledges,
 *  one per line) and a `## Citing files reviewed` heading. Returns the Set of skill names found under
 *  `## Skill`, or null if the file lacks either required heading (not a valid ack at all). */
export function parseSkillAck(text) {
  const t = String(text ?? '');
  if (!/^##\s*Citing files reviewed\s*$/im.test(t)) return null;
  const m = /^##\s*Skill\s*$/im.exec(t);
  if (!m) return null;
  const rest = t.slice(m.index + m[0].length);
  const nextHeading = rest.search(/^##\s/m);
  const section = nextHeading === -1 ? rest : rest.slice(0, nextHeading);
  const names = new Set();
  for (const line of section.split(/\r?\n/)) {
    const cleaned = line.trim().replace(/^[-*]\s*/, '');
    if (cleaned) names.add(cleaned);
  }
  return names;
}

/**
 * The range rule. `manifest` is checked against `repoRoot`'s working tree (HEAD) vs. the range's base
 * tree. Returns { ok, problems, skipped, reason? }: `skipped: true` (never a problem) when no git range
 * resolves -- there is no baseline to diff against, so the rule has nothing to say, not a failure to
 * report. `cwd` (defaults to repoRoot) lets tests point this at a throwaway fixture repo.
 */
export function checkRangeAcks(manifest, repoRoot, { cwd } = {}) {
  const gitCwd = cwd || repoRoot;
  const { range, base, source, reason } = resolveRange({ cwd: gitCwd });
  if (source === 'unavailable') {
    return { ok: true, problems: [], skipped: true, reason };
  }

  let changed, added;
  try {
    changed = gitChangedFiles(range, { cwd: gitCwd });
    added = gitAddedFiles(range, { cwd: gitCwd });
  } catch (e) {
    return { ok: true, problems: [], skipped: true, reason: e.message };
  }
  const changedSet = new Set(changed);
  const slugs = Object.keys(manifest);
  const needingAck = new Set();

  // A pinned SKILL.md itself changed in the range.
  for (const [slug, entry] of Object.entries(manifest)) {
    if (entry.skillPath && changedSet.has(entry.skillPath)) needingAck.add(slug);
  }

  // A citation of a registered skill was added, removed or moved: compare HEAD's citations in each
  // changed, in-scope file against that same file's citations on the base tree.
  for (const file of changed) {
    if (!CITATION_SCAN_ROOTS.some((root) => file === root || file.startsWith(root + '/'))) continue;
    if (!CITATION_EXTS.some((ext) => file.endsWith(ext))) continue;
    const headText = readFileOrNull(resolve(repoRoot, file));
    const baseText = gitFileAtBase(base, file, { cwd: gitCwd });
    const headSlugs = headText != null ? extractCitedSlugs(headText, slugs) : new Set();
    const baseSlugs = baseText != null ? extractCitedSlugs(baseText, slugs) : new Set();
    for (const s of headSlugs) if (!baseSlugs.has(s)) needingAck.add(s);
    for (const s of baseSlugs) if (!headSlugs.has(s)) needingAck.add(s);
  }

  if (needingAck.size === 0) return { ok: true, problems: [] };

  const ackFiles = added.filter((f) => f.startsWith(`${SKILL_ACKS_DIR}/`) && f.endsWith('.md'));
  const ackedSkills = new Set();
  for (const f of ackFiles) {
    const text = readFileOrNull(resolve(repoRoot, f));
    const names = text != null ? parseSkillAck(text) : null;
    if (!names) continue;
    for (const slug of needingAck) if (names.has(slug)) ackedSkills.add(slug);
  }

  const problems = [];
  for (const slug of needingAck) {
    if (!ackedSkills.has(slug)) {
      problems.push({
        type: 'missing-skill-ack',
        skill: slug,
        detail: `this range changed the pinned SKILL.md for "${slug}" or moved a GOVERNING SKILL(S) ` +
          `citation of it, but added no ${SKILL_ACKS_DIR}/<date>-<lane>.md naming "${slug}" under a ` +
          `"## Skill" heading (with a "## Citing files reviewed" heading listing what was reviewed).`,
      });
    }
  }
  return { ok: problems.length === 0, problems };
}

function readFileOrNull(absPath) {
  try {
    return readFileSync(absPath, 'utf8');
  } catch {
    return null;
  }
}

/** Compare PINNED_MANIFEST (this repo's real registry) against the live repo at repoRoot: registration
 *  (checkManifestDrift) plus the range-based acknowledgment rule (checkRangeAcks) when a range resolves. */
export function checkDrift(repoRoot = REPO) {
  const manifestResult = checkManifestDrift(PINNED_MANIFEST, repoRoot);
  const rangeResult = checkRangeAcks(PINNED_MANIFEST, repoRoot);
  const problems = [...manifestResult.problems, ...rangeResult.problems];
  return { ok: problems.length === 0, problems, rangeSkipped: Boolean(rangeResult.skipped), rangeSkipReason: rangeResult.reason };
}

/** Convenience boolean for callers that just need pass/fail. */
export function isSkillContractClean(repoRoot = REPO) {
  return checkDrift(repoRoot).ok;
}

// ---- CLI (operator utility, mirrors skill-map.mjs's --list/--check style) ----
// Usage: node skill-contract-map.mjs --check   → prints problems (if any) and exits 1, else prints OK and exits 0
// task 0.3b: the Windows-safe main guard, inlined (no scripts/lib import precedent under
// .discipline/governance/, unlike .discipline/fitness/functions/ which already imports scripts/lib -
// see scripts/lib/is-main.mjs for the shared primitive this mirrors).
if (Boolean(process.argv[1]) && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const { ok, problems, rangeSkipped, rangeSkipReason } = checkDrift(REPO);
  if (rangeSkipped) console.log(`skill-contract-map: range rule skipped (${rangeSkipReason})`);
  if (ok) {
    console.log(`skill-contract-map: OK, ${Object.keys(PINNED_MANIFEST).length} registered skills, no drift.`);
  } else {
    for (const p of problems) console.error(`[${p.type}] ${p.skill}${p.file ? ' <- ' + p.file : ''}: ${p.detail}`);
    console.error(`skill-contract-map: ${problems.length} drift problem(s).`);
    process.exit(1);
  }
}
