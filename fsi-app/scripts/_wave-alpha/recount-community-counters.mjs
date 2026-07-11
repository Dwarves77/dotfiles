/**
 * recount-community-counters.mjs — Wave-α Track D d1 companion (run AFTER migration 190 applies).
 *
 * Service-role one-shot recount of every derived community counter, repairing any drift
 * accumulated while the trigger functions ran as SECURITY INVOKER (DB-4 F10) and seeding
 * weekly_post_count, which had no writer before migration 190 (DB-4 F9).
 *
 * Recomputes, per row, from the underlying tables (deterministic — safe to re-run any time):
 *   community_groups.member_count       = count(community_group_members rows)
 *   community_groups.weekly_post_count  = count(community_posts in trailing 7 days, replies included)
 *   community_posts.reply_count         = count(child posts)  [top-level posts only]
 *   case_studies.peer_validation_count  = count(case_study_endorsements rows)
 *
 * Prints BEFORE/AFTER per drifted row; writes only drifted rows (idempotent: second run
 * prints "0 drifted"). Writes go through the guarded path (rule 015) — snapshot + cite.
 *
 * Usage:  node scripts/_wave-alpha/recount-community-counters.mjs [--dry-run]
 */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch { /* env may come from the shell */ }

const { readAll, guardedUpdate } = await import("../lib/db.mjs");

const DRY = process.argv.includes("--dry-run");
const CITE = {
  skill: "sprint-followups-discipline",
  reason: "Wave-α Track D d1 (mig 190 companion): repair counter drift from INVOKER-era triggers + seed weekly_post_count (DB-4 F9/F10)",
};

const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

async function repair(label, table, rows, expectedFor, patchFor) {
  let drifted = 0;
  for (const row of rows) {
    const expected = expectedFor(row);
    const mismatch = Object.entries(expected).some(([k, v]) => row[k] !== v);
    if (!mismatch) continue;
    drifted++;
    const before = Object.fromEntries(Object.keys(expected).map((k) => [k, row[k]]));
    console.log(`[${label}] ${row.id}: BEFORE ${JSON.stringify(before)} -> AFTER ${JSON.stringify(expected)}`);
    if (!DRY) {
      const res = await guardedUpdate(table, (q) => q.eq("id", row.id), patchFor(expected), { cite: CITE });
      if (res.updated !== 1) throw new Error(`[${label}] ${row.id}: expected 1 row updated, got ${res.updated}`);
    }
  }
  console.log(`[${label}] ${rows.length} scanned, ${drifted} drifted${DRY ? " (dry-run, no writes)" : " repaired"}`);
  return drifted;
}

// ── community_groups: member_count + weekly_post_count ──────────────────────
const groups = await readAll("community_groups", "id, name, member_count, weekly_post_count");
const members = await readAll("community_group_members", "group_id, user_id");
const posts = await readAll("community_posts", "id, group_id, parent_post_id, created_at");

const memberCounts = new Map();
for (const m of members) memberCounts.set(m.group_id, (memberCounts.get(m.group_id) ?? 0) + 1);
const weeklyCounts = new Map();
for (const p of posts) {
  if (p.created_at >= sevenDaysAgo) weeklyCounts.set(p.group_id, (weeklyCounts.get(p.group_id) ?? 0) + 1);
}

const groupDrift = await repair(
  "community_groups",
  "community_groups",
  groups,
  (g) => ({
    member_count: memberCounts.get(g.id) ?? 0,
    weekly_post_count: weeklyCounts.get(g.id) ?? 0,
  }),
  (expected) => expected
);

// ── community_posts: reply_count on top-level posts ──────────────────────────
const replyCounts = new Map();
for (const p of posts) {
  if (p.parent_post_id) replyCounts.set(p.parent_post_id, (replyCounts.get(p.parent_post_id) ?? 0) + 1);
}
const topLevel = posts.filter((p) => !p.parent_post_id);
// reply_count isn't in the shared `posts` read (kept lean); re-read just top-level counts.
const topLevelWithCounts = await readAll("community_posts", "id, reply_count", {
  match: (q) => q.is("parent_post_id", null),
});
const postDrift = await repair(
  "community_posts",
  "community_posts",
  topLevelWithCounts,
  (p) => ({ reply_count: replyCounts.get(p.id) ?? 0 }),
  (expected) => expected
);

// ── case_studies: peer_validation_count ─────────────────────────────────────
const caseStudies = await readAll("case_studies", "id, title, peer_validation_count");
const endorsements = await readAll("case_study_endorsements", "case_study_id, endorser_id");
const endorseCounts = new Map();
for (const e of endorsements) endorseCounts.set(e.case_study_id, (endorseCounts.get(e.case_study_id) ?? 0) + 1);
const csDrift = await repair(
  "case_studies",
  "case_studies",
  caseStudies,
  (c) => ({ peer_validation_count: endorseCounts.get(c.id) ?? 0 }),
  (expected) => expected
);

console.log(
  `\nDONE${DRY ? " (dry-run)" : ""}: groups=${groupDrift} posts=${postDrift} case_studies=${csDrift} drifted ` +
  `(scanned ${groups.length} groups / ${topLevel.length} top-level posts / ${caseStudies.length} case studies).`
);
