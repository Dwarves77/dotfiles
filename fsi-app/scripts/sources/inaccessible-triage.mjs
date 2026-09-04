#!/usr/bin/env node
// inaccessible-triage.mjs — the acquisition ladder run over the suspended-source pool (Lane F2,
// 2026-09-02, docs/plans/finish-plan-2026-09-02.md §2 Wave 1).
//
// WHAT "inaccessible" MEANS HERE (per scripts/lib/exclusion-audit.mjs's own header): in the live
// schema, the DESIGN vocabulary's "inaccessible source" is the `sources.status = 'suspended'` row —
// not the separate, legacy `status = 'inaccessible'` enum value the accessibility-check eviction path
// writes on a definitive DEAD. This triage's population is `sources WHERE status = 'suspended'`.
//
// WHY A LADDER, NOT A RE-CHECK. A suspended source has never been triaged with the completed
// acquisition ladder (docs/audits/acquisition-ladder-post-mortem-2026-07-14.md): roadblock ->
// bounded alternative-source search -> same-floor qualification. Nothing is written off without
// ladder evidence. This script REUSES the live ladder rather than reimplementing it:
//   step 1 (re-probe primary)      -> fetchPrimaryWithFallback's own declared-primary attempt
//                                      (src/lib/sources/primary-fallback.mjs, detectRoadblock)
//   step 2 (bounded alt search)    -> seek-more.generateCandidates (identifier-resolved canonical URLs
//                                      -> the source's own search surface -> NO open-web search here,
//                                      $0 / no LLM / no paid service, per the build-mode ruling)
//   step 3 (same-floor qualify)    -> host-authority.classTierForHost (the SC-13 codified/ruled host
//                                      class table) gates the alternative against the source's OWN
//                                      base_tier (institution.ts's MOAT: base_tier is the grounding-
//                                      eligibility stamp, NEVER effective_tier — the same rule applies
//                                      here: an alternative may never confer authority the dynamic
//                                      reputation number would allow but the static classification
//                                      would not); officialness.officialnessOf runs alongside for the
//                                      richer host+instrument-body verdict, recorded as evidence for
//                                      the human reviewer even when its instrument-marker half (tuned
//                                      for a single legal instrument's body text) does not apply to a
//                                      portal-class alternative.
// A dossier is written for EVERY triaged source regardless of outcome — the dossier IS the ladder
// evidence a write-off requires (finish plan: "never a write-off without evidence"). Surviving
// suspensions (still_inaccessible) feed lane R1's provisional-source ratification digest
// (docs/ratifications/2026-09/**, R1's write set, not this lane's) for a keep/suspend ruling.
//
// $0 / NO LLM (standing ruling): no Browserless, no Anthropic call, no paid search. Re-probes use a
// plain HTTP fetch with the SAME realistic-browser header set + one same-invocation 403 retry the
// capture-worker uses (fsi-app/supabase/functions/capture-worker/index.ts v1.5/v1.6 PRIMARY_HEADERS /
// ALT_HEADERS_ON_403) — duplicated here, not imported: the capture worker is a Deno edge function
// (`npm:`/`jsr:` specifiers), unreachable from a Node script.
//
// DRY BY DEFAULT. `--apply` mode's ONLY mutation is `sources.fetch_status` / `fetch_status_at`
// (migration 147) — the SAME column the live monitoring chain already uses for a fetch check's
// outcome (src/lib/agent/canonical-pipeline.ts's `recordSourceFetchStatus` / `fetchStatusFromPf`,
// written at the ITEM primary-fetch site). `fetchStatusForDossier` below mirrors that (module-private,
// unexported) function's exact 4-case vocabulary so the two writers of this column can never disagree
// on meaning. Grepped first, per the brief: no `check_result` / `source_checks` table exists; the
// other two grep hits (`intelligence_changes`, `last_checked`) are item-change-log and a per-check
// timestamp, neither an "outcome" column. If `sources.fetch_status` does not exist on the live schema
// (migration 147 is a schema-DDL migration under the two-track policy and may not be applied yet),
// --apply mode detects the "column does not exist" error, writes nothing further, and says so — the
// dossiers remain the artifact.
//
// Writes go through the guarded path (scripts/lib/db.mjs guardedUpdateByIds — snapshot + skill-cite,
// rule 015). CONCURRENCY-BOUNDED (<=4 sources in flight), PER-HOST POLITE (>=1s between hits to the
// same host, primary + every alternative), TOTAL TIME BUDGET (CLI flag, default 20 min) so a dispatch
// never runs past the workflow's own timeout mid-write — the budget stops STARTING new source triages;
// already-started ones finish under their own per-fetch bound.
//
// USAGE:
//   node scripts/sources/inaccessible-triage.mjs                          # dry: dossiers only
//   node scripts/sources/inaccessible-triage.mjs --apply                  # + sources.fetch_status write
//   node scripts/sources/inaccessible-triage.mjs --limit 20 --out-dir /tmp/dossiers --time-budget-min 5
//
// GOVERNING: remediation-discipline (Section 4 — roadblock resilience) + source-credibility-model
// (qualification) + env-policy (find replacements) — the same triad primary-fallback.mjs cites.

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync, writeFileSync } from "node:fs";

import { fetchPrimaryWithFallback } from "../../src/lib/sources/primary-fallback.mjs";
import { generateCandidates } from "../../src/lib/sources/seek-more.mjs";
import { officialnessOf } from "../../src/lib/sources/officialness.mjs";
// host-authority.ts is dependency-free (no imports) — the same "pure .ts importable from a Node-24
// .mjs" precedent scripts/lib/db.mjs already relies on for classify-source-role.ts.
import { classTierForHost } from "../../src/lib/sources/host-authority.ts";
import { hostOf } from "../lib/institution-key.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

export const CITE = Object.freeze({
  skill: "remediation-discipline",
  reason:
    "Ladder-dossier outcome for a suspended source (roadblock -> bounded alternative search -> same-floor " +
    "qualification), written to sources.fetch_status/fetch_status_at (migration 147) — the same column " +
    "canonical-pipeline.ts's fetchStatusFromPf writes at the item primary-fetch site, so both writers of " +
    "this column agree on meaning. Lane F2, finish-plan-2026-09-02.md, 2026-09-02.",
});

// ── defaults (CLI-overridable) ────────────────────────────────────────────────────────────────────
export const DEFAULT_TIME_BUDGET_MIN = 20;
export const DEFAULT_CONCURRENCY = 4;
export const MAX_CONCURRENCY = 4; // "concurrency-bounded (<=4)" — a CLI value above this is clamped, never honored
export const DEFAULT_HOST_INTERVAL_MS = 1000; // "per-host politeness (>=1s)" — a CLI value below this is clamped up
// not exported (lane DEAD-EXEC, 2026-09-04): used only within this file, per the wiring audit's
// Appendix B (dead exports, 2026-09-04) — the sibling DEFAULT_* constants above remain exported since
// other callers import them individually.
const DEFAULT_PER_FETCH_MS = 20000;

// v1.5/v1.6 realistic browser fingerprints, verbatim from capture-worker/index.ts (see header note).
const PRIMARY_HEADERS = Object.freeze({
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept":
    "text/html,application/xhtml+xml,application/xml;q=0.9,application/pdf;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
});
const ALT_HEADERS_ON_403 = Object.freeze({
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
  "Accept":
    "text/html,application/xhtml+xml,application/xml;q=0.9,application/pdf;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
});

// ── CLI args (pure) ───────────────────────────────────────────────────────────────────────────────
/** @param {string[]} argv (process.argv shape) */
export function parseArgs(argv) {
  const args = argv.slice(2);
  const flagNum = (flag, dflt) => {
    const i = args.indexOf(flag);
    if (i < 0) return dflt;
    const n = Number(args[i + 1]);
    return Number.isFinite(n) ? n : dflt;
  };
  const flagStr = (flag, dflt) => {
    const i = args.indexOf(flag);
    return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : dflt;
  };
  const limitRaw = flagNum("--limit", null);
  return {
    apply: args.includes("--apply"),
    limit: limitRaw != null && Number.isInteger(limitRaw) && limitRaw > 0 ? limitRaw : null,
    concurrency: Math.max(1, Math.min(MAX_CONCURRENCY, flagNum("--concurrency", DEFAULT_CONCURRENCY))),
    hostIntervalMs: Math.max(DEFAULT_HOST_INTERVAL_MS, flagNum("--host-interval-ms", DEFAULT_HOST_INTERVAL_MS)),
    perFetchMs: Math.max(1000, flagNum("--per-fetch-ms", DEFAULT_PER_FETCH_MS)),
    timeBudgetMs: Math.max(0.1, flagNum("--time-budget-min", DEFAULT_TIME_BUDGET_MIN)) * 60000,
    outDir: flagStr("--out-dir", "dossiers"),
  };
}

// ── scheduling primitives (pure-ish; now/sleep injectable so tests run without real delays) ─────────
function defaultSleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

/** Per-host politeness: waitTurn(host) resolves only once >=minIntervalMs has elapsed since the last
 *  resolved waitTurn for that SAME host. Stateful across calls (one throttle instance per run). */
export function createHostThrottle({ minIntervalMs = DEFAULT_HOST_INTERVAL_MS, now = Date.now, sleep = defaultSleep } = {}) {
  const lastHitAt = new Map();
  return async function waitTurn(host) {
    const prev = lastHitAt.get(host) ?? -Infinity;
    const elapsed = now() - prev;
    if (elapsed < minIntervalMs) await sleep(minIntervalMs - elapsed);
    lastHitAt.set(host, now());
  };
}

/** Concurrency-bounded runner with a hard deadline: once `now() > deadlineAt`, no NEW item is started
 *  (already-started work is untouched — each worker call is itself bounded by perFetchMs upstream).
 *  Returns one entry per item, in no particular order: { item, skipped, result? , error? }. */
export async function runBounded(items, worker, { concurrency = DEFAULT_CONCURRENCY, deadlineAt = Infinity, now = Date.now } = {}) {
  const results = [];
  let idx = 0;
  async function lane() {
    for (;;) {
      if (idx >= items.length) return;
      if (now() > deadlineAt) {
        for (; idx < items.length; idx++) results.push({ item: items[idx], skipped: true, reason: "time_budget_exhausted" });
        return;
      }
      const item = items[idx++];
      try {
        const result = await worker(item);
        results.push({ item, skipped: false, result });
      } catch (e) {
        results.push({ item, skipped: false, error: String((e && e.message) || e) });
      }
    }
  }
  const lanes = Math.max(1, Math.min(concurrency, items.length || 1));
  await Promise.all(Array.from({ length: lanes }, lane));
  return results;
}

// ── raw HTTP re-probe (capture-worker's header set + one 403-alt-fingerprint retry) ─────────────────
/** @param {(url:string, init:object) => Promise<any>} fetchImpl */
export async function probeHead(fetchImpl, url, timeoutMs) {
  try {
    const r = await fetchImpl(url, { method: "HEAD", headers: PRIMARY_HEADERS, redirect: "follow", signal: AbortSignal.timeout(timeoutMs) });
    return { status: r.status, redirected: !!r.redirected, finalUrl: r.url || url };
  } catch (e) {
    return { status: null, redirected: false, finalUrl: url, err: String((e && e.message) || e) };
  }
}

export async function probeGet(fetchImpl, url, timeoutMs) {
  try {
    let r = await fetchImpl(url, { method: "GET", headers: PRIMARY_HEADERS, redirect: "follow", signal: AbortSignal.timeout(timeoutMs) });
    let usedAlt = false;
    if (r.status === 403) {
      try {
        const retry = await fetchImpl(url, { method: "GET", headers: ALT_HEADERS_ON_403, redirect: "follow", signal: AbortSignal.timeout(timeoutMs) });
        if (retry.status !== 403) { r = retry; usedAlt = true; }
      } catch { /* alt fingerprint failed too — keep the original 403 */ }
    }
    const text = typeof r.text === "function" ? await r.text().catch(() => "") : "";
    return { text, status: r.status, redirected: !!r.redirected, finalUrl: r.url || url, usedAlt };
  } catch (e) {
    return { text: "", status: 0, redirected: false, finalUrl: url, usedAlt: false, err: String((e && e.message) || e) };
  }
}

// ── same-floor qualification (pure) ───────────────────────────────────────────────────────────────
/** An alternative qualifies at the source's floor iff its host classifies to a KNOWN tier (no guess —
 *  an unclassified host never qualifies, honest-quarantine > hollow-pass) AND that tier is at least as
 *  authoritative (numerically <=) as the floor. floorTier == null (a source with no base_tier reading)
 *  is treated as "any classified host qualifies" — never as "anything qualifies". */
export function qualifiesAtFloor(hostTier, floorTier) {
  if (hostTier == null) return false;
  if (floorTier == null) return true;
  return hostTier <= floorTier;
}

// ── the existing monitoring chain's outcome column (migration 147) ───────────────────────────────────
/** Mirrors canonical-pipeline.ts's module-private `fetchStatusFromPf` (not exported, so not literally
 *  importable) vocabulary exactly, so the two writers of sources.fetch_status can never disagree on
 *  meaning: recovered -> 'ok'; a roadblocked primary (whether or not an alternative was found) carries
 *  its own roadblock reason -> 'cdn_block' / 'soft_404' / 'blocked' (the catch-all for challenge_stub /
 *  empty_stub / wrong_language_only / error_body / timeout / http_xxx); no determinate reason -> null
 *  (ambiguous, leave unchanged — the fetchStatusFromPf rule). */
export function fetchStatusForDossier(dossier) {
  if (dossier.outcome === "recovered") return "ok";
  const reason = dossier?.probe?.primary?.reason ?? null;
  if (!reason || reason === "ok") return null;
  if (reason === "cdn_block") return "cdn_block";
  if (reason === "soft_404") return "soft_404";
  return "blocked";
}

// ── per-source triage (the ladder, reused) ────────────────────────────────────────────────────────
/**
 * @param {{id:string,url:string,name:string,base_tier?:number|null,jurisdictions?:string[]}} source
 * @param {{ fetchImpl:Function, throttle:(host:string)=>Promise<void>, perFetchMs:number,
 *           generateCandidatesFn?:Function, fetchPrimaryWithFallbackFn?:Function,
 *           officialnessOfFn?:Function, classTierForHostFn?:Function }} deps
 */
export async function triageOneSource(source, deps) {
  const {
    fetchImpl, throttle, perFetchMs,
    generateCandidatesFn = generateCandidates,
    fetchPrimaryWithFallbackFn = fetchPrimaryWithFallback,
    officialnessOfFn = officialnessOf,
    classTierForHostFn = classTierForHost,
  } = deps;

  const url = source.url;
  const probeLog = new Map(); // url -> { status, redirected, finalUrl, usedAlt, err? } (raw GET metadata)

  // step 1 IS the ladder's own declared-primary attempt (fetchPrimaryWithFallback's first fetch) — this
  // wrapper only adds per-host politeness + records the raw HTTP metadata detectRoadblock's classification
  // (in `alternatives[]`) does not carry, so the dossier's `probe` has status/redirect/finalUrl too.
  const politeGet = async (u) => {
    const host = hostOf(u);
    await throttle(host);
    const r = await probeGet(fetchImpl, u, perFetchMs);
    probeLog.set(u, { status: r.status, redirected: r.redirected, finalUrl: r.finalUrl, usedAlt: r.usedAlt, err: r.err });
    return { text: r.text, status: r.status };
  };

  // A standalone HEAD re-probe of the declared primary — cheap, independent evidence (some bot gates
  // answer HEAD and GET differently); does not gate or duplicate the ladder's own GET above.
  await throttle(hostOf(url));
  const head = await probeHead(fetchImpl, url, perFetchMs);

  // Source identity fed to the ladder's discovery rung. A `sources` row is a PORTAL, not a single legal
  // instrument, so it carries no `identifier` — the deterministic CELEX/UK-SI/Norway/Ireland resolvers
  // correctly yield nothing without one; what fires is the source's OWN search-surface endpoint (e.g.
  // legislation.gov.uk/all?title=, federalregister.gov's API by title) when jurisdiction/host match a
  // known scheme, or the re-offered API endpoint for an already-API-routable host. No `webSearch` dep is
  // passed — deterministic candidates only ($0 / no paid search, per the build-mode ruling).
  const identity = { title: source.name, jurisdiction: source.jurisdictions, sourceUrl: url };

  const pf = await fetchPrimaryWithFallbackFn(
    { title: source.name, primaryUrl: url, itemType: null },
    { browserlessFetch: politeGet, discoverCandidates: () => generateCandidatesFn(identity, {}), perFetchMs, maxAlts: 3, maxCandidates: 6 },
  );

  const primaryStep = pf.alternatives[0]; // { url, len, langRatio, reason, role: 'declared_primary' }
  const probe = { head, primary: { ...primaryStep, ...(probeLog.get(primaryStep.url) || {}) } };

  let outcome, evidence;
  if (pf.ok && !pf.fellBack) {
    // step 1 alone succeeded — the declared primary is reachable again.
    outcome = "recovered";
    evidence = { note: "declared primary now returns usable, in-language content directly (no fallback needed)." };
  } else if (pf.ok && pf.fellBack) {
    // step 2 found a fetchable alternative — step 3: qualify it, never promote on content alone.
    const altHost = hostOf(pf.url);
    const hostTier = classTierForHostFn(altHost);
    const floorTier = source.base_tier ?? null; // institution.ts's MOAT: base_tier is the grounding-eligibility
    // stamp; effective_tier (dynamic reputation) must never confer eligibility a static classification would not.
    const qualifies = qualifiesAtFloor(hostTier, floorTier);
    const off = officialnessOfFn(pf.text, altHost, { hostTier, floorTier });
    outcome = qualifies ? "alternative_found" : "still_inaccessible";
    evidence = {
      qualifiedUrl: pf.url, hostTier, floorTier, qualifies,
      officialness: { path: off.path, reason: off.reason, cleanLen: off.cleanLen, linkDensity: off.linkDensity },
      note: qualifies
        ? "a bounded alternative was found and clears the source's own authority floor."
        : "a bounded alternative was fetchable but its host does not clear the source's authority floor — recorded as evidence, never promoted (the moat: no silent authority downgrade).",
    };
  } else {
    // step 2 exhausted (or found nothing fetchable) — the honest terminal, never a silent write-off.
    outcome = "still_inaccessible";
    evidence = {
      note: "primary roadblocked; the bounded alternative search found no fetchable candidate.",
      candidatesTried: Math.max(0, pf.alternatives.length - 1),
    };
  }

  return {
    source_id: source.id,
    url,
    name: source.name,
    base_tier: source.base_tier ?? null,
    probe,
    ladder_steps: pf.alternatives,
    outcome,
    evidence,
  };
}

// ── apply-mode DB write (guarded path; the one sanctioned mutation) ──────────────────────────────────
const COLUMN_MISSING_RE = /column .*fetch_status.* does not exist/i;

/** Groups dossiers by their target fetch_status value and writes each group through guardedUpdateByIds.
 *  If sources.fetch_status does not exist on the live schema (migration 147 not yet applied), the first
 *  such failure is caught and reported honestly — apply mode writes nothing further; the dossiers stand
 *  as the artifact, per the brief's explicit fallback. */
export async function applyFetchStatus(dossiers, { guardedUpdateByIds }) {
  const groups = new Map(); // fetch_status -> source_id[]
  for (const d of dossiers) {
    const status = fetchStatusForDossier(d);
    if (!status) continue; // ambiguous — leave unchanged (fetchStatusFromPf's own rule)
    if (!groups.has(status)) groups.set(status, []);
    groups.get(status).push(d.source_id);
  }
  if (!groups.size) return { attempted: false, updated: 0, column_exists: null, note: "no dossier produced a determinate fetch_status." };

  const stampIso = new Date().toISOString();
  let updated = 0;
  for (const [status, ids] of groups) {
    try {
      const r = await guardedUpdateByIds("sources", ids, { fetch_status: status, fetch_status_at: stampIso }, { cite: CITE });
      updated += r.updated;
    } catch (e) {
      const msg = String((e && e.message) || e);
      if (COLUMN_MISSING_RE.test(msg)) {
        return {
          attempted: true, updated, column_exists: false,
          note: "sources.fetch_status does not exist on the live schema (migration 147 not applied) — apply mode wrote nothing further; the dossiers are the artifact.",
        };
      }
      throw e;
    }
  }
  return { attempted: true, updated, column_exists: true };
}

// ── orchestration ─────────────────────────────────────────────────────────────────────────────────
/**
 * @param {{apply?:boolean, limit?:number|null, concurrency?:number, hostIntervalMs?:number,
 *           perFetchMs?:number, timeBudgetMs?:number, outDir?:string}} opts
 * @param {{ readAll:Function, guardedUpdateByIds?:Function, fetchImpl?:Function,
 *           writeDossierFile?:Function, writeSummaryFile?:Function, now?:Function, sleep?:Function }} deps
 */
export async function main(opts, deps) {
  const {
    apply = false, limit = null, concurrency = DEFAULT_CONCURRENCY, hostIntervalMs = DEFAULT_HOST_INTERVAL_MS,
    perFetchMs = DEFAULT_PER_FETCH_MS, timeBudgetMs = DEFAULT_TIME_BUDGET_MIN * 60000, outDir = "dossiers",
  } = opts || {};
  const {
    readAll, guardedUpdateByIds, fetchImpl = fetch,
    writeDossierFile = () => {}, writeSummaryFile = () => {},
    now = Date.now, sleep = defaultSleep,
  } = deps;

  console.log(`[inaccessible-triage] mode = ${apply ? "APPLY" : "DRY-RUN"}  concurrency=${concurrency}  hostIntervalMs=${hostIntervalMs}  timeBudgetMin=${(timeBudgetMs / 60000).toFixed(1)}`);

  let sources = await readAll("sources", "id,url,name,base_tier,jurisdictions,status", { match: (q) => q.eq("status", "suspended") });
  if (limit != null) sources = sources.slice(0, limit);
  console.log(`[inaccessible-triage] ${sources.length} suspended source(s) to triage`);

  const throttle = createHostThrottle({ minIntervalMs: hostIntervalMs, now, sleep });
  const deadlineAt = now() + timeBudgetMs;

  const outcomes = await runBounded(
    sources,
    (source) => triageOneSource(source, { fetchImpl, throttle, perFetchMs }),
    { concurrency, deadlineAt, now },
  );

  const dossiers = [];
  let skippedForBudget = 0, errored = 0;
  for (const o of outcomes) {
    if (o.skipped) { skippedForBudget++; continue; }
    if (o.error) { errored++; console.error(`[inaccessible-triage] ${o.item.id} ${o.item.url} FAILED: ${o.error}`); continue; }
    dossiers.push(o.result);
    writeDossierFile(outDir, o.result);
  }

  const summary = {
    mode: apply ? "apply" : "dry-run",
    suspended: sources.length,
    triaged: dossiers.length,
    skipped_time_budget: skippedForBudget,
    errored,
    recovered: dossiers.filter((d) => d.outcome === "recovered").length,
    alternative_found: dossiers.filter((d) => d.outcome === "alternative_found").length,
    still_inaccessible: dossiers.filter((d) => d.outcome === "still_inaccessible").length,
  };
  console.log(`[inaccessible-triage] ${JSON.stringify(summary)}`);
  writeSummaryFile(outDir, summary);

  if (!apply || !dossiers.length) return { summary, dossiers, dbWrite: { attempted: false, updated: 0, column_exists: null } };

  const dbWrite = await applyFetchStatus(dossiers, { guardedUpdateByIds });
  console.log(`[inaccessible-triage] db write: ${JSON.stringify(dbWrite)}`);
  return { summary, dossiers, dbWrite };
}

// ── CLI bootstrap ─────────────────────────────────────────────────────────────────────────────────
function defaultWriteDossierFile(outDir, dossier) {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, `${dossier.source_id}.json`), JSON.stringify(dossier, null, 2));
}
function defaultWriteSummaryFile(outDir, summary) {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, "_summary.json"), JSON.stringify(summary, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch { /* CI: env injected */ }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("[inaccessible-triage] no DB creds — cannot run here (exit 2).");
    process.exit(2);
  }
  const { readAll, guardedUpdateByIds } = await import("../lib/db.mjs");
  const opts = parseArgs(process.argv);
  main(opts, {
    readAll, guardedUpdateByIds, fetchImpl: fetch,
    writeDossierFile: defaultWriteDossierFile,
    writeSummaryFile: defaultWriteSummaryFile,
  }).catch((e) => {
    console.error("[inaccessible-triage] fatal:", e);
    process.exit(1);
  });
}
