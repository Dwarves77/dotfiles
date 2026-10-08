// SKILL-CONTRACT-MAP: the skill/code drift gate (U8, flywheel build plan 2026-08-10). Lane GATE-3
// (2026-10-08) deleted its range-based acknowledgment half (checkRangeAcks, the skill-acks directory).
//
// WHY THIS EXISTS. execution-wiring.mjs made "proof exists but runs nowhere" mechanically impossible by
// deriving the executed-file set from the actual runners instead of trusting a claim. This module does the
// analogous thing for governing-skill citations: a code comment saying `GOVERNING SKILL: remediation-discipline`
// is a CLAIM that the skill's text and the code agree. Nothing previously checked that claim over time — a
// skill file could be rewritten (its "operative clauses" no longer say what the citing code assumes) or a
// citing file could be edited to drop the citation, and both would pass every existing gate silently. That is
// "skill says X, runtime encodes Y" — the exact drift class this closes, in EITHER direction.
//
// MECHANISM.
//   1. REGISTRATION (checkManifestDrift): PINNED_MANIFEST names the governing skills this gate watches, each
//      by its skillPath only. checkDrift() confirms every pinned skill file still exists on disk, and that
//      every LIVE `GOVERNING SKILL(S):` citation (scanCitations(), the mechanical mirror of
//      `grep -rn "GOVERNING SKILL" fsi-app/src fsi-app/scripts`) names a REGISTERED skill; a citation to a
//      skill this file has never heard of is 'citation-unregistered', never silently accepted.
//
// SCOPE, HONESTLY. "Operative clauses" are NOT semantically parsed — that would require judgment this file
// cannot exercise mechanically. This gate proves the registry and the live citations agree at check time;
// it never claims to distinguish a meaningful doctrine change from a typo, and it never invents a hash or a
// citing-file list for a file it did not read at check time.
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
// Pure: fs-only (no DB, no network). Safe to run in the no-npm suite.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, relative, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..', '..');               // governance -> .discipline -> fsi-app -> repo root
const FSI = 'fsi-app';

// Directories a governing-skill's SKILL.md may live under, repo-relative, checked in this order.
const SKILL_ROOT_CANDIDATES = [`${FSI}/.claude/skills`, `.claude/skills`];

// Code directories scanned for `GOVERNING SKILL(S):` citations — the U8 inventory scope, verbatim.
const CITATION_SCAN_ROOTS = [`${FSI}/src`, `${FSI}/scripts`];
const CITATION_EXTS = ['.mjs', '.ts', '.tsx', '.js'];

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
const ACCOUNT_LEVEL_SKILLS = [];

// ---------------------------------------------------------------------------------------------------------
// PINNED MANIFEST: the registry of governing skills this gate watches, by skillPath only (plan 6.8 Rule
// B, lane N4, 2026-09-19: contentHash and citingFiles deleted). Citing files are derived live by
// scanCitations() below, never stored; nothing is compared to a pinned value here. The full history of what each
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
 *  never touched the filesystem, not only from a file scanCitations() itself read off disk; the callers can
 *  never independently drift on what counts as a citation because both route through this one function. */
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
 * Registration only (plan 6.8 Rule B, lane N4): no stored hash or citing-file list to compare against.
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

/** Compare PINNED_MANIFEST (this repo's real registry) against the live repo at repoRoot (registration only;
 *  the range-based acknowledgment rule was deleted by lane GATE-3, 2026-10-08). */
export function checkDrift(repoRoot = REPO) {
  return checkManifestDrift(PINNED_MANIFEST, repoRoot);
}

// ---- CLI (operator utility, mirrors skill-map.mjs's --list/--check style) ----
// Usage: node skill-contract-map.mjs --check   → prints problems (if any) and exits 1, else prints OK and exits 0
// task 0.3b: the Windows-safe main guard, inlined (no scripts/lib import precedent under
// .discipline/governance/, unlike .discipline/fitness/functions/ which already imports scripts/lib -
// see scripts/lib/is-main.mjs for the shared primitive this mirrors).
if (Boolean(process.argv[1]) && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const { ok, problems } = checkDrift(REPO);
  if (ok) {
    console.log(`skill-contract-map: OK, ${Object.keys(PINNED_MANIFEST).length} registered skills, no drift.`);
  } else {
    for (const p of problems) console.error(`[${p.type}] ${p.skill}${p.file ? ' <- ' + p.file : ''}: ${p.detail}`);
    console.error(`skill-contract-map: ${problems.length} drift problem(s).`);
    process.exit(1);
  }
}
