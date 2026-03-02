/**
 * Generate seed.sql from the app's TypeScript/JSON seed data.
 *
 * Usage: npx tsx supabase/seed/generate-seed.ts > supabase/seed.sql
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

const ROOT = resolve(__dirname, "../../src/data");

// ── Helpers ──────────────────────────────────────────────────

function esc(s: string): string {
  if (s == null) return "NULL";
  return "'" + String(s).replace(/'/g, "''") + "'";
}

function arrLit(arr: string[]): string {
  if (!arr || arr.length === 0) return "'{}'";
  return "ARRAY[" + arr.map(esc).join(",") + "]";
}

function jsonLit(obj: unknown): string {
  return esc(JSON.stringify(obj));
}

// ── Load seed data ───────────────────────────────────────────

const resources: any[] = JSON.parse(
  readFileSync(resolve(ROOT, "seed-resources.json"), "utf-8")
);

// Archive — inline since it's small
const SEED_ARC = [
  { id: "arc1", title: "EU PPWD 94/62/EC", cat: "global", archivedDate: "2025-02-11", reason: "Superseded", note: "Replaced by PPWR 2025/40", replacement: "EU PPWR 2025/40" },
  { id: "arc2", title: "CSRD 250+ employee threshold", cat: "compliance", archivedDate: "2026-02-24", reason: "Superseded", note: "Omnibus raised to 1,000", replacement: "CSRD (Omnibus)" },
  { id: "arc3", title: "EPA 2009 Endangerment Finding", cat: "global", archivedDate: "2025-12-01", reason: "Repealed", note: "Federal GHG basis rescinded", replacement: "EPA SmartWay" },
  { id: "arc4", title: "IMO 2018 GHG Strategy", cat: "ocean", archivedDate: "2023-07-07", reason: "Superseded", note: "Replaced by 2023 Revised Strategy", replacement: "IMO GHG Strategy 2023" },
];

// Changelog
const CHANGE_LOG: Record<string, { field: string; prev: string; now: string; impact: string }[]> = {
  t1: [
    { field: "Timeline", prev: "CBAM transitional phase until Dec 2025", now: "Definitive phase active Jan 2026. Authorised declarant registration deadline extended to March 2026", impact: "HIGH — registration is now the immediate compliance action" },
    { field: "Scope", prev: "Scope limited to cement, iron, steel, aluminium, fertilisers, electricity, hydrogen", now: "Unchanged scope but EU Commission reviewing potential expansion to organic chemicals and polymers by 2028", impact: "MODERATE — expansion may affect packaging materials" },
    { field: "Dispute status", prev: "WTO challenge speculative", now: "Multiple WTO members (India, China, Brazil) have formally signaled objections. Implementation proceeding but legal challenge is active", impact: "HIGH — dispute may alter scope or enforcement timeline" },
  ],
  o1: [
    { field: "Priority", prev: "HIGH", now: "CRITICAL", impact: "Urgency increased — enforcement timelines are within planning horizon" },
    { field: "Key data", prev: "No specific packaging regulation link", now: "Added PPWR interaction — packaging compliance required for goods shipped on ocean routes to EU", impact: "MODERATE — packaging + ocean compliance now linked" },
    { field: "Timeline", prev: "ETS Phase 4 only", now: "Added IMO NZF interaction milestones for dual ocean compliance tracking", impact: "HIGH — two parallel compliance tracks now active for ocean freight" },
  ],
  o4: [
    { field: "Status", prev: "Draft proposal stage", now: "Regulation published in Official Journal, directly applicable in all EU member states", impact: "CRITICAL — no longer draft; immediate legal obligation" },
    { field: "Key data", prev: "Targets under negotiation", now: "All packaging recyclable by 2030, PFAS restrictions confirmed, single-use bans from 2030, recycled content minimums set", impact: "HIGH — concrete targets now enforceable" },
    { field: "Timeline", prev: "Estimated 2026 implementation", now: "Phased implementation confirmed: labelling 2026, reuse targets 2030, recycled content 2030", impact: "HIGH — phase dates now firm for planning" },
  ],
};

// Disputes
const SEED_DISPUTES: Record<string, { active: boolean; note: string; sources: string[] }> = {
  l6: { active: true, note: "Regulatory survival uncertain. EPA Phase 3 under active political review — may be weakened, delayed, or rescinded. CARB standards (l7) remain independent but federal waiver also challenged. Sources conflict on timeline.", sources: ["EPA", "Industry groups", "Environmental Defense Fund"] },
  l7: { active: true, note: "Federal waiver for Section 177 states under legal challenge. 12+ states follow CARB rules, but if waiver is revoked, state-level mandates face uncertainty. Court ruling pending.", sources: ["CARB", "EPA", "State AG coalition"] },
  c1: { active: true, note: "CSRD Omnibus significantly changed scope in Feb 2026. Some sources still cite pre-Omnibus 250-employee threshold. Verify any CSRD reference uses post-Omnibus 1,000-employee threshold and delayed Wave 2 timeline.", sources: ["EU Commission", "Big 4 advisors"] },
  t1: { active: true, note: "WTO compatibility of CBAM is actively disputed. Multiple WTO members have filed or signaled objections. Implementation proceeding but legal challenge could alter scope.", sources: ["EU Commission", "WTO", "India/China trade ministries"] },
  g2: { active: true, note: "PPWR implementation guidance still being developed. Specific recyclability criteria and PFAS thresholds under delegated act development. Details may shift before Aug 2026 application date.", sources: ["EU Commission", "EUROPEN", "Plastics Europe"] },
  o13: { active: true, note: "US formally opposes IMO Net-Zero Framework as a 'global carbon tax'. US delegation walked out of MEPC 83 before vote. US State/Energy/Transport Secretaries issued joint ultimatum against countries voting yes at Oct 2025 adoption. Framework approved 63-16-24 but US enforcement non-participation creates compliance fragmentation on US-origin trade lanes.", sources: ["IMO", "US State Department", "Jones Walker LLP", "Maritime Carbon Intelligence"] },
  g33: { active: true, note: "EUDR delayed twice (Dec 2024 → Dec 2025 → Dec 2026). Simplification review due Apr 2026 may further change requirements. IT platform readiness uncertain. Some stakeholders argue simplifications amount to deregulation. Core obligations remain but implementation details still shifting.", sources: ["EU Commission", "Mayer Brown", "Bird & Bird", "WRI"] },
};

// Cross-references
const XREF_PAIRS: [string, string][] = [
  ["o2","o1"],["o3","o1"],["o4","o1"],["o7","o1"],["o3","o6"],
  ["o2","g1"],["o3","g1"],["a2","g1"],["a3","g1"],["l1","g1"],
  ["l3","g1"],["t1","g1"],["g2","g1"],["a1","a6"],["a4","a3"],
  ["c5","c4"],["a7","c4"],["c7","c6"],["c9","c6"],["c1","c6"],
  ["c1","c2"],["c1","c3"],["c1","c8"],["c8","c3"],["c10","c9"],
  ["t1","o3"],["t1","t5"],["t5","t6"],["l7","l6"],["o1","g28"],
  ["g1","g28"],["r30","o7"],["r31","l7"],["g20","g17"],["g2","g1"],
  ["c7","c4"],["g29","t3"],["g31","t3"],["o13","o1"],["o13","o2"],
  ["o13","o3"],["g34","c4"],["g34","c5"],["g33","g1"],["g32","t1"],
  ["r34","t1"],["l1","r35"],["o1","r35"],["r36","o13"],["r36","o3"],
];

// Supersessions
const SUPERSESSIONS = [
  { id: "ss1", oldTitle: "EU PPWD 94/62/EC", oldUrl: "", newTitle: "EU PPWR 2025/40", newId: "g2", severity: "CRITICAL", date: "2025-02", what: "Directive replaced by directly applicable Regulation. No national transposition needed. All packaging recyclable by 2030, PFAS restrictions, single-use limits. Dramatically expands scope for transport and event packaging.", timeline: [{ date: "1994-12", label: "PPWD adopted" }, { date: "2025-02", label: "PPWR in force" }, { date: "2026-08", label: "PPWR applies" }, { date: "2030-01", label: "All recyclable" }] },
  { id: "ss2", oldTitle: "CSRD 250+ employees threshold", oldUrl: "", newTitle: "EU Omnibus CSRD 1,000+ employees", newId: "c1", severity: "CRITICAL", date: "2026-02", what: "Omnibus raised company size threshold from 250 to 1,000 employees. Companies in scope dropped from ~50,000 to ~5,000. Wave 2 delayed by 2 years. Remaining companies face stricter data granularity requirements including supply chain logistics emissions.", timeline: [{ date: "2024-01", label: "Wave 1 PIEs" }, { date: "2026-02", label: "Omnibus adopted" }, { date: "2028-01", label: "Wave 2 delayed" }] },
  { id: "ss3", oldTitle: "EPA 2009 Endangerment Finding", oldUrl: "", newTitle: "EPA GHG Rescission (2025)", newId: "g8", severity: "HIGH", date: "2025-12", what: "Federal legal basis for ALL vehicle GHG regulation removed. Creates patchwork: California + 12 Section 177 states maintain independent standards. Federal rules collapse. Court challenges pending. Freight forwarders face divergent state-by-state compliance.", timeline: [{ date: "2009-12", label: "Finding issued" }, { date: "2025-06", label: "Rescission proposed" }, { date: "2025-12", label: "Final rule" }, { date: "2026-06", label: "Court challenges" }] },
  { id: "ss4", oldTitle: "IMO 2018 GHG Strategy (50% by 2050)", oldUrl: "", newTitle: "IMO 2023 Revised Strategy (Net-zero ~2050)", newId: "o1", severity: "CRITICAL", date: "2023-07", what: "Ambition doubled from 50% reduction to net-zero by ~2050. New interim checkpoints: 20% by 2030, 70% by 2040. GHG fuel intensity code and pricing mechanism under negotiation. Fundamentally reshapes carrier fleet investment timelines.", timeline: [{ date: "2018-04", label: "Initial strategy" }, { date: "2023-07", label: "Revised adopted" }, { date: "2025-04", label: "MEPC 83" }, { date: "2030-01", label: "20% checkpoint" }, { date: "2040-01", label: "70% checkpoint" }] },
  { id: "ss5", oldTitle: "Voluntary IMO GHG measures only", oldUrl: "", newTitle: "IMO Net-Zero Framework (binding fuel standard + pricing)", newId: "o13", severity: "CRITICAL", date: "2025-04", what: "First binding market-based measure for shipping: mandatory fuel GHG intensity standard + global carbon pricing mechanism. Approved MEPC 83 by 63-16-24 vote. US walked out and formally opposes. Adoption at MEPC ES.2 Oct 2025, entry into force Mar 2027, enforcement 2028. Creates new carrier cost layer on every ocean shipment.", timeline: [{ date: "2025-04", label: "MEPC 83 approved" }, { date: "2025-10", label: "Adoption vote" }, { date: "2027-03", label: "Entry into force" }, { date: "2028-01", label: "Enforcement" }] },
];

const AUDIT_DATE = "2026-03-01";

// ── Generate SQL ─────────────────────────────────────────────

const lines: string[] = [];
lines.push("-- FSI Seed Data");
lines.push("-- Generated from TypeScript/JSON seed files");
lines.push("-- " + new Date().toISOString());
lines.push("");
lines.push("BEGIN;");
lines.push("");

// ── Resources (119 active) ──────────────────────────────────
lines.push("-- ═══ Resources (119 active) ═══");
for (const r of resources) {
  lines.push(`INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (`);
  lines.push(`  ${esc(r.id)}, ${esc(r.cat)}, ${esc(r.sub)}, ${esc(r.title)}, ${esc(r.url)},`);
  lines.push(`  ${esc(r.note)}, ${esc(r.type)}, ${esc(r.priority)}, ${esc(r.reasoning)},`);
  lines.push(`  ${arrLit(r.tags)}, ${esc(r.whatIsIt)}, ${esc(r.whyMatters)},`);
  lines.push(`  ${arrLit(r.keyData)}, ${arrLit(r.modes || [r.cat])},`);
  lines.push(`  ${esc(r.topic || null)}, ${esc(r.jurisdiction || null)},`);
  lines.push(`  ${esc(r.added)}, FALSE`);
  lines.push(`);`);
  lines.push("");
}

// ── Archived Resources (4) ──────────────────────────────────
lines.push("-- ═══ Archived Resources (4) ═══");
for (const a of SEED_ARC) {
  lines.push(`INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived, archived_date, archive_reason, archive_note, archive_replacement) VALUES (`);
  lines.push(`  ${esc(a.id)}, ${esc(a.cat)}, '', ${esc(a.title)}, '', ${esc(a.note)},`);
  lines.push(`  '', 'LOW', '', '{}', '', '', '{}', '{}',`);
  lines.push(`  NULL, NULL, ${esc(a.archivedDate)}, TRUE, ${esc(a.archivedDate)},`);
  lines.push(`  ${esc(a.reason)}, ${esc(a.note)}, ${esc(a.replacement)}`);
  lines.push(`);`);
  lines.push("");
}

// ── Timelines ────────────────────────────────────────────────
lines.push("-- ═══ Timelines ═══");
let timelineCount = 0;
for (const r of resources) {
  if (r.timeline && r.timeline.length > 0) {
    for (let i = 0; i < r.timeline.length; i++) {
      const t = r.timeline[i];
      lines.push(`INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES (${esc(r.id)}, ${esc(t.date)}, ${esc(t.label)}, ${esc(t.status || null)}, ${i});`);
      timelineCount++;
    }
  }
}
lines.push(`-- ${timelineCount} timeline entries`);
lines.push("");

// ── Changelog ────────────────────────────────────────────────
lines.push("-- ═══ Changelog ═══");
for (const [id, entries] of Object.entries(CHANGE_LOG)) {
  for (const e of entries) {
    lines.push(`INSERT INTO changelog (resource_id, date, type, fields, prev_value, now_value, impact) VALUES (${esc(id)}, ${esc(AUDIT_DATE)}, 'UPDATED', ARRAY[${esc(e.field)}], ${esc(e.prev)}, ${esc(e.now)}, ${esc(e.impact)});`);
  }
}
lines.push("");

// ── Disputes ─────────────────────────────────────────────────
lines.push("-- ═══ Disputes ═══");
for (const [id, d] of Object.entries(SEED_DISPUTES)) {
  const sourcesJson = JSON.stringify(d.sources.map((s) => ({ name: s, url: "" })));
  lines.push(`INSERT INTO disputes (resource_id, active, note, sources) VALUES (${esc(id)}, ${d.active}, ${esc(d.note)}, ${esc(sourcesJson)}::jsonb);`);
}
lines.push("");

// ── Cross References ─────────────────────────────────────────
lines.push("-- ═══ Cross References (50 pairs) ═══");
for (const [src, tgt] of XREF_PAIRS) {
  lines.push(`INSERT INTO cross_references (source_id, target_id) VALUES (${esc(src)}, ${esc(tgt)}) ON CONFLICT DO NOTHING;`);
}
lines.push("");

// ── Supersessions ────────────────────────────────────────────
lines.push("-- ═══ Supersessions (5) ═══");
for (const s of SUPERSESSIONS) {
  lines.push(`INSERT INTO supersessions (old_id, old_title, old_url, new_id, new_title, severity, date, note, timeline) VALUES (`);
  lines.push(`  ${esc(s.id)}, ${esc(s.oldTitle)}, ${esc(s.oldUrl)}, ${esc(s.newId)}, ${esc(s.newTitle)},`);
  lines.push(`  ${esc(s.severity.toLowerCase())}, ${esc(s.date)}, ${esc(s.what)}, ${esc(JSON.stringify(s.timeline))}::jsonb`);
  lines.push(`);`);
  lines.push("");
}

lines.push("COMMIT;");

// Write output
const sql = lines.join("\n");
const outPath = resolve(__dirname, "../seed.sql");
writeFileSync(outPath, sql, "utf-8");
console.log(`Wrote ${sql.length} bytes to ${outPath}`);
console.log(`  Resources: ${resources.length} active + ${SEED_ARC.length} archived`);
console.log(`  Timelines: ${timelineCount}`);
console.log(`  Changelog: ${Object.values(CHANGE_LOG).flat().length}`);
console.log(`  Disputes: ${Object.keys(SEED_DISPUTES).length}`);
console.log(`  Cross-refs: ${XREF_PAIRS.length}`);
console.log(`  Supersessions: ${SUPERSESSIONS.length}`);
