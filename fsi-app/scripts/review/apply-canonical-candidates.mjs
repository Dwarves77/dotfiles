#!/usr/bin/env node
// apply-canonical-candidates.mjs — applies a ruled digest for the canonical-candidates queue
// (`canonical_source_candidates` WHERE decision='pending') (Lane R1, 2026-09-02). Dry by default;
// --apply writes through scripts/lib/db.mjs's guardedUpdateByIds only.
//
// TWO-PHASE ACCEPT (see lib/canonical-candidates.mjs's header for why): "accept" is only auto-applied
// for a row whose candidate_url ALREADY resolves to a registered `sources` row (no new source to create,
// no tier to invent) — it then patches BOTH canonical_source_candidates (decision/promoted_to_source_id)
// AND intelligence_items (source_id/source_url), both through guardedUpdateByIds. A row in an "accept"
// group whose URL is NOT already registered is left untouched and reported under
// `needs_individual_review` — the same fallback bulk-approve/route.ts already uses for an unresolvable
// candidate; run it through the existing /admin canonical-sources UI, which can assign a tier.
// "reject" and "skip" never touch intelligence_items — reject only marks the candidate rejected.
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as CanonicalCandidates from "./lib/canonical-candidates.mjs";
import { validateRuling, isRulingStale } from "./lib/ruling.mjs";
import { canonicalizeUrl } from "../../src/lib/sources/url-canonicalize.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch { /* CI: env injected */ }

export const CITE = Object.freeze({
  skill: "review-queue-ratification-digest",
  reason:
    "Apply an operator-ruled group decision from the canonical-candidates ratification digest (Lane R1, " +
    "2026-09-02, docs/ratifications/2026-09/README.md): accept -> decision='approved' (only for a candidate " +
    "URL already resolving to a registered source; repoints the parent intelligence_items row too), reject " +
    "-> decision='rejected'. Groups are (host x issue_classification); the ruling file names which rows and " +
    "which decision. A row needing a NEW source (no existing registry match) is routed to individual review, " +
    "matching bulk-approve/route.ts's own fallback, never auto-created with an invented tier.",
});

/**
 * Resolve each candidate row's target source id from an in-memory `sources` list, using the SAME
 * canonical-URL-equality rule decide/route.ts and bulk-approve/route.ts already use. Pure.
 * @param {{candidate_url:string}} row
 * @param {Array<{id:string,url:string}>} sources
 * @returns {string|null}
 */
export function resolveExistingSourceId(row, sources) {
  const target = canonicalizeUrl(row.candidate_url);
  const match = sources.find((s) => canonicalizeUrl(s.url) === target);
  return match ? match.id : null;
}

/**
 * @param {{rulingPath: string, apply?: boolean}} opts
 * @param {{readAll: Function, guardedUpdateByIds: Function}} deps
 */
export async function main({ rulingPath, apply = false } = {}, deps) {
  const { readAll, guardedUpdateByIds } = deps;
  const ruling = JSON.parse(readFileSync(rulingPath, "utf8"));
  const m = CanonicalCandidates;

  const validation = validateRuling(ruling, m.ALLOWED_DECISIONS);
  if (!validation.ok) throw new Error(`invalid ruling for ${m.QUEUE_ID}:\n  ${validation.errors.join("\n  ")}`);
  if (ruling.queue !== m.QUEUE_ID) throw new Error(`ruling.queue "${ruling.queue}" does not match this apply script's queue "${m.QUEUE_ID}"`);

  const liveRows = await readAll(m.TABLE, m.SELECT_COLUMNS, { match: m.matchQueue });
  const liveById = new Map(liveRows.map((r) => [r.id, r]));
  const freshest = m.freshestTimestamp(liveRows);
  if (isRulingStale(ruling.generated_at, freshest)) {
    throw new Error(
      `ruling is STALE: generated_at ${ruling.generated_at} predates a live queue row (newest: ${freshest}) — ` +
      `rebuild the digest and re-rule before applying.`
    );
  }

  const sources = await readAll("sources", "id,url");
  console.log(`[apply-canonical-candidates] mode = ${apply ? "APPLY" : "DRY-RUN"}, ${ruling.groups.length} group(s)`);

  const results = [];
  const needsIndividualReview = [];
  for (const group of ruling.groups) {
    if (group.decision === "skip") {
      console.log(`   SKIP   ${group.key} — ${group.row_ids.length} row(s), no mutation`);
      results.push({ key: group.key, decision: "skip", applied: 0, skipped: true });
      continue;
    }
    if (group.decision === "reject") {
      const patch = m.patchForDecision("reject", { reviewerNotes: group.rationale ?? null });
      if (!apply) {
        console.log(`   WOULD  ${group.key} (reject) — ${group.row_ids.length} row(s)`);
        results.push({ key: group.key, decision: "reject", would_apply: group.row_ids.length });
        continue;
      }
      const res = await guardedUpdateByIds(m.TABLE, group.row_ids, patch, { cite: CITE, select: "id", applyMatch: m.matchQueue });
      console.log(`   APPLIED ${group.key} (reject) — ${res.updated} of ${group.row_ids.length} row(s)`);
      results.push({ key: group.key, decision: "reject", applied: res.updated, chunks: res.chunks, halvings: res.halvings });
      continue;
    }
    // accept
    const resolvable = [];
    for (const id of group.row_ids) {
      const row = liveById.get(id);
      if (!row) continue; // left the queue since the digest was built — applyMatch below would skip it anyway
      const sourceId = resolveExistingSourceId(row, sources);
      if (sourceId) resolvable.push({ id, itemId: row.intelligence_item_id, sourceId, candidateUrl: canonicalizeUrl(row.candidate_url) });
      else needsIndividualReview.push({ candidateId: id, itemId: row.intelligence_item_id, candidateUrl: row.candidate_url, reason: "URL not in source registry — needs a new source + tier; use /admin canonical-sources individually" });
    }
    if (!apply) {
      console.log(`   WOULD  ${group.key} (accept) — ${resolvable.length} auto-resolvable, ${group.row_ids.length - resolvable.length} need individual review`);
      results.push({ key: group.key, decision: "accept", would_apply: resolvable.length, would_review: group.row_ids.length - resolvable.length });
      continue;
    }
    let applied = 0;
    for (const r of resolvable) {
      const patch = m.patchForDecision("accept", { reviewerNotes: group.rationale ?? null });
      patch.promoted_to_source_id = r.sourceId;
      const candRes = await guardedUpdateByIds(m.TABLE, [r.id], patch, { cite: CITE, select: "id", applyMatch: m.matchQueue });
      const itemRes = await guardedUpdateByIds(
        "intelligence_items",
        [r.itemId],
        { source_id: r.sourceId, source_url: r.candidateUrl },
        { cite: CITE, select: "id" }
      );
      applied += candRes.updated > 0 && itemRes.updated > 0 ? 1 : 0;
    }
    console.log(`   APPLIED ${group.key} (accept) — ${applied} of ${resolvable.length} auto-resolvable row(s); ${group.row_ids.length - resolvable.length} routed to individual review`);
    results.push({ key: group.key, decision: "accept", applied, needs_individual_review: group.row_ids.length - resolvable.length });
  }
  return { queue: m.QUEUE_ID, mode: apply ? "apply" : "dry-run", results, needs_individual_review: needsIndividualReview };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const idx = args.indexOf("--ruling");
  const rulingPath = idx >= 0 ? args[idx + 1] : undefined;
  if (!rulingPath) {
    console.error("[apply-canonical-candidates] --ruling <file.json> is required.");
    process.exit(2);
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("[apply-canonical-candidates] no DB creds — cannot run here (exit 2).");
    process.exit(2);
  }
  const { readAll, guardedUpdateByIds } = await import("../lib/db.mjs");
  main({ rulingPath, apply: args.includes("--apply") }, { readAll, guardedUpdateByIds }).catch((e) => {
    console.error("[apply-canonical-candidates] fatal:", e);
    process.exit(1);
  });
}
