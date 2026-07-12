// STEP 2 — RETROACTIVE ADJUDICATION (RD-5 spirit: the matcher changed → re-validate everything it judged).
// READ-ONLY. Re-runs the FIXED matchExistingSubject (canonicalizeUrl, no _normUrl) over every rejected/failed
// new_item staged_updates row, against the LIVE corpus, and reports the FLIP list: rows the D1 matcher rejected
// as a duplicate that the fixed matcher now clears (false-rejections = items D1 wrongly blocked). Also confirms
// the dedup:linked cross-reference population (origin='entity_extraction') for the wrong-link half.
//
// Run: node scripts/_diag/_step2-retro-adjudication.mjs
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const { readClient, readAll } = await import("../lib/db.mjs");
const { matchExistingSubject } = await import("../../src/lib/entities/entity-resolve.mjs");
const sb = readClient();

// 1 — LIVE corpus (the dedup universe), WITH source_url (the axis D1 corrupted).
const corpus = (await readAll("intelligence_items", "id,title,instrument_identifier,source_url,is_archived", { match: (q) => q.eq("is_archived", false) }))
  .filter((i) => !i.is_archived)
  .map((i) => ({ id: i.id, title: i.title, instrument_identifier: i.instrument_identifier, source_url: i.source_url }));
const byId = new Map(corpus.map((c) => [c.id, c]));

// 2 — every rejected/failed new_item staged row (the population the D1 dedup could have wrongly blocked).
const { data: staged } = await sb
  .from("staged_updates")
  .select("id,status,update_type,proposed_changes,reason,reviewer_notes,materialization_error,materialized_item_id")
  .eq("update_type", "new_item");
const candidates = (staged || []).filter((r) =>
  r.status === "rejected" || (r.materialization_error && r.materialization_error.length > 0)
);

console.log(`\n═══ STEP 2 — RETRO-ADJUDICATION (corpus ${corpus.length} active; ${candidates.length} rejected/failed new_item staged rows) ═══\n`);

const flips = [];
for (const r of candidates) {
  const pc = r.proposed_changes || {};
  const cand = { title: pc.title, instrument_identifier: pc.instrument_identifier, source_url: pc.source_url };
  const notes = `${r.reason || ""} ${r.reviewer_notes || ""} ${r.materialization_error || ""}`;
  const wasDedupReject = /dedup|subject already exists|duplicate/i.test(notes);
  const now = matchExistingSubject(cand, corpus); // FIXED matcher
  const verdict = now.length === 0 ? "CLEAR (no dup)" : `MATCHES ${now.map((m) => `${m.id.slice(0, 8)}(${m.how})`).join(",")}`;
  // A TRUE D1 false-rejection: rejected-as-dup, still UNMATERIALIZED, and now CLEAR. An already-materialized
  // row (materialized_item_id set) was RESOLVED (e.g. legacy_id reconciliation) — matchExistingSubject does
  // NOT check legacy_id, so its CLEAR is expected and does NOT mean resurrect (that would duplicate the item).
  const flip = wasDedupReject && now.length === 0 && r.status === "rejected" && !r.materialized_item_id;
  if (flip) flips.push({ id: r.id, cand, url: pc.source_url });
  console.log(`• ${r.status.toUpperCase()} "${(pc.title || "").slice(0, 60)}"`);
  console.log(`    url=${pc.source_url}`);
  console.log(`    was-dedup-reject=${wasDedupReject}  →  fixed-matcher: ${verdict}  ${flip ? "  ⇐ FLIP (false-rejection, resurrect)" : ""}`);
}

// 3 — confirm the two proof instruments are genuinely ABSENT (true resurrections, not real dups the fix missed).
const present = (needle) => corpus.filter((c) =>
  (c.instrument_identifier || "").includes(needle) ||
  (c.title || "").includes(needle) ||
  (c.source_url || "").includes(needle)
).map((c) => `${c.id.slice(0, 8)} "${(c.title || "").slice(0, 40)}"`);
console.log(`\n─ corpus presence check ─`);
for (const n of ["2020/1056", "32020R1056", "2024/1157", "32024R1157"])
  console.log(`  ${n}: ${present(n).length ? present(n).join("; ") : "ABSENT"}`);

// 4 — the corpus items the D1 matcher falsely matched (from the rejection notes), and their real source_urls.
console.log(`\n─ the falsely-matched corpus items (why D1 collided them) ─`);
for (const id8 of ["40c05a1e", "51b2c91e", "ab922a18"]) {
  const hit = corpus.find((c) => c.id.startsWith(id8));
  console.log(`  ${id8}: ${hit ? `"${(hit.title || "").slice(0, 46)}" url=${hit.source_url}` : "(not in active corpus)"}`);
}

// 5 — wrong-link half: dedup:linked cross-references (origin='entity_extraction').
const { count: xrefCount } = await sb.from("item_cross_references").select("*", { count: "exact", head: true }).eq("origin", "entity_extraction");
console.log(`\n─ dedup:linked cross-references (origin=entity_extraction): ${xrefCount ?? 0} ─`);

console.log(`\n═══ FLIP SUMMARY: ${flips.length} false-rejection(s) to resurrect ═══`);
for (const f of flips) console.log(`  RESURRECT staged ${f.id}  "${f.cand.title.slice(0, 60)}"`);
process.exit(0);
