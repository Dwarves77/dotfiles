/** DEFERRAL CORRECTION for d5ee6ab8 (standing dispatch item 2, 2026-07-06) — pure-node GUARDED write with
 *  byte-compare read-back. d5ee6ab8's Fork-B deferral carried the GENERIC "blocked on funded re-ground" reason,
 *  but the item's true class is a COUNSEL hold (phase2_priority_review honest exit, counsel_NO_SOURCE_QUALIFIED,
 *  2026-06-20): declared primary fetched, no floor-qualifying source found via bounded official-alternative
 *  search. Rewrite the deferral to that true class — event = a SEEK-MORE attempt after the transport unit ships
 *  and cadence is set; backstop 2026-10-31. Reports (read-only) the counsel-hold provenance + l1 verification
 *  provenance + 9c5d1d17 empty-brief confirmation in the same audit artifact. DRY-RUN default; --apply writes. */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readClient, readAll, guardedUpdate } from "./lib/db.mjs";
import { assertValidDeferral } from "./lib/deferral.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}
const APPLY = process.argv.includes("--apply");
const sb = readClient();
const now = new globalThis.Date();
// Canonical deep-equal for a JSONB column: Postgres normalizes JSONB key ORDER, so a raw JSON.stringify
// read-back mismatches even on identical data. The honest byte-compare analog for JSONB is a key-sorted
// canonical stringify — same semantic content = equal. (Text columns still use exact string compare.)
function canon(v) {
  if (Array.isArray(v)) return "[" + v.map(canon).join(",") + "]";
  if (v && typeof v === "object") return "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + canon(v[k])).join(",") + "}";
  return JSON.stringify(v);
}

const idOf = async (key) => { const rows = await readAll("intelligence_items", "id,legacy_id,provenance_status,provenance_verified_at,last_regenerated_at,regeneration_skill_version,full_brief", { match: (q) => q.eq("is_archived", false) }); return rows.find((r) => r.legacy_id === key || r.id.slice(0, 8) === key); };

// ── read-only provenance lines (audit) ──
const d5 = await idOf("d5ee6ab8"), l1 = await idOf("l1"), c9 = await idOf("9c5d1d17");
console.log("\n===== PROVENANCE LINES (read-only audit) =====");
const d5Flags = await readAll("integrity_flags", "id,created_by,status,description,created_at,recommended_actions", { match: (q) => q.eq("subject_type", "item").eq("subject_ref", d5.id) });
const counsel = d5Flags.find((f) => f.created_by === "phase2_priority_review" && f.status === "open");
console.log(`  d5ee6ab8 counsel-hold provenance: written by "${counsel?.created_by}" @${String(counsel?.created_at).slice(0, 10)} — ${(counsel?.description || "").slice(0, 100)}`);
console.log(`  l1 verification provenance: status=${l1?.provenance_status} verified_at=${String(l1?.provenance_verified_at).slice(0, 19)} last_regen=${String(l1?.last_regenerated_at).slice(0, 10)} skill=${l1?.regeneration_skill_version} → ${l1?.provenance_verified_at && new globalThis.Date(l1.provenance_verified_at) < new globalThis.Date("2026-07-01") ? "LONG-VERIFIED (pre-July, not a 4c flip)" : "recent"}`);
console.log(`  9c5d1d17 empty-brief confirm: status=${c9?.provenance_status} full_brief_len=${(c9?.full_brief || "").length} → ${((c9?.full_brief || "").length === 0) ? "EMPTY (expected held-loser state; brief erased)" : "NON-EMPTY (investigate)"}`);

// ── the corrected deferral payload (true class = counsel_NO_SOURCE_QUALIFIED, seek-more event) ──
const CORRECTED = {
  reason: "Blocked on counsel_NO_SOURCE_QUALIFIED (phase2 priority-review honest exit, 2026-06-20): declared primary fetched but no floor-qualifying primary source found via bounded official-alternative search. Awaits a SEEK-MORE re-ground attempt (register a floor-qualifying primary source, then re-ground) after the transport unit ships and cadence is set; else route to counsel.",
  deferred_until: "2026-10-31T00:00:00.000Z",
  owner: "operator (Jason)",
  resolution_event: "Seek-more re-ground attempt after the transport unit ships and the scrape cadence is set (backstop 2026-10-31): search for and register a floor-qualifying primary source, then re-ground; if none qualifies, route to counsel review.",
};
assertValidDeferral(CORRECTED, now);
const defFlag = d5Flags.find((f) => f.created_by === "disposition_deferred" && f.status === "open");
if (!defFlag) { console.log("\nNO open disposition_deferred flag on d5ee6ab8 — nothing to correct."); process.exit(1); }
const newRA = [{ deferral: CORRECTED }];
const newDesc = "Fork-B deferral CORRECTED (2026-07-06) to true class = counsel_NO_SOURCE_QUALIFIED; event = seek-more after transport unit + cadence; backstop 2026-10-31.";
console.log(`\n===== DEFERRAL CORRECTION (${APPLY ? "APPLY" : "DRY-RUN"}) =====\n  target flag: ${defFlag.id}\n  corrected reason: ${CORRECTED.reason.slice(0, 90)}...`);

// idempotent: if the flag already carries the corrected payload, do not re-write.
if (canon(defFlag.recommended_actions) === canon(newRA) && defFlag.description === newDesc) {
  console.log("\n  ALREADY CORRECTED — flag matches the intended payload (canonical), no write."); process.exit(0);
}
if (!APPLY) { console.log("\nDRY-RUN — payload valid (assertValidDeferral passed). Pass --apply to write."); process.exit(0); }

const upd = await guardedUpdate("integrity_flags", (qb) => qb.eq("id", defFlag.id), { recommended_actions: newRA, description: newDesc },
  { cite: { skill: "remediation-discipline", reason: "item 2: correct d5ee6ab8 Fork-B deferral to true class (counsel_NO_SOURCE_QUALIFIED, seek-more event); dedup-loser premise superseded" } });
// read-back (fresh client): CANONICAL deep-equal for the JSONB recommended_actions (JSONB normalizes key
// order, so this is the honest byte-compare analog) + exact string compare for the text description.
const fresh = readClient();
const { data: back } = await fresh.from("integrity_flags").select("recommended_actions,description").eq("id", defFlag.id).single();
const persistedOk = canon(back?.recommended_actions) === canon(newRA) && back?.description === newDesc;
if (upd.updated !== 1 || !persistedOk) { console.log(`  WRITE DID NOT PERSIST (updated=${upd.updated}, canonical-match=${persistedOk}) — HALT`); process.exit(3); }
console.log(`  CORRECTED [canonical read-back OK] (snapshot ${upd.snapshot})`);
process.exit(0);
