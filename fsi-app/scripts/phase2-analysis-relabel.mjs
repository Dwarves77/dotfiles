/** STAGE C — Phase 2 (b)-NARROW per-fact ANALYSIS relabel (per docs/PHASE2-FLAGSHIP-REGROUND-RUNBOOK.md).
 *
 *  PURPOSE. After the network re-ground pass (phase2-reground.mjs) re-anchors every PRIMARY-recoverable
 *  FACT to T1/2, a residue of FACT claims remains below the reg authority floor because they are
 *  SECONDARY-ONLY (no primary equivalent). This layer relabels the NARROW, mechanically-safe subset of
 *  that residue from FACT to ANALYSIS so the brief presents them HONESTLY as analysis, not as verified
 *  fact. It NEVER manufactures prose and NEVER edits the stored fact.
 *
 *  GUARDRAIL (operator-locked 2026-06-15, rider-1 = 1A ONLY). A claim is relabel-eligible IFF:
 *    - claim_kind = 'FACT', and
 *    - the item is reg-family + CRITICAL/HIGH and the claim is below the floor (tier NULL or not in 1,2), and
 *    - the STORED claim_text is ALREADY a raw, case-insensitive substring of its section's content_md,
 *      occurring EXACTLY ONCE (ambiguous / absent => NOT eligible; it falls to the honest residual).
 *  For an eligible claim the ONLY two changes are:
 *    (1) claim_kind: FACT -> ANALYSIS   (claim_text BYTE-IDENTICAL — never touched), and
 *    (2) content_md: the FIXED marker token "*Industry interpretation:* " inserted at the known offset
 *        immediately before the existing sentence — a PURE INSERTION, surrounding bytes + whitespace
 *        byte-identical (no reflow, no paraphrase).
 *  There is deliberately NO claim_text-editing path (no [slot]-strip, no normalization match). Editing the
 *  stored fact until it matches the prose is the fake-certification pattern in miniature; it is rejected.
 *  Claims whose claim_text is not already a verbatim content_md substring (~76% — table-formatted /
 *  paraphrased facts) stay as the item's HONEST priority_review residual; they are never dropped here.
 *
 *  DIFF-ASSERT (the guardrail made mechanical, asserted on content_md DIRECTLY). For every section touched:
 *  each marker insert is verified by its INVERSE — removing the marker token at its offset must reproduce
 *  the pre-insert string byte-for-byte. Any deviation aborts the whole item (no partial write). claim_text
 *  is never written, so it is byte-identical by construction; the flag audit records old/new for both.
 *
 *  HARD APPLY PRECONDITION (per item, operator-locked). --apply REFUSES an item unless its network
 *  re-ground pass has completed — proven by: provenance_status='verified' (reground succeeded; skip,
 *  nothing to relabel) OR an open integrity_flag created_by='phase2_priority_review' (reground ran and
 *  honest-exited). A quarantined item with NO such flag means reground has NOT run; relabeling it now would
 *  demote PRIMARY-RECOVERABLE facts to ANALYSIS before reground can anchor them T1/2 — so it is refused.
 *  DRY-RUN ignores the precondition (it only projects current state and writes nothing).
 *
 *  MUTATION PATH. pg-direct (raw TCP), trigger-disabled bulk like scripts/backfill-claim-tiers-pg.mjs,
 *  per item in one transaction, then ONE server-side revalidation of that item; record a
 *  'phase2_analysis_relabel' integrity_flag (audit trail + reground idempotent-skip).
 *
 *  GOVERNING: analysis-construction-spec + source-credibility-model + remediation-discipline.
 *  DRY-RUN default; --apply to commit; --only=id1,id2; --limit=N. */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync, writeFileSync } from "node:fs";
import pg from "pg";
import { readClient, readAll } from "./lib/db.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}
const APPLY = process.argv.includes("--apply");
const ONLY = (() => { const a = process.argv.find((x) => x.startsWith("--only=")); return a ? a.slice(7).split(",").map((s) => s.trim()).filter(Boolean) : null; })();
const LIMIT = (() => { const a = process.argv.find((x) => x.startsWith("--limit=")); return a ? parseInt(a.slice(8), 10) : Infinity; })();
const sb = readClient();

// The fixed marker token (must equal validate_item_provenance c_analysis_labels[3], with a trailing space
// so it reads as a prefix). Inserting it makes criterion-4 label discipline pass for the relabeled claim.
const MARKER = "*Industry interpretation:* ";
const REG_FAMILY = new Set(["regulation", "directive", "standard", "guidance", "framework"]);
const belowFloor = (tier) => tier == null || ![1, 2].includes(tier);

// the 30 flip items (keys = legacy_id or id-prefix), same set as phase2-reground.mjs.
const FLIP_KEYS = ["eu_ets_directive_2023_959","eu_clean_trucking_2024_1610","7a0ead55","5cc10a6d","e2e03e1b",
  "eu-emissions-trading-system-ets-extension-to-maritime-transport","eu-corporate-sustainability-reporting-directive-csrd-transport-provisions",
  "eu-corporate-sustainability-reporting-directive-csrd-transport-sector-implementa","3ae89ce6","d5ee6ab8","o6","93c344a1",
  "d56ca4e1","89656109","0ea6a710","cd5c84e3","de2df788","bec305e1","a4","782878c0","d935e112","27dfbe4c","6a857887",
  "ad4cc6c6","japan-green-transformation-gx-freight-transport-standards","japan-s-updated-top-runner-program-for-heavy-duty-vehicles",
  "india-s-national-logistics-policy-carbon-intensity-standards","03b5f234","82f09535","g19"];

// Case-insensitive locate requiring EXACTLY ONE occurrence; returns the byte offset in the ORIGINAL md, or
// -1 (absent or ambiguous). No normalization — strict raw substring per guardrail 1A.
function locateOnce(md, claimText) {
  const hay = md.toLowerCase(), needle = claimText.toLowerCase();
  if (!needle) return -1;
  const first = hay.indexOf(needle);
  if (first < 0) return -1;
  if (hay.indexOf(needle, first + 1) >= 0) return -2; // ambiguous (multiple) -> not eligible
  return first;
}
// PURE-INSERTION diff-assert: inserting MARKER at off must be reversible to `md` byte-for-byte.
function insertMarker(md, off) {
  const next = md.slice(0, off) + MARKER + md.slice(off);
  const back = next.slice(0, off) + next.slice(off + MARKER.length); // remove exactly the inserted token
  if (back !== md) throw new Error(`diff-assert FAILED: marker insertion at ${off} is not a pure insertion`);
  if (next.length !== md.length + MARKER.length) throw new Error(`diff-assert FAILED: length delta != marker length`);
  return next;
}

const items = await readAll("intelligence_items", "id,legacy_id,title,item_type,priority,provenance_status", { match: (q) => q.eq("is_archived", false) });
const byKey = new Map(); for (const it of items) { byKey.set(it.legacy_id, it); byKey.set(it.id.slice(0, 8), it); }
let targets = FLIP_KEYS.map((k) => ({ key: k, it: byKey.get(k) })).filter((t) => t.it);
if (ONLY) targets = targets.filter((t) => ONLY.includes(t.key) || ONLY.includes(t.it.legacy_id) || ONLY.includes(t.it.id.slice(0, 8)));
targets = targets.slice(0, LIMIT);

// reground-completion proof: open phase2_priority_review flag on the item.
async function regroundCompleted(it) {
  if (it.provenance_status === "verified") return true; // reground succeeded
  const { data } = await sb.from("integrity_flags").select("id").eq("subject_ref", it.id).eq("status", "open").eq("created_by", "phase2_priority_review").limit(1);
  return (data?.length ?? 0) > 0;
}

// Build the per-item relabel plan from STORED state (read-only). Returns { eligible:[{claim, sectionId, off}],
// residual:int, belowTotal:int, sections:Map<id,content_md> }.
async function planItem(it) {
  const claims = await readAll("section_claim_provenance", "id,section_row_id,claim_text,claim_kind,source_tier_at_grounding",
    { match: (q) => q.eq("intelligence_item_id", it.id).eq("claim_kind", "FACT") });
  const regHigh = REG_FAMILY.has(it.item_type) && ["CRITICAL", "HIGH"].includes(it.priority);
  const secIds = [...new Set(claims.map((c) => c.section_row_id).filter(Boolean))];
  const sections = new Map();
  for (const sid of secIds) { const { data } = await sb.from("intelligence_item_sections").select("id,content_md").eq("id", sid).single(); if (data) sections.set(sid, data.content_md || ""); }
  const eligible = []; let belowTotal = 0, residual = 0;
  for (const c of claims) {
    if (!regHigh || !belowFloor(c.source_tier_at_grounding)) continue; // floor only bites reg-family CRITICAL/HIGH
    belowTotal++;
    const md = sections.get(c.section_row_id);
    if (md == null) { residual++; continue; }
    const off = locateOnce(md, c.claim_text || "");
    if (off < 0) { residual++; continue; } // absent (-1) or ambiguous (-2) -> honest residual
    // idempotency: skip if MARKER already immediately precedes the sentence
    if (md.slice(Math.max(0, off - MARKER.length), off) === MARKER) { residual++; continue; }
    eligible.push({ claimId: c.id, sectionId: c.section_row_id, off, claimText: c.claim_text });
  }
  return { eligible, residual, belowTotal, sections };
}

console.log(`\n===== PHASE 2 (b)-NARROW ANALYSIS RELABEL (${APPLY ? "APPLY" : "DRY-RUN"}) — ${targets.length} item(s) =====`);
console.log(`marker token = ${JSON.stringify(MARKER)} | guardrail = 1A (raw-substring only, claim_text byte-identical)\n`);

// ---------- DRY-RUN: projection only, no writes, no precondition gate ----------
if (!APPLY) {
  let totEligible = 0, totResidual = 0, totBelow = 0, flipCandidates = 0, partial = 0, clean = 0;
  for (const t of targets) {
    const p = await planItem(t.it);
    totEligible += p.eligible.length; totResidual += p.residual; totBelow += p.belowTotal;
    const allCleared = p.belowTotal > 0 && p.residual === 0; // every below-floor fact relabelable
    if (p.belowTotal === 0) clean++;
    else if (allCleared) flipCandidates++;
    else partial++;
    const tag = p.belowTotal === 0 ? "no-below-floor" : allCleared ? "FLIP-CANDIDATE" : "stays-quarantined(residual)";
    console.log(`  ${(t.it.legacy_id || t.it.id.slice(0,8)).padEnd(34)} ${(t.it.item_type||"").padEnd(11)} ${(t.it.priority||"").padEnd(8)} below=${String(p.belowTotal).padStart(3)} relabel=${String(p.eligible.length).padStart(3)} residual=${String(p.residual).padStart(3)}  ${tag}`);
  }
  console.log(`\n--- PROJECTION (current state; --apply will additionally require reground-complete per item) ---`);
  console.log(`below-floor FACTs across 30: ${totBelow} | mechanically relabelable (1A): ${totEligible} | honest residual: ${totResidual}`);
  console.log(`items: flip-candidates(all below-floor cleared)=${flipCandidates} | stay-quarantined(residual)=${partial} | no-below-floor=${clean}`);
  console.log(`\nNOTE: this is the PRE-reground ceiling. Real split is produced by --apply AFTER reground, which`);
  console.log(`relabels only the secondary-only residue reground could not anchor. DRY-RUN wrote nothing.`);
  process.exit(0);
}

// ---------- APPLY: per-item, reground-gated, pg-direct, diff-asserted ----------
const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).host.split(".")[0];
const pw = encodeURIComponent(process.env.SUPABASE_DB_PASSWORD);
const candidates = [
  `postgresql://postgres:${pw}@db.${ref}.supabase.co:5432/postgres`,
  ...["us-east-1","us-east-2","us-west-1","eu-central-1","eu-west-1","eu-west-2","ap-southeast-1","ap-southeast-2"].map((r) => `postgresql://postgres.${ref}:${pw}@aws-0-${r}.pooler.supabase.com:5432/postgres`),
];
let client;
for (const cs of candidates) {
  const c = new pg.Client({ connectionString: cs, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 8000 });
  try { await c.connect(); client = c; console.log(`connected via ${cs.split("@")[1].split("/")[0]}`); break; } catch { try { await c.end(); } catch {} }
}
if (!client) { console.error("no DB connection"); process.exit(1); }

const snapDir = resolve(ROOT, "scripts/_snapshots"); mkdirSync(snapDir, { recursive: true });
const stamp = process.env.PHASE2_RELABEL_STAMP || "phase2-relabel"; // caller-supplied; Date.now unavailable in some lanes
const snapFile = resolve(snapDir, `${stamp}-prior.jsonl`);
const snapRows = [];
const summary = { verified: [], relabeled: [], quarantined: [], skipped_no_reground: [], skipped_done: [] };

try {
  await client.query("SET statement_timeout = 0");
  for (const t of targets) {
    const it = t.it, key = it.legacy_id || it.id.slice(0, 8);
    if (it.provenance_status === "verified") { summary.skipped_done.push(key); console.log(`  ${key.padEnd(34)} verified(skip)`); continue; }
    if (!(await regroundCompleted(it))) { summary.skipped_no_reground.push(key); console.log(`  ${key.padEnd(34)} REFUSED — reground not completed (no phase2_priority_review flag)`); continue; }
    const p = await planItem(it);
    if (p.eligible.length === 0) { summary.quarantined.push(key); console.log(`  ${key.padEnd(34)} below=${p.belowTotal} relabel=0 residual=${p.residual}  no eligible relabel (stays quarantined)`); continue; }

    // group eligible claims by section; apply marker inserts to each section's content_md sequentially,
    // re-locating in the MUTATING string so offsets stay valid; diff-assert each insert (pure insertion).
    const bySection = new Map();
    for (const e of p.eligible) { if (!bySection.has(e.sectionId)) bySection.set(e.sectionId, []); bySection.get(e.sectionId).push(e); }

    await client.query("BEGIN");
    await client.query("ALTER TABLE public.section_claim_provenance DISABLE TRIGGER set_provenance_status_claims_trg");
    try {
      for (const [sid, elig] of bySection) {
        let md = p.sections.get(sid);
        const before = md;
        for (const e of elig) {
          const off = locateOnce(md, e.claimText || "");
          if (off < 0) throw new Error(`claim ${e.claimId} no longer uniquely locatable in mutating content_md (off=${off})`);
          if (md.slice(Math.max(0, off - MARKER.length), off) === MARKER) continue; // already marked (idempotent)
          md = insertMarker(md, off); // throws on any non-pure-insertion
        }
        // final whole-section assert: new == old with exactly N markers added, nothing else.
        const nMarkers = elig.length;
        if (md.length !== before.length + nMarkers * MARKER.length) throw new Error(`section ${sid} length delta != ${nMarkers} markers`);
        snapRows.push({ kind: "section", id: sid, prior_content_md: before });
        await client.query("UPDATE public.intelligence_item_sections SET content_md = $1 WHERE id = $2", [md, sid]);
      }
      // flip claim_kind FACT->ANALYSIS for the eligible claims (claim_text untouched).
      const ids = p.eligible.map((e) => e.claimId);
      for (const e of p.eligible) snapRows.push({ kind: "claim", id: e.claimId, prior_claim_kind: "FACT" });
      await client.query("UPDATE public.section_claim_provenance SET claim_kind = 'ANALYSIS' WHERE id = ANY($1::uuid[])", [ids]);
      await client.query("ALTER TABLE public.section_claim_provenance ENABLE TRIGGER set_provenance_status_claims_trg");

      // revalidate THIS item only (server-side).
      const vr = (await client.query("SELECT (validate_item_provenance($1)).recommended_status AS rec", [it.id])).rows[0].rec;
      await client.query("UPDATE public.intelligence_items SET provenance_status = $1 WHERE id = $2 AND provenance_status IS DISTINCT FROM $1", [vr, it.id]);
      // audit flag (also makes the reground runner idempotent-skip this item).
      await client.query(
        `INSERT INTO public.integrity_flags (category, subject_type, subject_ref, description, recommended_actions, status, created_by)
         VALUES ('data_quality','item',$1,$2,$3::jsonb,'open','phase2_analysis_relabel')`,
        [it.id,
         `Phase 2 (b)-NARROW relabel: ${p.eligible.length} secondary-only FACT claim(s) relabeled FACT->ANALYSIS with the fixed "*Industry interpretation:*" marker (claim_text byte-identical; pure content_md insertion, diff-asserted). ${p.residual} below-floor fact(s) remain honest priority_review residual. Post-relabel status=${vr}.`,
         JSON.stringify([{ action: vr === "verified" ? "none_verified" : "priority_review", relabeled_claim_ids: ids, residual_below_floor: p.residual }])]);
      await client.query("COMMIT");
      if (vr === "verified") summary.verified.push(key); else summary.quarantined.push(key);
      summary.relabeled.push({ key, n: p.eligible.length, residual: p.residual, status: vr });
      console.log(`  ${key.padEnd(34)} below=${p.belowTotal} relabel=${p.eligible.length} residual=${p.residual}  -> ${vr}`);
    } catch (e) {
      try { await client.query("ALTER TABLE public.section_claim_provenance ENABLE TRIGGER set_provenance_status_claims_trg"); } catch {}
      try { await client.query("ROLLBACK"); } catch {}
      console.log(`  ${key.padEnd(34)} ABORTED (no write): ${e.message.slice(0, 80)}`);
    }
  }
  writeFileSync(snapFile, snapRows.map((r) => JSON.stringify(r)).join("\n") + "\n");
  console.log(`\nsnapshot (reversibility): ${snapFile} (${snapRows.length} prior rows)`);
  console.log(`\n=== SPLIT ACROSS ${targets.length} ===`);
  console.log(`verified(flipped back): ${summary.verified.length}  ${summary.verified.join(", ")}`);
  console.log(`relabeled-but-still-quarantined(counsel residual): ${summary.quarantined.length}`);
  console.log(`refused(reground not run): ${summary.skipped_no_reground.length}  ${summary.skipped_no_reground.join(", ")}`);
  console.log(`already-verified(skip): ${summary.skipped_done.length}`);
  const totRelabeled = summary.relabeled.reduce((a, b) => a + b.n, 0);
  console.log(`total claims relabeled FACT->ANALYSIS: ${totRelabeled}`);
  console.log(`\nAPPLIED.`);
} catch (e) {
  try { await client.query("ALTER TABLE public.section_claim_provenance ENABLE TRIGGER set_provenance_status_claims_trg"); } catch {}
  try { await client.query("ROLLBACK"); } catch {}
  console.error("FAILED:", e.message); process.exit(1);
} finally { await client.end(); }
process.exit(0);
