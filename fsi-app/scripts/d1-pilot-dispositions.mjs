/** D1 PILOT DISPOSITIONS (research-or-erase, Jason's content-grounded rulings 2026-06-09).
 *  Every item below was INVESTIGATED via its stored content (content-45.mjs) before disposition —
 *  investigate-before-discard (remediation-discipline RD-1 / RD-4). Each disposition removes the item
 *  from the live-quarantined set, driving quarantine-disposition-audit.mjs toward 0.
 *
 *    ARCHIVE (off-vertical / marginal, researched then ruled out):
 *      49e7f4ac multifamily housing · 10f3d5b0 highway litter · 5f1095c9 municipal energy
 *      (brief: "freight not regulated") · 7126e83b local road construction · 2473ece6 local sustainability
 *    REGISTER-AS-SOURCE (a journal / a law-aggregation portal = a SOURCE, not an item):
 *      r9 ScienceDirect (journal) · 402d311f Colorado General Assembly laws portal (row becomes the source)
 *    REGISTER PORTAL + KEEP ITEM (brief synthesises real intel beyond the portal = the discriminator):
 *      282e480c Brazil Min-Transport
 *    KEEP (valuable; stays in the research-or-erase pipeline for the fix run):
 *      878294c8 LEED v5 (warehouse/Ops-scoped) · 496340f0 Iowa DOT freight planning
 *
 *  GOVERNING: remediation-discipline (research-or-erase; classify-before-discard) + source-credibility-model
 *  (source-not-item -> registered, never archived-without-registration) + environmental-policy-and-innovation
 *  (integrity: honest archive, never forced).  DRY-RUN default; --apply to write. */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readAll, readClient, archiveRows, reclassifyToSource, registerSource } from "./lib/db.mjs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}
const APPLY = process.argv.includes("--apply");
const sb = readClient();
const STAMP = "2026-06-09T00:00:00.000Z";

const ARCHIVE = ["49e7f4ac", "10f3d5b0", "5f1095c9", "7126e83b", "2473ece6"];
const RECLASSIFY = ["r9", "402d311f"];           // register-as-source + archive (row IS the source)
const REGISTER_KEEP = ["282e480c"];               // register portal source, KEEP item (fix-run pipeline)
const KEEP = ["878294c8", "496340f0"];            // no mutation; stays quarantined for the fix run

const items = await readAll("intelligence_items", "id,legacy_id,title,source_url,source_id,provenance_status,is_archived");
const sources = await readAll("sources", "id,name,url,status");
const srcById = new Map(sources.map((s) => [s.id, s]));
const resolve1 = (k) => items.find((it) => it.legacy_id === k || it.id.startsWith(k));

const plan = (keys, kind) => keys.map((k) => { const it = resolve1(k); return { k, it, kind, src: it ? srcById.get(it.source_id) : null }; });
const all = [...plan(ARCHIVE, "ARCHIVE"), ...plan(RECLASSIFY, "RECLASSIFY"), ...plan(REGISTER_KEEP, "REGISTER+KEEP"), ...plan(KEEP, "KEEP")];

console.log(`\n===== D1 PILOT DISPOSITIONS (${APPLY ? "APPLY" : "DRY-RUN"}) =====`);
for (const p of all) {
  if (!p.it) { console.log(`  ✗ ${p.k}: NOT FOUND`); continue; }
  console.log(`  [${p.kind.padEnd(13)}] ${(p.it.legacy_id || p.it.id.slice(0, 8)).padEnd(12)} arch=${p.it.is_archived} prov=${p.it.provenance_status} src="${p.src?.name || "?"}"(${p.src?.status}) ${(p.it.title || "").slice(0, 40)}`);
}
const missing = all.filter((p) => !p.it);
if (missing.length) { console.error(`\nABORT: ${missing.length} keys unresolved.`); process.exit(1); }
if (!APPLY) { console.log(`\nDRY-RUN — pass --apply. ARCHIVE ${ARCHIVE.length} (off_vertical), RECLASSIFY ${RECLASSIFY.length}, REGISTER+KEEP ${REGISTER_KEEP.length}, KEEP ${KEEP.length} (no-op).`); process.exit(0); }

const verify = async (id) => (await sb.from("intelligence_items").select("is_archived,archive_reason,provenance_status").eq("id", id).single()).data;

// 1) ARCHIVE — off_vertical (NON-sourcey reason; the migration-135 source guard does not gate it).
const archCite = { skill: "remediation-discipline", reason: "research-or-erase disposition: investigated via content, off-vertical/marginal -> honest archive (Jason ruling 2026-06-09)" };
for (const p of all.filter((x) => x.kind === "ARCHIVE")) {
  const r = await archiveRows("intelligence_items", [p.it.id], { cite: archCite, archive_reason: "off_vertical", stampIso: STAMP });
  const v = await verify(p.it.id);
  console.log(`  ARCHIVE ${p.it.legacy_id || p.it.id.slice(0, 8)} -> is_archived=${v?.is_archived} reason=${v?.archive_reason}  (snap ${r.snapshot.split(/[\\/]/).pop()})`);
}

// 2) RECLASSIFY — register-as-source (idempotent; source already exists/active) + archive reclassified_to_source.
const reCite = { skill: "source-credibility-model", reason: "research-or-erase: journal/law-portal = source-not-item -> register-as-source, the row becomes the source (Jason ruling 2026-06-09)" };
for (const p of all.filter((x) => x.kind === "RECLASSIFY")) {
  const r = await reclassifyToSource(p.it.id, { url: p.it.source_url, name: p.src?.name }, { cite: reCite, stampIso: STAMP });
  const v = await verify(p.it.id);
  console.log(`  RECLASSIFY ${p.it.legacy_id || p.it.id.slice(0, 8)} -> source_id=${r.source_id} created=${r.created} is_archived=${v?.is_archived} reason=${v?.archive_reason}`);
}

// 3) REGISTER PORTAL + KEEP ITEM — register the source (idempotent), do NOT archive the item.
const regCite = { skill: "source-credibility-model", reason: "register the primary-law/transport portal as a scannable source (pure upside); KEEP the item — its brief synthesises intel beyond the portal (Jason ruling 2026-06-09)" };
for (const p of all.filter((x) => x.kind === "REGISTER+KEEP")) {
  const r = await registerSource({ url: p.it.source_url, name: p.src?.name }, { cite: regCite, stampIso: STAMP });
  const v = await verify(p.it.id);
  console.log(`  REGISTER+KEEP ${p.it.legacy_id || p.it.id.slice(0, 8)} -> source_id=${r.source_id} created=${r.created} (item KEPT: is_archived=${v?.is_archived} prov=${v?.provenance_status} -> fix-run pipeline)`);
}

for (const p of all.filter((x) => x.kind === "KEEP")) console.log(`  KEEP ${p.it.legacy_id || p.it.id.slice(0, 8)} (no mutation; stays quarantined for the fix run)`);

console.log(`\nDone. Re-run scripts/verify/quarantine-disposition-audit.mjs to see the backlog drop.`);
