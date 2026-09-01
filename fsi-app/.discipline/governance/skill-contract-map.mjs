// SKILL-CONTRACT-MAP — the skill↔code drift gate (U8, flywheel build plan 2026-08-10).
//
// WHY THIS EXISTS. execution-wiring.mjs made "proof exists but runs nowhere" mechanically impossible by
// deriving the executed-file set from the actual runners instead of trusting a claim. This module does the
// analogous thing for governing-skill citations: a code comment saying `GOVERNING SKILL: remediation-discipline`
// is a CLAIM that the skill's text and the code agree. Nothing previously checked that claim over time — a
// skill file could be rewritten (its "operative clauses" no longer say what the citing code assumes) or a
// citing file could be edited to drop the citation, and both would pass every existing gate silently. That is
// "skill says X, runtime encodes Y" — the exact drift class this closes, in EITHER direction.
//
// MECHANISM (pin-then-compare, not hand-judgment). PINNED_MANIFEST below is a SNAPSHOT, taken when this file
// was authored, of every `GOVERNING SKILL(S):` citation found under fsi-app/src/ and fsi-app/scripts/ (the
// inventory command is `grep -rn "GOVERNING SKILL" fsi-app/src fsi-app/scripts`, mirrored programmatically by
// scanCitations() below so the live side of the comparison can never hand-drift from what the grep would show).
// For each cited skill it pins (a) the skill name, (b) a sha256 of the skill file's full text (EOL-normalized,
// same normalizeEol() the migration byte-identical guards use — see read-migration-sql.mjs), and (c) the sorted
// list of citing files. checkDrift() re-derives the LIVE citation set and live hashes and reds on ANY divergence:
//   - a pinned skill file no longer exists on disk                                  -> skill-file-missing
//   - a pinned skill file's live hash != the pinned hash (skill edited, manifest not) -> skill-content-changed
//   - a pinned citing file no longer contains that citation (code edited, skill not)  -> citation-dropped
//   - a live citation (new file, or a new skill mentioned) isn't in the pinned list   -> citation-unpinned
// The last two are the SAME drift, read from opposite ends: the pin and the live source-of-truth disagree about
// which files cite which skill. Fixing any of the four requires a HUMAN to look at both sides and re-run the
// generator (the `node -e` one-liner in the git history of this file / re-derive via scanCitations+hashFileContent)
// — the gate does not auto-heal itself, on purpose: that would make it as toothless as the thing it replaces.
//
// SCOPE, HONESTLY. "Operative clauses" are NOT semantically parsed — that would require judgment this file
// cannot exercise mechanically. v1 pins the SKILL FILE'S FULL CONTENT HASH, not a hand-picked "operative
// section": any edit to a cited skill file (typo or doctrine change alike) requires a deliberate manifest
// update. That is coarser than clause-level tracking but it is HONEST — it never claims to distinguish a
// meaningful doctrine change from a typo, and it never fabricates a hash for a file it did not read.
//
// ACCOUNT-LEVEL SKILLS ARE OUT OF REACH. Some skills a session can `Skill`-invoke are account-level (not
// git-tracked here) — e.g. skills served by a marketplace/plugin rather than a SKILL.md under
// fsi-app/.claude/skills/ or the repo-root .claude/skills/. This module can only hash and drift-check what is
// IN THE REPO. As of this build, EVERY `GOVERNING SKILL` citation found under fsi-app/src/ and fsi-app/scripts/
// resolves to a repo-tracked SKILL.md (see PINNED_MANIFEST) — nothing here was pinned blind. If a future
// citation names a skill with no resolvable SKILL.md, checkDrift() FAILS LOUDLY with
// type 'unresolved-skill-not-allowlisted' rather than silently skipping it or inventing a hash; the fix is
// either to make the skill file resolvable, or to add its slug to ACCOUNT_LEVEL_SKILLS with an explicit
// `skillPath: null, contentHash: null` pin (a conscious "this is out of reach" declaration, not an omission).
//
// SCAN ROOTS mirror the U8 inventory instruction exactly: fsi-app/src/** and fsi-app/scripts/** (source +
// script code that DOES things, not the discipline lane's own internal skill-routing tooling in
// .discipline/governance/ — skill-map.mjs and pretooluse-skill-gate.mjs already govern THAT layer's citations
// and would make this gate check itself if included, a different and already-covered problem).
//
// Pure: fs-only (no DB, no network), same discipline as vocab-drift-guard.test.mjs's static scans. Safe to run
// in the no-npm discipline suite.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, relative, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { normalizeEol } from '../lib/read-migration-sql.mjs';

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

// Skills this module has consciously decided it cannot reach in this repo (see header). Pin such a skill in
// PINNED_MANIFEST with `skillPath: null, contentHash: null` — checkDrift() then skips hashing it but still
// requires it to be present here, so a silently-unresolvable citation cannot pass by accident.
export const ACCOUNT_LEVEL_SKILLS = [];

// ---------------------------------------------------------------------------------------------------------
// PINNED MANIFEST — the snapshot. Regenerate by re-running scanCitations()+hashFileContent() over a clean
// checkout and diffing against this object; update deliberately, never silently. Generated 2026-08-29 against
// this worktree via `grep -rln "GOVERNING SKILL" fsi-app/src fsi-app/scripts` cross-checked against the same
// scan this file performs at runtime (scanCitations below) — the two agreed exactly (29 citing files, 6 skills).
// 2026-09-01: analysis-construction-spec's contentHash re-pinned deliberately — SKILL.md's stale
// detect_intersections RPC references (dropped in migration 265) were corrected to point at the live
// reader (src/lib/connections/pair-view.mjs / /api/admin/intersections). citingFiles unchanged.
// ---------------------------------------------------------------------------------------------------------
export const PINNED_MANIFEST = {
  'remediation-discipline': {
    skillPath: 'fsi-app/.claude/skills/remediation-discipline/SKILL.md',
    contentHash: 'a6975cde1b7b8c01c3a0077d5a03608d827b6decb3b8f73ffcff2ec663d5d07e',
    citingFiles: [
      'fsi-app/scripts/_wave-alpha/backfill-canonical-keys.mjs',
      'fsi-app/scripts/lib/deferral.mjs',
      'fsi-app/scripts/verify/canonical-key-uniqueness.mjs',
      'fsi-app/scripts/verify/claims-tier-audit.mjs',
      'fsi-app/scripts/verify/column-existence-parity.mjs',
      'fsi-app/scripts/verify/deferral-hygiene-audit.mjs',
      'fsi-app/scripts/verify/flag-age-audit.mjs',
      'fsi-app/scripts/verify/mint-gate-calibration.mjs',
      'fsi-app/scripts/verify/no-generic-source-audit.mjs',
      'fsi-app/scripts/verify/one-tier-per-host-audit.mjs',
      'fsi-app/scripts/verify/orphan-source-audit.mjs',
      'fsi-app/scripts/verify/pause-flag-guard-proof.mjs',
      'fsi-app/scripts/verify/prov-guard-adversarial-audit.mjs',
      'fsi-app/scripts/verify/quarantine-disposition-audit.mjs',
      'fsi-app/scripts/verify/remediate-orphan-sources.mjs',
      'fsi-app/scripts/verify/rls-credential-parity.mjs',
      'fsi-app/scripts/verify/schema-drift-audit.mjs',
      'fsi-app/scripts/verify/source-link-audit.mjs',
      'fsi-app/scripts/verify/staged-transit-audit.mjs',
      'fsi-app/scripts/verify/stale-verified-audit.mjs',
      'fsi-app/scripts/verify/substrate-agreement-audit.mjs',
      'fsi-app/scripts/verify/surface-visibility-audit.mjs',
      'fsi-app/scripts/verify/unregistered-span-host-audit.mjs',
      'fsi-app/src/lib/sources/canonical-fetch-caller-thread.test.mjs',
    ],
  },
  'environmental-policy-and-innovation': {
    skillPath: 'fsi-app/.claude/skills/environmental-policy-and-innovation/SKILL.md',
    contentHash: '910c9f01d3516c89943eb3a48a2b5fb075a48ace7c6aea76cf23971cae233497',
    citingFiles: [
      'fsi-app/scripts/_wave-alpha/backfill-canonical-keys.mjs',
      'fsi-app/scripts/audit-skill-conformance.mjs',
      'fsi-app/scripts/verify/canonical-key-uniqueness.mjs',
      'fsi-app/scripts/verify/format-structure.mjs',
      'fsi-app/scripts/verify/no-names.mjs',
      'fsi-app/scripts/verify/quarantine-disposition-audit.mjs',
      'fsi-app/scripts/verify/routing.mjs',
      'fsi-app/scripts/verify/source-link-audit.mjs',
      'fsi-app/scripts/verify/staged-transit-audit.mjs',
      'fsi-app/scripts/verify/substrate-agreement-audit.mjs',
      'fsi-app/scripts/verify/vocab-sync-audit.mjs',
    ],
  },
  'analysis-construction-spec': {
    skillPath: 'fsi-app/.claude/skills/analysis-construction-spec/SKILL.md',
    contentHash: 'f395c5d95e9eab5788e605fbeb846837e2b91132888dbb9328e7ebb3eae8780d',
    citingFiles: [
      'fsi-app/scripts/audit-skill-conformance.mjs',
      'fsi-app/scripts/verify/format-structure.mjs',
    ],
  },
  'source-credibility-model': {
    skillPath: 'fsi-app/.claude/skills/source-credibility-model/SKILL.md',
    contentHash: '3417422d0cf01dd6ba3b0db445f355ba2391ceaeae8ab6938b2ad6941cb5444f',
    citingFiles: [
      'fsi-app/scripts/audit-skill-conformance.mjs',
      'fsi-app/scripts/verify/claims-tier-audit.mjs',
      'fsi-app/scripts/verify/mint-gate-calibration.mjs',
      'fsi-app/scripts/verify/one-tier-per-host-audit.mjs',
      'fsi-app/scripts/verify/orphan-source-audit.mjs',
      'fsi-app/scripts/verify/remediate-orphan-sources.mjs',
      'fsi-app/scripts/verify/unregistered-span-host-audit.mjs',
      'fsi-app/scripts/verify/vocab-sync-audit.mjs',
    ],
  },
  'sprint-followups-discipline': {
    skillPath: 'fsi-app/.claude/skills/sprint-followups-discipline/SKILL.md',
    contentHash: '9bbfb8105eb1f387464456857075faf619c9cc70145a37d1b780d06869b012fa',
    citingFiles: [
      'fsi-app/scripts/verify/column-existence-parity.mjs',
    ],
  },
  'caros-ledge-platform-intent': {
    skillPath: 'fsi-app/.claude/skills/caros-ledge-platform-intent/SKILL.md',
    contentHash: 'a4e4bf419af850c6ec161bcd747a891e5e665a3cfd474223da0225696814cabb',
    citingFiles: [
      'fsi-app/scripts/verify/rls-credential-parity.mjs',
      'fsi-app/scripts/verify/routing.mjs',
      'fsi-app/scripts/verify/surface-visibility-audit.mjs',
    ],
  },
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

/** sha256 of a repo-relative file's EOL-normalized text, or null if it does not exist. */
export function hashFileContent(repoRoot, relPath) {
  const abs = resolve(repoRoot, relPath);
  if (!existsSync(abs)) return null;
  const text = normalizeEol(readFileSync(abs, 'utf8'));
  return createHash('sha256').update(text).digest('hex');
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

/**
 * LIVE scan: every (skill, citingFile) pair found under CITATION_SCAN_ROOTS right now, matching the same
 * `GOVERNING SKILL(S):` marker + window the PINNED_MANIFEST was derived from. Returns { [slug]: string[] }
 * (sorted repo-relative paths). This is what checkDrift() compares the pin against — it can never itself
 * drift from "what the grep would show" because it performs the equivalent scan mechanically.
 */
export function scanCitations(repoRoot) {
  const slugs = listSkillSlugs(repoRoot);
  const bySkill = {};
  const files = CITATION_SCAN_ROOTS.flatMap((root) => walkFiles(resolve(repoRoot, root), CITATION_EXTS));
  for (const abs of files) {
    const rel = toPosix(relative(repoRoot, abs));
    const text = readFileSync(abs, 'utf8');
    CITATION_MARKER.lastIndex = 0;
    let m;
    const found = new Set();
    while ((m = CITATION_MARKER.exec(text))) {
      const window = text.slice(m.index, m.index + CITATION_WINDOW);
      for (const slug of slugs) {
        const re = new RegExp('\\b' + slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b');
        if (re.test(window)) found.add(slug);
      }
    }
    for (const slug of found) (bySkill[slug] ??= new Set()).add(rel);
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
 */
export function checkManifestDrift(manifest, repoRoot, accountLevelSkills = ACCOUNT_LEVEL_SKILLS) {
  const problems = [];
  const live = scanCitations(repoRoot);
  const pinnedSlugs = Object.keys(manifest);

  // 1 + 2: pinned skill file presence + content hash.
  for (const slug of pinnedSlugs) {
    const entry = manifest[slug];
    if (accountLevelSkills.includes(slug)) {
      if (entry.skillPath !== null || entry.contentHash !== null) {
        problems.push({
          type: 'account-level-pin-invalid',
          skill: slug,
          detail: `"${slug}" is listed in ACCOUNT_LEVEL_SKILLS but its PINNED_MANIFEST entry has a ` +
            `skillPath/contentHash — an account-level pin must be explicitly null (no fabricated hash).`,
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
          `(add the slug to ACCOUNT_LEVEL_SKILLS with an explicit null pin) — it cannot be left ambiguous.`,
      });
      continue;
    }
    if (!existsSync(resolve(repoRoot, entry.skillPath))) {
      problems.push({
        type: 'skill-file-missing',
        skill: slug,
        detail: `pinned skill file ${entry.skillPath} no longer exists in the repo.`,
      });
      continue;
    }
    const liveHash = hashFileContent(repoRoot, entry.skillPath);
    if (liveHash !== entry.contentHash) {
      problems.push({
        type: 'skill-content-changed',
        skill: slug,
        detail: `${entry.skillPath} content hash changed (pinned ${entry.contentHash.slice(0, 12)}…, ` +
          `live ${String(liveHash).slice(0, 12)}…) without skill-contract-map.mjs's PINNED_MANIFEST being ` +
          `updated — the skill was edited without the citing code being reviewed against the new text.`,
      });
    }
  }

  // 3: citation dropped — a pinned citing file no longer cites that skill live (edited or deleted).
  for (const slug of pinnedSlugs) {
    const entry = manifest[slug];
    const liveFiles = new Set(live[slug] || []);
    for (const f of entry.citingFiles) {
      if (!liveFiles.has(f)) {
        problems.push({
          type: 'citation-dropped',
          skill: slug,
          file: f,
          detail: `${f} is pinned as citing "${slug}" but no longer does — either the citation comment was ` +
            `edited/removed, or the file is gone. Code changed without the skill contract being reviewed.`,
        });
      }
    }
  }

  // 4: citation unpinned — a live citation (new file, new mention, or a wholly new skill) the pin doesn't know.
  for (const [slug, files] of Object.entries(live)) {
    const pinnedFiles = new Set(manifest[slug]?.citingFiles || []);
    for (const f of files) {
      if (!pinnedFiles.has(f)) {
        problems.push({
          type: 'citation-unpinned',
          skill: slug,
          file: f,
          detail: `${f} cites "${slug}" but PINNED_MANIFEST does not list it for that skill — a new citation ` +
            `was added to code without skill-contract-map.mjs being updated to pin it.`,
        });
      }
    }
  }

  return { ok: problems.length === 0, problems };
}

/** Compare PINNED_MANIFEST (this repo's real snapshot) against the live repo at repoRoot. */
export function checkDrift(repoRoot = REPO) {
  return checkManifestDrift(PINNED_MANIFEST, repoRoot);
}

/** Convenience boolean for callers that just need pass/fail. */
export function isSkillContractClean(repoRoot = REPO) {
  return checkDrift(repoRoot).ok;
}

// ---- CLI (operator utility, mirrors skill-map.mjs's --list/--check style) ----
// Usage: node skill-contract-map.mjs --check   → prints problems (if any) and exits 1, else prints OK and exits 0
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('skill-contract-map.mjs')) {
  const { ok, problems } = checkDrift(REPO);
  if (ok) {
    console.log(`skill-contract-map: OK — ${Object.keys(PINNED_MANIFEST).length} pinned skills, no drift.`);
  } else {
    for (const p of problems) console.error(`[${p.type}] ${p.skill}${p.file ? ' <- ' + p.file : ''}: ${p.detail}`);
    console.error(`skill-contract-map: ${problems.length} drift problem(s).`);
    process.exit(1);
  }
}
