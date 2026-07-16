#!/usr/bin/env node
// non-destructive-grounding.golden.mjs — behavioral golden for the NON-DESTRUCTIVE grounding foundation
// (operator doctrine 2026-07-16). Locks the contract: a new grounding is a COMPARISON against the prior claim
// ledger, never a replacement. Genuinely-new claims are ADDED, changed claims are VERSIONED (old preserved &
// retrievable), unchanged + not-reproduced claims are LEFT untouched, and a claim is ERASED only on PROVEN
// inaccuracy (with its proof). The new-vs-old diff always survives a ground; no data is lost. An interrupted
// ground leaves the prior ledger fully intact (subsumes H2 atomicity). Invariants RD-44 / RD-45.
// No live DB — an in-memory fake Supabase client models section_claim_provenance + claim_versions so the apply
// is asserted end-to-end. Also structurally asserts the ground path no longer blanket-deletes the ledger.
// Run: node scripts/verify/non-destructive-grounding.golden.mjs — exits 0 PASS, 1 FAIL.
import { createJiti } from "jiti";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const jiti = createJiti(import.meta.url, { interopDefault: true });
const { diffLedger, applyLedgerDiff, eraseClaimWithProof, normText } =
  await jiti.import("../../src/lib/agent/ledger-apply.mjs");

let failed = 0;
const check = (name, cond) => { console.log(`${cond ? "PASS" : "FAIL"}  ${name}`); if (!cond) failed++; };

// ---- in-memory fake Supabase (models the two tables + the chain applyLedgerDiff/eraseClaimWithProof use) ----
function makeFakeSb(initialClaims, opts = {}) {
  const tables = {
    section_claim_provenance: initialClaims.map((r) => ({ ...r })),
    claim_versions: [],
  };
  let counter = 0;
  const failInsertWhen = opts.failInsertWhen || null; // fn(table,payload) -> truthy => throw
  const failVersionInsert = opts.failVersionInsert || false;
  class Query {
    constructor(table) { this.table = table; this.op = "select"; this.payload = null; this.filters = []; this._single = false; this._selectId = false; this._order = null; this._limit = null; }
    insert(payload) { this.op = "insert"; this.payload = payload; return this; }
    update(payload) { this.op = "update"; this.payload = payload; return this; }
    delete() { this.op = "delete"; return this; }
    select(cols) { if (this.op === "select") this.op = "select"; this._selectId = String(cols).includes("id"); this._selectCols = cols; return this; }
    eq(col, val) { this.filters.push([col, val]); return this; }
    in(col, vals) { this.filters.push([col, vals, "in"]); return this; }
    order(col, o) { this._order = [col, o]; return this; }
    limit(n) { this._limit = n; return this; }
    single() { this._single = true; return this; }
    _match(row) { return this.filters.every(([c, v, kind]) => kind === "in" ? v.includes(row[c]) : row[c] === v); }
    _run() {
      const t = tables[this.table];
      if (this.op === "insert") {
        if (failInsertWhen && failInsertWhen(this.table, this.payload)) throw new Error("simulated mid-apply insert failure");
        if (this.table === "claim_versions" && failVersionInsert) return { data: null, error: { message: "simulated version-archive failure" } };
        // enforce the migration's proof-required + supersede vocab constraints so the golden proves them
        if (this.table === "claim_versions") {
          if (!["changed", "proven_inaccurate"].includes(this.payload.supersede_reason)) return { data: null, error: { message: "supersede_reason check violation" } };
          if (this.payload.supersede_reason === "proven_inaccurate" && this.payload.inaccuracy_proof == null) return { data: null, error: { message: "proof_required check violation" } };
        }
        const row = { ...this.payload };
        if (this.table === "section_claim_provenance" && !row.id) row.id = `scp-new-${++counter}`;
        t.push(row);
        return { data: this._selectId && this._single ? { id: row.id } : null, error: null };
      }
      if (this.op === "update") { for (const row of t) if (this._match(row)) Object.assign(row, this.payload); return { data: null, error: null }; }
      if (this.op === "delete") { const keep = t.filter((r) => !this._match(r)); tables[this.table] = keep; return { data: null, error: null }; }
      // select
      let rows = t.filter((r) => this._match(r));
      if (this._order) { const [col, o] = this._order; rows = rows.slice().sort((a, b) => (o?.ascending === false ? b[col] - a[col] : a[col] - b[col])); }
      if (this._limit != null) rows = rows.slice(0, this._limit);
      return { data: this._single ? (rows[0] ?? null) : rows, error: null };
    }
    then(res, rej) { try { res(this._run()); } catch (e) { if (rej) rej(e); else throw e; } }
  }
  return { from: (table) => new Query(table), _tables: tables };
}

const claim = (id, text, kind, tier, extra = {}) => ({ id, intelligence_item_id: "item-1", section_row_id: "sec-1", claim_text: text, claim_kind: kind, source_span: `span:${text}`, source_id: `src-${tier}`, search_result_id: `sr-${id}`, source_tier_at_grounding: tier, mint_hold_reason: null, ...extra });
// incoming rows carry no id (not yet in the ledger)
const inc = (text, kind, tier, extra = {}) => ({ intelligence_item_id: "item-1", section_row_id: "sec-1", claim_text: text, claim_kind: kind, source_span: `span:${text}`, source_id: `src-${tier}`, search_result_id: `sr-inc`, source_tier_at_grounding: tier, ...extra });

// ============================ PURE DIFF ============================
{
  const existing = [claim("A", "alpha fact", "FACT", 2), claim("B", "beta fact", "FACT", 2)];
  const incoming = [inc("alpha fact", "FACT", 2), inc("gamma fact", "FACT", 2)];
  const d = diffLedger(existing, incoming);
  check("diff: new claim -> add", d.add.length === 1 && d.add[0].claim_text === "gamma fact");
  check("diff: identical claim -> unchanged", d.unchanged.length === 1 && d.unchanged[0].existing.id === "A");
  check("diff: prior claim absent from new -> notReproduced (KEPT, not removed)", d.notReproduced.length === 1 && d.notReproduced[0].id === "B");
  check("diff: NEVER produces a delete set (no such key)", !("delete" in d) && !("remove" in d));
}
{
  // same claim_text, changed attribution (re-homed T3 -> T2) -> change
  const existing = [claim("A", "alpha fact", "FACT", 3)];
  const incoming = [inc("alpha fact", "FACT", 2)];
  const d = diffLedger(existing, incoming);
  check("diff: same text, changed source/tier -> change", d.change.length === 1 && d.change[0].existing.id === "A" && d.change[0].incoming.source_tier_at_grounding === 2);
  check("diff: normText collapses whitespace/case for identity", normText("  Alpha   FACT ") === "alpha fact");
}

// ============================ CASE 1: add-without-destroy ============================
{
  const existing = [claim("A", "alpha", "FACT", 2), claim("B", "beta", "FACT", 2)];
  const sb = makeFakeSb(existing);
  const res = await applyLedgerDiff(sb, "item-1", diffLedger(existing, [inc("alpha", "FACT", 2), inc("beta", "FACT", 2), inc("gamma", "FACT", 2)]), { nowIso: "2026-07-16T00:00:00Z" });
  const cur = sb._tables.section_claim_provenance;
  check("case1: adds the new claim (A,B,C present)", cur.length === 3 && cur.some((r) => r.claim_text === "gamma"));
  check("case1: A and B PRESERVED unchanged (zero loss)", cur.some((r) => r.id === "A") && cur.some((r) => r.id === "B"));
  check("case1: only 1 added, 2 unchanged, 0 versioned", res.applied.added === 1 && res.applied.unchanged === 2 && res.applied.versioned === 0);
  check("case1: no claim_versions written (nothing changed/erased)", sb._tables.claim_versions.length === 0);
}

// ============================ CASE 2: version-changed, old retrievable ============================
{
  const existing = [claim("A", "alpha", "FACT", 3)]; // grounded sub-floor T3
  const sb = makeFakeSb(existing);
  await applyLedgerDiff(sb, "item-1", diffLedger(existing, [inc("alpha", "FACT", 2)]), { nowIso: "2026-07-16T00:00:00Z" });
  const cur = sb._tables.section_claim_provenance.find((r) => r.id === "A");
  const ver = sb._tables.claim_versions;
  check("case2: current claim updated to new tier (T2)", cur && cur.source_tier_at_grounding === 2);
  check("case2: OLD version preserved & retrievable (T3, reason=changed)", ver.length === 1 && ver[0].source_tier_at_grounding === 3 && ver[0].supersede_reason === "changed" && ver[0].current_claim_id === "A");
  check("case2: current claim was NOT deleted (same id survives)", !!cur);
}

// ============================ CASE 3: reproduce-nothing -> untouched, no-gain ============================
{
  const existing = [claim("A", "alpha", "FACT", 2), claim("B", "beta", "FACT", 2)];
  const sb = makeFakeSb(existing);
  const res = await applyLedgerDiff(sb, "item-1", diffLedger(existing, []), { nowIso: "2026-07-16T00:00:00Z" });
  check("case3: empty re-ground leaves the ledger fully intact (A,B kept)", sb._tables.section_claim_provenance.length === 2);
  check("case3: nothing added/changed/versioned (no-gain, prior preserved)", res.applied.added === 0 && res.applied.changed === 0 && res.applied.versioned === 0 && res.applied.notReproduced === 2);
  check("case3: no claim_versions written", sb._tables.claim_versions.length === 0);
}

// ============================ CASE 4: interrupted ground leaves prior ledger complete ============================
{
  const existing = [claim("A", "alpha", "FACT", 2), claim("B", "beta", "FACT", 2)];
  // fail on the SECOND add insert (mid-apply). Nothing existing is ever deleted, so prior data cannot be lost.
  let seen = 0;
  const sb = makeFakeSb(existing, { failInsertWhen: (t) => t === "section_claim_provenance" && ++seen === 2 });
  let threw = false;
  try { await applyLedgerDiff(sb, "item-1", diffLedger(existing, [inc("alpha", "FACT", 2), inc("beta", "FACT", 2), inc("gamma", "FACT", 2), inc("delta", "FACT", 2)]), { nowIso: "2026-07-16T00:00:00Z" }); }
  catch { threw = true; }
  check("case4: apply raised on the simulated mid-run failure", threw);
  check("case4: prior ledger A,B STILL COMPLETE after interruption (zero loss)", sb._tables.section_claim_provenance.some((r) => r.id === "A") && sb._tables.section_claim_provenance.some((r) => r.id === "B"));
  // Structural: the ground path in canonical-pipeline no longer blanket-deletes the ledger before re-inserting.
  const pipe = readFileSync(resolve(ROOT, "src/lib/agent/canonical-pipeline.ts"), "utf8");
  const groundStart = pipe.indexOf("DOMINANCE GUARD SNAPSHOT");
  const groundEnd = pipe.indexOf("STEP register", groundStart > 0 ? groundStart : 0);
  const groundBody = pipe.slice(groundStart, groundEnd);
  check("case4(structural): ground path has NO blanket ledger delete (delete().eq intelligence_item_id)", !/section_claim_provenance"\)\s*\.delete\(\)\s*\.eq\("intelligence_item_id"/.test(groundBody));
  check("case4(structural): ground path applies via applyLedgerDiff", /applyLedgerDiff\(/.test(groundBody));
}

// ============================ CASE 5: proven-inaccurate erasure carries its proof ============================
{
  const existing = [claim("A", "alpha", "FACT", 2), claim("B", "beta", "FACT", 2)];
  const sb = makeFakeSb(existing);
  const proof = { reason: "span contradicts primary", contradicting_span: "the enacted text says 30%, not 45%", checked_at: "2026-07-16" };
  const out = await eraseClaimWithProof(sb, existing[0], "item-1", proof, { nowIso: "2026-07-16T00:00:00Z" });
  check("case5: erased claim removed from current ledger", !sb._tables.section_claim_provenance.some((r) => r.id === "A"));
  check("case5: erased claim ARCHIVED with proof (retrievable)", sb._tables.claim_versions.some((v) => v.supersede_reason === "proven_inaccurate" && v.inaccuracy_proof && v.inaccuracy_proof.reason));
  check("case5: the OTHER claim (B) untouched", sb._tables.section_claim_provenance.some((r) => r.id === "B"));
  check("case5: returns proven_inaccurate verdict", out.supersedeReason === "proven_inaccurate");
  // refuses to erase without a proof (erase-only-on-proven-inaccuracy)
  let refused = false;
  try { await eraseClaimWithProof(sb, existing[1], "item-1", null, {}); } catch { refused = true; }
  check("case5: REFUSES erasure with no proof", refused && sb._tables.section_claim_provenance.some((r) => r.id === "B"));
  // fail-closed: if the proof archive fails, the current row is NOT deleted (data never lost)
  const sb2 = makeFakeSb([claim("C", "gamma", "FACT", 2)], { failVersionInsert: true });
  let failClosed = false;
  try { await eraseClaimWithProof(sb2, sb2._tables.section_claim_provenance[0], "item-1", proof, {}); } catch { failClosed = true; }
  check("case5: FAIL-CLOSED — archive failure aborts the erase, claim retained", failClosed && sb2._tables.section_claim_provenance.some((r) => r.id === "C"));
}

// ============================ CASE 6: non-regression — real-shaped ledger, zero claim loss ============================
{
  const existing = Array.from({ length: 10 }, (_, i) => claim(`C${i}`, `claim ${i}`, i % 3 === 0 ? "ANALYSIS" : "FACT", 2));
  // incoming reproduces 6 identically, re-homes 2 (change), adds 1 new; 2 existing not reproduced (kept)
  const incoming = [
    inc("claim 0", "ANALYSIS", 2), inc("claim 1", "FACT", 2), inc("claim 2", "FACT", 2),
    inc("claim 3", "ANALYSIS", 2), inc("claim 4", "FACT", 2), inc("claim 5", "FACT", 2),
    inc("claim 6", "ANALYSIS", 1), inc("claim 7", "FACT", 1), // 6,7 re-homed to a higher tier -> change
    inc("brand new claim", "FACT", 2), // add
    // claim 8, claim 9 NOT reproduced -> KEPT
  ];
  const sb = makeFakeSb(existing);
  const res = await applyLedgerDiff(sb, "item-1", diffLedger(existing, incoming), { nowIso: "2026-07-16T00:00:00Z" });
  const cur = sb._tables.section_claim_provenance;
  const everyOriginalPresent = existing.every((e) => cur.some((r) => r.id === e.id));
  check("case6: ZERO CLAIM LOSS — every original claim id still present", everyOriginalPresent);
  check("case6: current ledger = 10 original + 1 new = 11", cur.length === 11);
  check("case6: 2 changed claims versioned (old states retrievable)", res.applied.changed === 2 && sb._tables.claim_versions.length === 2);
  check("case6: not-reproduced claims 8,9 KEPT", cur.some((r) => r.id === "C8") && cur.some((r) => r.id === "C9"));
  check("case6: currentIds covers the full ledger (11)", res.currentIds.length === 11);
  check("case6: touchedFacts = only the added+changed FACTs (not unchanged)", res.touchedFacts.every((f) => f.claim_kind === "FACT"));
}

console.log(failed ? `\nGOLDEN FAILED (${failed})` : "\nGOLDEN PASSED");
process.exit(failed ? 1 : 0);
