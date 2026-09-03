#!/usr/bin/env node
// seed-benchmark-instruments.mjs — the house-seeded recurring benchmark (spec 05 §3, required component
// 4; docs/plans/wave3-lanes-2026-09-03.md, COMMUNITY-A).
//
// WHY THIS EXISTS. "The dominant failure is the empty room, and it kills a professional community in
// about eight weeks... Gartner does not wait for organic critical mass: it runs its own Benchmark
// Surveys." (spec 05 §3). This script is that mechanism: a small, fixed CALENDAR of house-authored
// benchmark questions (CALENDAR_TEMPLATES below), each scoped to a sector_profile (or global) and a
// fixed cadence (monthly/quarterly/annual), instantiated as a `community_benchmark_instruments` row
// (migration 294) for the CURRENT period the first time this script runs after that period begins.
// Re-running it for a period already seeded is a no-op (idempotent — see planSeeding()).
//
// WHAT IT DOES NOT DO. It never writes `community_posts` and never impersonates a member — "seeds
// aggregate instruments only, never posts pretending to be members" (this lane's own governing brief).
// The instrument DEFINITION (the question, the window, the field it asks about) is all this script
// creates; individual responses arrive later through a member-facing submission path this lane's
// interface contract does not name, and the published AGGREGATE is served by
// GET /api/community/benchmarks/current (src/lib/community/benchmark.mjs), never by this script.
//
// DRY BY DEFAULT, DEPS-INJECTED (COMMON lane contract): `main({apply, now}, deps)` takes every DB access
// through `deps` (`listExistingKeys`, `guardedInsertMany`) so `main.test.mjs`-style unit tests run with
// no database. `planSeeding()` is a PURE function (no I/O) — the actual scheduling/idempotency decision
// is unit-tested directly on constructed fixtures, independent of the CLI wiring below.
//
// USAGE:
//   node scripts/community/seed-benchmark-instruments.mjs            # dry: what would be created
//   node scripts/community/seed-benchmark-instruments.mjs --apply    # create this period's instruments

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch { /* CI: env injected */ }

export const CITE = Object.freeze({
  skill: "community-house-seeded-benchmark",
  reason:
    "Spec 05 §3: seed the current period's house-authored recurring benchmark instrument(s) so Community " +
    "is never an empty room. Aggregate-instrument DEFINITIONS only — never a community_posts row, never a " +
    "post attributed to a member.",
});

/** The fixed calendar (spec 05 §3's own domain examples, adapted to the closed antitrust field vocabulary
 * — src/lib/community/antitrust.mjs SENSITIVE_FIELDS / migration 294's field_key CHECK). Each entry names
 * a STABLE templateKey (never renamed — it is half of every instrument's key, forever) and a cadence. */
export const CALENDAR_TEMPLATES = Object.freeze([
  {
    templateKey: "saf-premium-air",
    title: "SAF premium on air lanes",
    question: "What sustainable-aviation-fuel premium are you seeing on your air freight lanes this quarter?",
    fieldKey: "saf_premium_pct",
    unit: "%",
    sectorProfile: null, // global — every sector books air freight
    region: "GLOBAL",
    cycle: "quarterly",
  },
  {
    templateKey: "cold-chain-rate-per-feu",
    title: "Cold chain ocean rate per FEU",
    question: "What is your average contracted rate per FEU for temperature-controlled ocean freight this quarter?",
    fieldKey: "rate_per_feu",
    unit: "USD",
    sectorProfile: "cold-chain",
    region: "GLOBAL",
    cycle: "quarterly",
  },
  {
    templateKey: "eu-capacity-outlook",
    title: "EU-bound ocean capacity outlook",
    question: "What TEU capacity have you secured on EU-bound ocean lanes for this quarter?",
    fieldKey: "capacity_teu",
    unit: "TEU",
    sectorProfile: null,
    region: "EU",
    cycle: "quarterly",
  },
]);

/** Full elapsed calendar months — mirrors src/lib/community/antitrust.mjs's own local copy; kept
 * independent per that module's own stated reasoning (single-purpose, two lines, not worth a shared
 * dependency). Used here only for annual/monthly period math below. */
function monthsBetween(from, to) {
  let months = (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth());
  if (to.getUTCDate() < from.getUTCDate()) months -= 1;
  return months;
}

/**
 * The current fixed calendar period for a cadence, as of `now` (UTC). PURE.
 *
 * @param {"monthly"|"quarterly"|"annual"} cycle
 * @param {Date} now
 * @returns {{ periodStart: Date, periodEnd: Date, label: string }}
 */
export function currentPeriod(cycle, now) {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth(); // 0-indexed
  if (cycle === "monthly") {
    const periodStart = new Date(Date.UTC(y, m, 1));
    const periodEnd = new Date(Date.UTC(y, m + 1, 1));
    const label = `${y}-${String(m + 1).padStart(2, "0")}`;
    return { periodStart, periodEnd, label };
  }
  if (cycle === "quarterly") {
    const q = Math.floor(m / 3); // 0-3
    const periodStart = new Date(Date.UTC(y, q * 3, 1));
    const periodEnd = new Date(Date.UTC(y, q * 3 + 3, 1));
    const label = `${y}-q${q + 1}`;
    return { periodStart, periodEnd, label };
  }
  if (cycle === "annual") {
    const periodStart = new Date(Date.UTC(y, 0, 1));
    const periodEnd = new Date(Date.UTC(y + 1, 0, 1));
    const label = `${y}`;
    return { periodStart, periodEnd, label };
  }
  throw new Error(`currentPeriod: unrecognised cycle "${cycle}"`);
}

/** The stable instrument key for a template in a given period, e.g. "saf-premium-air-2026-q3". Never
 * recomputed differently for the same (template, period) pair — this IS the idempotency key. */
export function instrumentKeyFor(template, period) {
  return `${template.templateKey}-${period.label}`;
}

/** Builds the full community_benchmark_instruments row for a template's current period. PURE. */
export function buildInstrumentRow(template, period) {
  return {
    key: instrumentKeyFor(template, period),
    title: `${template.title} — ${period.label}`,
    question: template.question,
    field_key: template.fieldKey,
    unit: template.unit,
    sector_profile: template.sectorProfile,
    region: template.region,
    calendar_cycle: template.cycle,
    opens_at: period.periodStart.toISOString(),
    closes_at: period.periodEnd.toISOString(),
    period_end: period.periodEnd.toISOString().slice(0, 10),
    created_by: "house",
    status: "open",
  };
}

/**
 * The idempotent seeding decision (PURE, no I/O): for each template, compute its current period's
 * instrument row and skip it if that key already exists.
 *
 * @param {Array<object>} templates
 * @param {Set<string>|string[]} existingKeys
 * @param {Date} now
 * @returns {{ toCreate: Array<object>, skipped: string[] }}
 */
export function planSeeding(templates, existingKeys, now) {
  const existing = existingKeys instanceof Set ? existingKeys : new Set(existingKeys ?? []);
  const toCreate = [];
  const skipped = [];
  for (const template of templates) {
    const period = currentPeriod(template.cycle, now);
    const row = buildInstrumentRow(template, period);
    if (existing.has(row.key)) {
      skipped.push(row.key);
    } else {
      toCreate.push(row);
    }
  }
  return { toCreate, skipped };
}

/**
 * @param {{ apply?: boolean, now?: Date }} opts
 * @param {{ listExistingKeys: () => Promise<string[]>, guardedInsertMany?: Function }} deps
 */
export async function main({ apply = false, now = new Date() } = {}, deps) {
  const { listExistingKeys, guardedInsertMany } = deps;
  console.log(`[seed-benchmark-instruments] mode = ${apply ? "APPLY" : "DRY-RUN"}, now = ${now.toISOString()}`);

  const existingKeys = await listExistingKeys();
  const { toCreate, skipped } = planSeeding(CALENDAR_TEMPLATES, existingKeys, now);

  for (const key of skipped) console.log(`   already seeded: ${key}`);
  for (const row of toCreate) console.log(`   ${apply ? "CREATE" : "WOULD CREATE"}: ${row.key} (${row.sector_profile ?? "global"}/${row.region}, ${row.field_key})`);

  const summary = { mode: apply ? "apply" : "dry-run", existing: existingKeys.length, would_create: toCreate.length, skipped: skipped.length, created: 0 };
  if (!apply || toCreate.length === 0) return summary;

  const res = await guardedInsertMany("community_benchmark_instruments", toCreate, { cite: CITE, select: "id, key" });
  console.log(`[seed-benchmark-instruments] created ${res.inserted} instrument(s)`);
  return { ...summary, created: res.inserted };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("[seed-benchmark-instruments] no DB creds — cannot run here (exit 2).");
    process.exit(2);
  }
  const { readAll, guardedInsertMany } = await import("../lib/db.mjs");
  const listExistingKeys = async () => {
    const rows = await readAll("community_benchmark_instruments", "key");
    return rows.map((r) => r.key);
  };
  main({ apply: process.argv.includes("--apply") }, { listExistingKeys, guardedInsertMany }).catch((e) => {
    console.error("[seed-benchmark-instruments] fatal:", e);
    process.exit(1);
  });
}
