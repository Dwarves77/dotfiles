#!/usr/bin/env node
// institution-canonicalize.mjs — MAINT dispatch step for Lane SRC-TIER (2026-09-03): fixes the
// "duplicate-row defect" the source-credibility-model skill names in SKILL.md §3 ("Canonical
// institutional tier (one tier per institution)") — a real institution split across TWO `institutions`
// rows, or one institution whose `sources` rows disagree on `base_tier`. Measured live 2026-09-03:
// "Smart Freight Centre" holds two institution rows (3e5b443c on smartfreightcentre.org, base_tier 4;
// f9d3523a on amazonaws.com, base_tier 5 — the institution was keyed by the host of an S3-hosted PDF),
// which fails "GLEC Framework v3"'s own-body authority floor (migration 202 / SC-14) because the
// standard's own text resolves through the mis-keyed S3 row instead of its real institution.
//
// UPSTREAM: NONE EXISTS TO WRAP (same posture as origin-class-backfill.mjs's own header) —
// `scripts/maintenance/provenance-heal.mjs` / `scripts/mint/heal-provenance.mjs` STEP B ("OWN-BODY")
// find-or-creates an `institutions` row for an unlinked source, but neither that file nor anything else
// in the repo detects or repairs an ALREADY-mis-keyed institution or an already-inconsistent per-row
// tier. This step is that missing repair, built directly from SKILL.md §3's own rule text.
//
// THREE PARTS, only two of which write:
//
//   A. MIS-KEYED INSTITUTION MERGE (deterministic, applies). An `institutions` row whose
//      `registrable_domain` is a GENERIC HOSTING domain (GENERIC_HOSTING_DOMAINS below — a small,
//      explicit, no-fuzzy-rule list) and whose `name` matches (case/whitespace-insensitive, exact)
//      exactly one OTHER institution with a real domain is a mis-keyed duplicate of that institution:
//      every `sources.institution_id` pointing at the duplicate is re-pointed to the canonical row, and
//      the (now-unreferenced) duplicate institution row is deleted. Zero name matches -> skipped (no
//      canonical to merge into, nothing invented). More than one name match -> REFUSED (ambiguous which
//      one is canonical; reported, never guessed). `institutions` has exactly ONE inbound FK in this repo
//      — `sources.institution_id` (migration 122; confirmed by `grep -rn "institutions(id)"
//      supabase/migrations` finding only migration 122 itself, plus two SELECT-only readers in migrations
//      202/288 that reference the column, not a second FK) — so re-pointing `sources` is sufficient; if a
//      future migration adds a second FK to `institutions` and rows still reference the duplicate after
//      the sources repoint, the merge is refused rather than silently deleting a referenced row (see
///     `countSourcesForInstitution` read-back before every delete).
//
//   B. INTRA-INSTITUTION TIER CANONICALISATION (deterministic, applies), evaluated on the POST-MERGE
//      institution grouping (a mis-keyed row's sources are evaluated under their real institution, not
//      their now-stale duplicate id) so Part A's merge and Part B's canonicalization compose correctly in
//      one dispatch. For every institution whose non-override sources rows carry MORE THAN ONE distinct
//      `base_tier`, the canonical tier is whatever single tier the institution's OWN-registrable-domain
//      rows already agree on (host of `sources.url` ends with `institutions.registrable_domain`); every
//      other row of that institution is set to that tier (and `effective_tier` too, ONLY where the row's
//      `effective_tier` still equals its OLD `base_tier` — never touched otherwise, since an
//      already-diverged effective_tier reflects real citation-network signal, not the stale base_tier).
//      Rows carrying `tier_override` (the skill's own sanctioned per-row exception, SKILL.md §3) are
//      IGNORED throughout — never counted toward "inconsistent", never rewritten. If the institution's
//      own-domain rows themselves disagree, this step does NOT choose — it reports
//      `tier_conflict_unresolved` with the tier counts (an operator call, not a mechanical one). If the
//      institution has NO own-domain rows at all (every row is off-institution, e.g. only ever cited via
//      third-party mirrors), it reports `no_own_domain_rows` rather than guessing from a majority vote.
//      This NEVER writes a tier no row of the institution already carries — the canonical tier is always
//      read off an existing own-domain row, never computed or defaulted (the same no-invention posture
//      SC-13 requires at registration, applied here to an existing institution's internal consistency).
//
//   C. CLASS-TIER GAP REPORT + OVERRIDE (report always computed; the override applies ONLY for a host the
//      class table now classifies — see below). `planRulingNeeded` lists every active/provisional
//      `source_role='standards_body'` source whose `base_tier` is worse than the class-table floor (T4 —
//      SKILL.md §3's "Industry body / classification society" row, which professional standards bodies
//      share), grouped by host — computed and included in every summary.json regardless of --mode, exactly
//      like origin-class-backfill's own `counts` block. Historically NEVER applied, because ADR-002 states
//      `base_tier` "never changes except via explicit operator override", and raising an ALREADY-registered
//      source's tier is a credibility ruling, not a mechanical defect repair (unlike Part B, which only
//      ever restores a tier a row of the SAME institution already carries) — and, until 2026-09-04, no
//      mechanism carried that ruling: `src/lib/sources/host-authority.ts`'s `classTierForHost` assigned a
//      class tier only at REGISTER-AT-GROUNDING time for a NEW, not-yet-registered pool host (SC-13); it
//      never classified ifrs.org / cdp.net / sciencebasedtargets.org at all (no rule matched them, so they
//      worklisted at STEP SOURCE — audit C1 §6, C2 — instead of grounding at their own T4).
//
//      OPERATOR RULING (2026-09-04, verbatim, on exactly this gap): "you know how to classify, fix it …
//      T4". host-authority.ts now carries a `standards_body` class (STANDARDS_BODY_ALLOW, same posture as
//      its existing ASSOCIATION_ALLOW: curated, never a fuzzy .org rule) covering the three named hosts
//      plus GHG Protocol / ISO / GRI / TNFD (same rule, live in `sources` today). That IS the "explicit
//      operator override" ADR-002 requires — a named, reviewed ruling, not a guess — so `planClassTierOverride`
//      below applies it: for a `standards_body` row worse than T4 whose host `classTierForHost` NOW resolves
//      to EXACTLY the class tier (4), the row's `base_tier` (and `effective_tier` where it still equals the
//      old `base_tier`, same convention as Part B) is written to 4 through the guarded path. A host the
//      class table does NOT classify stays in `planRulingNeeded` only — genuinely awaiting the operator,
//      never guessed. `dry` mode lists the override plan without writing (`part_c_class_override.plan`).
//
// Tiers T2/T3 already ruled DOWN from the T4 class default (ghgprotocol.org, sciencebasedtargetsnetwork.org,
// tnfd.global at T3; efrag.org at T2) are deliberate rulings, higher authority than the class default — both
// the `planRulingNeeded` filter (`base_tier > STANDARDS_BODY_CLASS_TIER`) and `planClassTierOverride`'s same
// filter naturally exclude them (their `base_tier` is already BETTER than 4); listing them in
// STANDARDS_BODY_ALLOW never regresses them, since `decidePoolHostRegistration`'s `inherit` branch (an
// already-resolving institution) always wins over `classTierForHost` for a host with existing rows.
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { hostOf } from "../lib/institution-key.mjs";
import { classTierForHost } from "../../src/lib/sources/host-authority.ts";
import { runCli } from "./lib/cli.mjs";

export const CITE = Object.freeze({
  skill: "source-credibility-model",
  reason:
    "MAINT institution-canonicalize dispatch (Lane SRC-TIER, 2026-09-03; Part C class-tier override added " +
    "2026-09-04 per operator ruling 'you know how to classify, fix it … T4'): Part A merges an institutions " +
    "row mis-keyed to a generic hosting domain into its real-domain sibling of the same name, re-pointing " +
    "sources.institution_id; Part B sets an institution's inconsistent per-row base_tier (and, where it " +
    "still matches the old base_tier, effective_tier) to the tier its OWN registrable-domain rows already " +
    "carry, per SKILL.md §3 'Canonical institutional tier (one tier per institution)' — never inventing a " +
    "tier no row of the institution already has, never touching a tier_override row. Part C's ruling_needed " +
    "report is unconditional; its class-tier override writes base_tier=4 (and effective_tier where it still " +
    "matches the old base_tier) ONLY for a standards_body row whose host host-authority.ts's classTierForHost " +
    "now classifies to the standards-body class tier (STANDARDS_BODY_ALLOW, the operator ruling itself), " +
    "never for a host the class table leaves ambiguous.",
});

// ── Part A: generic hosting domains ─────────────────────────────────────────────────────────────────
// Explicit list, no fuzzy/pattern rule (SC-13's own no-guess posture, applied here to institution
// identity rather than tier). A registrable_domain in this list means the row was keyed off WHERE a
// document happened to be HOSTED (S3 bucket, CDN edge, blob storage), not WHO published it — the exact
// shape of the live "Smart Freight Centre" / amazonaws.com defect.
export const GENERIC_HOSTING_DOMAINS = Object.freeze([
  "amazonaws.com", // AWS — the GLEC PDF's host, smart-freight-centre-media.s3.amazonaws.com, matches here
  "s3.amazonaws.com", // explicit S3 form some registration paths store instead of the bare amazonaws.com
  "cloudfront.net", // AWS CDN
  "blob.core.windows.net", // Azure Blob Storage
  "googleapis.com", // Google Cloud APIs surface (includes the googleapis.com Cloud Storage form)
  "storage.googleapis.com", // explicit Google Cloud Storage form
  "azureedge.net", // Azure CDN
  "cloudflare.net", // Cloudflare-managed hosting
  "akamaihd.net", // Akamai CDN
  "digitaloceanspaces.com", // DigitalOcean Spaces (S3-compatible object storage)
  "r2.cloudflarestorage.com", // Cloudflare R2 object storage — same shape as S3/Spaces, obviously equivalent
  "backblazeb2.com", // Backblaze B2 object storage — same shape, obviously equivalent
]);

function normalizeDomain(d) {
  return String(d || "").trim().toLowerCase().replace(/\.$/, "");
}

/** True when `domain` (or a subdomain of it) is one of the GENERIC_HOSTING_DOMAINS — the small,
 *  explicit, no-fuzzy-rule list above. Suffix match only against that closed list, never a heuristic. */
export function isGenericHostingDomain(domain) {
  const d = normalizeDomain(domain);
  if (!d) return false;
  return GENERIC_HOSTING_DOMAINS.some((g) => d === g || d.endsWith(`.${g}`));
}

/** Case/whitespace-insensitive name key for the exact-match rule Part A requires. */
export function normalizeName(name) {
  return String(name || "").trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * PURE Part A planner. `institutions`: [{ id, name, registrable_domain }, ...].
 * Returns one plan entry per generic-domain institution:
 *   - { status: "merge", duplicate_id, duplicate_domain, canonical_id, canonical_domain, name } —
 *     exactly one same-name, real-domain institution found.
 *   - { status: "refused_multiple_matches", duplicate_id, duplicate_domain, name, candidate_ids } —
 *     more than one same-name candidate; ambiguous, never guessed.
 *   - { status: "skipped_no_name_match", duplicate_id, duplicate_domain, name } — no real-domain
 *     institution shares this name; nothing to merge into.
 * An institution whose own domain is NOT generic never appears in the plan (nothing to do).
 */
export function planMerges(institutions) {
  const plans = [];
  for (const inst of institutions) {
    if (!isGenericHostingDomain(inst.registrable_domain)) continue;
    const nkey = normalizeName(inst.name);
    const candidates = institutions.filter(
      (o) => o.id !== inst.id && normalizeName(o.name) === nkey && !isGenericHostingDomain(o.registrable_domain),
    );
    if (candidates.length === 1) {
      plans.push({
        status: "merge",
        duplicate_id: inst.id,
        duplicate_domain: inst.registrable_domain,
        canonical_id: candidates[0].id,
        canonical_domain: candidates[0].registrable_domain,
        name: inst.name,
      });
    } else if (candidates.length === 0) {
      plans.push({ status: "skipped_no_name_match", duplicate_id: inst.id, duplicate_domain: inst.registrable_domain, name: inst.name });
    } else {
      plans.push({
        status: "refused_multiple_matches",
        duplicate_id: inst.id,
        duplicate_domain: inst.registrable_domain,
        name: inst.name,
        candidate_ids: candidates.map((c) => c.id),
      });
    }
  }
  return plans;
}

/** Applies the "merge" entries of a Part A plan to a `sources` array IN MEMORY (institution_id
 *  duplicate_id -> canonical_id), so Part B's grouping reflects the post-merge world without a second DB
 *  round-trip in dry mode. Pure; never mutates the input array. */
export function applyMergeSimulation(sources, mergePlans) {
  const remap = new Map(mergePlans.filter((p) => p.status === "merge").map((p) => [p.duplicate_id, p.canonical_id]));
  if (!remap.size) return sources;
  return sources.map((s) => (remap.has(s.institution_id) ? { ...s, institution_id: remap.get(s.institution_id) } : s));
}

/** True when `hostOf(url)` equals `domain` or is a subdomain of it. Pure. */
export function hostEndsWithDomain(url, domain) {
  const host = hostOf(url);
  const d = normalizeDomain(domain);
  if (!host || !d) return false;
  return host === d || host.endsWith(`.${d}`);
}

/**
 * PURE Part B planner. `sources`: [{ id, url, base_tier, effective_tier, tier_override, institution_id }].
 * `institutionsById`: Map(id -> { id, name, registrable_domain }). tier_override rows are excluded from
 * every computation below (SKILL.md §3's sanctioned per-row exception) — never counted toward
 * "inconsistent", never planned for a write.
 * Returns one entry per institution that carries MORE THAN ONE distinct base_tier among its
 * non-override rows:
 *   - { status: "canonicalize", institution_id, institution_name, canonical_domain, canonical_tier,
 *       rows: [{ source_id, old_base_tier, new_base_tier, also_effective_tier }] } — the institution's
 *     own-domain rows agree on one tier; every other row is planned to move to it.
 *   - { status: "tier_conflict_unresolved", institution_id, institution_name, own_domain_tier_counts } —
 *     the institution's own-domain rows themselves disagree; an operator call, never chosen here.
 *   - { status: "no_own_domain_rows", institution_id, institution_name, tiers_present, row_count } — the
 *     institution has no rows on its own registrable domain to read a canonical tier off; never guessed
 *     from a majority vote of off-domain rows.
 * An institution whose non-override rows already agree on one tier never appears (nothing to do).
 */
export function planTierCanonicalization(sources, institutionsById) {
  const byInst = new Map();
  for (const s of sources) {
    if (!s.institution_id) continue;
    if (s.tier_override != null) continue; // sanctioned per-row exception — never counted, never touched
    if (!byInst.has(s.institution_id)) byInst.set(s.institution_id, []);
    byInst.get(s.institution_id).push(s);
  }

  const plans = [];
  for (const [instId, rows] of byInst) {
    const distinctTiers = new Set(rows.map((r) => r.base_tier).filter((t) => t != null));
    if (distinctTiers.size <= 1) continue; // already consistent — nothing to canonicalize

    const inst = institutionsById.get(instId) ?? null;
    const domain = inst?.registrable_domain ?? null;
    const ownRows = domain ? rows.filter((r) => hostEndsWithDomain(r.url, domain)) : [];

    if (ownRows.length === 0) {
      plans.push({
        status: "no_own_domain_rows",
        institution_id: instId,
        institution_name: inst?.name ?? null,
        tiers_present: [...distinctTiers],
        row_count: rows.length,
      });
      continue;
    }

    const ownTiers = new Set(ownRows.map((r) => r.base_tier).filter((t) => t != null));
    if (ownTiers.size > 1) {
      const own_domain_tier_counts = {};
      for (const r of ownRows) own_domain_tier_counts[r.base_tier] = (own_domain_tier_counts[r.base_tier] ?? 0) + 1;
      plans.push({ status: "tier_conflict_unresolved", institution_id: instId, institution_name: inst?.name ?? null, own_domain_tier_counts });
      continue;
    }

    const canonicalTier = [...ownTiers][0];
    const rowsToUpdate = rows
      .filter((r) => r.base_tier !== canonicalTier)
      .map((r) => ({
        source_id: r.id,
        old_base_tier: r.base_tier,
        new_base_tier: canonicalTier,
        also_effective_tier: r.effective_tier === r.base_tier,
      }));
    if (!rowsToUpdate.length) continue; // defensive — distinctTiers.size>1 already guarantees at least one
    plans.push({
      status: "canonicalize",
      institution_id: instId,
      institution_name: inst?.name ?? null,
      canonical_domain: domain,
      canonical_tier: canonicalTier,
      rows: rowsToUpdate,
    });
  }
  return plans;
}

// ── Part C: class-tier gap report + override ────────────────────────────────────────────────────────
// SKILL.md §3's class table: "Industry body / classification society" (T4) is the tier professional
// standards bodies share. A standards_body source registered worse than T4 is a class-tier gap.
export const STANDARDS_BODY_CLASS_TIER = 4;
const REPORT_STATUSES = new Set(["active", "provisional"]);

/**
 * PURE Part C REPORT planner. `sources`: [{ id, url, base_tier, status, source_role }]. Returns one entry
 * per host carrying at least one active/provisional standards_body source at base_tier > 4, sorted by
 * count descending. This function's output only ever reaches `summary.counts`, never a write — it names
 * the full gap (including hosts the class table still leaves ambiguous); `planClassTierOverride` below is
 * the (smaller) subset that actually writes.
 */
export function planRulingNeeded(sources) {
  const candidates = sources.filter(
    (s) => REPORT_STATUSES.has(s.status) && s.source_role === "standards_body" && s.base_tier != null && s.base_tier > STANDARDS_BODY_CLASS_TIER,
  );
  const byHost = new Map();
  for (const s of candidates) {
    const host = hostOf(s.url);
    if (!byHost.has(host)) byHost.set(host, []);
    byHost.get(host).push(s);
  }
  return [...byHost.entries()]
    .map(([host, rows]) => ({
      host,
      count: rows.length,
      tiers: rows.reduce((acc, r) => { acc[r.base_tier] = (acc[r.base_tier] ?? 0) + 1; return acc; }, {}),
      source_ids: rows.map((r) => r.id),
      class_table_line:
        "source-credibility-model SKILL.md §3: 'Industry body / classification society' (T4) is the tier " +
        "professional standards bodies share; ADR-002 — base_tier changes only via explicit operator " +
        "override, so raising this host is a ruling for the operator, never an auto-apply.",
    }))
    .sort((a, b) => b.count - a.count);
}

/**
 * PURE Part C class-tier OVERRIDE planner (operator ruling 2026-09-04: "you know how to classify, fix it
 * … T4"). `sources`: [{ id, url, base_tier, effective_tier, tier_override, status, source_role }]. A
 * SUBSET of what `planRulingNeeded` reports: same active/provisional + standards_body + worse-than-T4
 * filter, PLUS the host must now classify to EXACTLY the standards-body class tier under
 * `classTierForHost` (STANDARDS_BODY_ALLOW in host-authority.ts — the operator ruling itself, applied via
 * the SAME deterministic mechanism SC-13 already uses at registration, never a fresh guess here). A row
 * carrying `tier_override` is excluded (the sanctioned per-row exception, SKILL.md §3 — never touched, same
 * convention as Part B). A host the class table does NOT classify (still null) is left OUT — it stays in
 * `planRulingNeeded` only, genuinely awaiting the operator. Returns one entry per qualifying host, sorted
 * by row count descending:
 *   { host, rows: [{ source_id, old_base_tier, new_base_tier: 4, also_effective_tier }] }
 */
export function planClassTierOverride(sources) {
  const candidates = sources.filter(
    (s) =>
      REPORT_STATUSES.has(s.status) &&
      s.source_role === "standards_body" &&
      s.tier_override == null &&
      s.base_tier != null &&
      s.base_tier > STANDARDS_BODY_CLASS_TIER &&
      classTierForHost(hostOf(s.url)) === STANDARDS_BODY_CLASS_TIER,
  );
  const byHost = new Map();
  for (const s of candidates) {
    const host = hostOf(s.url);
    if (!byHost.has(host)) byHost.set(host, []);
    byHost.get(host).push(s);
  }
  return [...byHost.entries()]
    .map(([host, rows]) => ({
      host,
      rows: rows.map((r) => ({
        source_id: r.id,
        old_base_tier: r.base_tier,
        new_base_tier: STANDARDS_BODY_CLASS_TIER,
        also_effective_tier: r.effective_tier === r.base_tier,
      })),
    }))
    .sort((a, b) => b.rows.length - a.rows.length);
}

/**
 * @param {{ mode?: "dry"|"apply" }} opts
 * @param {{
 *   readInstitutions: Function, readSources: Function,
 *   reassignSourcesInstitution: Function, countSourcesForInstitution: Function, deleteInstitution: Function,
 *   guardedUpdateSourcesByIds: Function, readSourcesByIds: Function,
 * }} deps
 */
export async function main({ mode = "dry" } = {}, deps) {
  const apply = mode === "apply";
  const summary = { step: "institution-canonicalize", mode, counts: {}, applied: 0, read_back: {}, exitCode: 0 };

  const institutions = await deps.readInstitutions();
  const sources = await deps.readSources();
  const institutionsById = new Map(institutions.map((i) => [i.id, i]));

  // Part A
  const mergePlans = planMerges(institutions);
  const merges = mergePlans.filter((p) => p.status === "merge");
  const refused = mergePlans.filter((p) => p.status === "refused_multiple_matches");
  const skipped = mergePlans.filter((p) => p.status === "skipped_no_name_match");

  // Part B — planned against the MERGE-SIMULATED sources, so a mis-keyed row lands under its real
  // institution before tier canonicalization looks at it (the GLEC scenario: the S3 row moves to
  // smartfreightcentre.org's institution row FIRST, then is read as that institution's off-domain row).
  const simulatedSources = applyMergeSimulation(sources, mergePlans);
  const tierPlans = planTierCanonicalization(simulatedSources, institutionsById);
  const canonicalizations = tierPlans.filter((p) => p.status === "canonicalize");
  const conflicts = tierPlans.filter((p) => p.status === "tier_conflict_unresolved");
  const noOwnDomain = tierPlans.filter((p) => p.status === "no_own_domain_rows");

  // Part C — the report is always computed, never behind the apply gate; the class-tier override PLAN is
  // also always computed (dry lists it), but only WRITES in apply mode (below).
  const rulingNeeded = planRulingNeeded(sources);
  const classOverride = planClassTierOverride(sources);

  summary.counts = {
    part_a_merge: {
      merge: merges.length,
      refused_multiple_matches: refused.length,
      skipped_no_name_match: skipped.length,
      plan: mergePlans,
    },
    part_b_tier: {
      canonicalize: canonicalizations.length,
      tier_conflict_unresolved: conflicts.length,
      no_own_domain_rows: noOwnDomain.length,
      plan: tierPlans,
    },
    part_c_ruling_needed: rulingNeeded,
    part_c_class_override: {
      hosts: classOverride.length,
      rows: classOverride.reduce((n, p) => n + p.rows.length, 0),
      plan: classOverride,
    },
  };

  if (!apply) return summary;

  // ── Part A apply ──────────────────────────────────────────────────────────────────────────────────
  let sourcesMoved = 0;
  const mergeResults = [];
  for (const p of merges) {
    const moveRes = await deps.reassignSourcesInstitution(p.duplicate_id, p.canonical_id);
    sourcesMoved += moveRes.updated ?? 0;
    const remaining = await deps.countSourcesForInstitution(p.duplicate_id);
    if (remaining > 0) {
      // Only `sources.institution_id` references `institutions` in this repo today (checked against
      // every migration) — this branch is the defensive future-proof, not the expected path.
      mergeResults.push({
        ...p,
        sources_moved: moveRes.updated ?? 0,
        deleted: false,
        refused_reason: `${remaining} row(s) still reference the duplicate institution after repoint — refusing to delete`,
      });
      continue;
    }
    await deps.deleteInstitution(p.duplicate_id);
    mergeResults.push({ ...p, sources_moved: moveRes.updated ?? 0, deleted: true });
  }
  summary.counts.part_a_merge.applied = mergeResults;
  summary.applied += sourcesMoved;

  // ── Part B apply ──────────────────────────────────────────────────────────────────────────────────
  // Grouped per (old_base_tier, also_effective_tier) within each institution's plan so a single guarded
  // write carries one patch shape and one applyMatch re-check (still-at-old-tier guard — a row someone
  // else changed between the read and the write is left alone, same convention as origin-class-backfill).
  let tierRowsUpdated = 0;
  const tierWrites = [];
  for (const plan of canonicalizations) {
    const groups = new Map();
    for (const r of plan.rows) {
      const key = `${r.old_base_tier}|${r.also_effective_tier}`;
      if (!groups.has(key)) groups.set(key, { old: r.old_base_tier, alsoEffective: r.also_effective_tier, ids: [] });
      groups.get(key).ids.push(r.source_id);
    }
    for (const g of groups.values()) {
      const patch = g.alsoEffective ? { base_tier: plan.canonical_tier, effective_tier: plan.canonical_tier } : { base_tier: plan.canonical_tier };
      const res = await deps.guardedUpdateSourcesByIds(g.ids, patch, {
        applyMatch: (q) => {
          const withBase = q.eq("base_tier", g.old);
          return g.alsoEffective ? withBase.eq("effective_tier", g.old) : withBase;
        },
      });
      tierRowsUpdated += res.updated ?? 0;
      tierWrites.push({
        institution_id: plan.institution_id,
        canonical_tier: plan.canonical_tier,
        old_base_tier: g.old,
        also_effective_tier: g.alsoEffective,
        attempted: g.ids.length,
        updated: res.updated ?? 0,
      });
    }
  }
  summary.counts.part_b_tier.applied = tierWrites;
  summary.applied += tierRowsUpdated;

  // ── Part C apply — class-tier override (operator ruling 2026-09-04) ────────────────────────────────
  // Same grouping/guard convention as Part B: one guarded write per (old_base_tier, also_effective_tier)
  // group, applyMatch re-checks the row is still at the tier this plan read (a row someone else changed
  // between read and write is left alone). Every write target is host-classified to EXACTLY the
  // standards-body class tier (planClassTierOverride's own filter) — never a host the class table leaves
  // ambiguous, never a tier_override row.
  let classOverrideRowsUpdated = 0;
  const classOverrideWrites = [];
  for (const plan of classOverride) {
    const groups = new Map();
    for (const r of plan.rows) {
      const key = `${r.old_base_tier}|${r.also_effective_tier}`;
      if (!groups.has(key)) groups.set(key, { old: r.old_base_tier, alsoEffective: r.also_effective_tier, ids: [] });
      groups.get(key).ids.push(r.source_id);
    }
    for (const g of groups.values()) {
      const patch = g.alsoEffective
        ? { base_tier: STANDARDS_BODY_CLASS_TIER, effective_tier: STANDARDS_BODY_CLASS_TIER }
        : { base_tier: STANDARDS_BODY_CLASS_TIER };
      const res = await deps.guardedUpdateSourcesByIds(g.ids, patch, {
        applyMatch: (q) => {
          const withBase = q.eq("base_tier", g.old);
          return g.alsoEffective ? withBase.eq("effective_tier", g.old) : withBase;
        },
      });
      classOverrideRowsUpdated += res.updated ?? 0;
      classOverrideWrites.push({
        host: plan.host,
        old_base_tier: g.old,
        new_base_tier: STANDARDS_BODY_CLASS_TIER,
        also_effective_tier: g.alsoEffective,
        attempted: g.ids.length,
        updated: res.updated ?? 0,
      });
    }
  }
  summary.counts.part_c_class_override.applied = classOverrideWrites;
  summary.applied += classOverrideRowsUpdated;

  // ── read_back ─────────────────────────────────────────────────────────────────────────────────────
  const institutionsAfter = await deps.readInstitutions();
  const affectedSourceIds = [
    ...new Set([
      ...canonicalizations.flatMap((p) => p.rows.map((r) => r.source_id)),
      ...classOverride.flatMap((p) => p.rows.map((r) => r.source_id)),
    ]),
  ];
  const sourcesAfter = affectedSourceIds.length ? await deps.readSourcesByIds(affectedSourceIds) : [];
  summary.read_back = {
    institutions_total: institutionsAfter.length,
    merged_duplicate_ids_still_present: merges
      .filter((p) => institutionsAfter.some((i) => i.id === p.duplicate_id))
      .map((p) => p.duplicate_id),
    tier_rows_after: sourcesAfter.map((s) => ({ id: s.id, base_tier: s.base_tier, effective_tier: s.effective_tier })),
  };

  return summary;
}

const IS_MAIN = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (IS_MAIN) {
  await runCli({
    step: "institution-canonicalize",
    main,
    needsDb: true,
    buildDeps: async () => {
      const { readAll, guardedUpdate, guardedUpdateByIds, guardedDelete } = await import("../lib/db.mjs");
      const SOURCE_COLUMNS = "id, url, base_tier, effective_tier, tier_override, institution_id, status, source_role";
      return {
        readInstitutions: () => readAll("institutions", "id, name, registrable_domain"),
        readSources: () => readAll("sources", SOURCE_COLUMNS),
        readSourcesByIds: (ids) => readAll("sources", "id, base_tier, effective_tier", { match: (q) => q.in("id", ids) }),
        reassignSourcesInstitution: (duplicateId, canonicalId) =>
          guardedUpdate("sources", (q) => q.eq("institution_id", duplicateId), { institution_id: canonicalId }, { cite: CITE, select: "id" }),
        countSourcesForInstitution: async (institutionId) => {
          const rows = await readAll("sources", "id", { match: (q) => q.eq("institution_id", institutionId) });
          return rows.length;
        },
        deleteInstitution: (id) => guardedDelete("institutions", [id], { cite: CITE }),
        guardedUpdateSourcesByIds: (ids, patch, { applyMatch }) =>
          guardedUpdateByIds("sources", ids, patch, { cite: CITE, applyMatch, select: "id" }),
      };
    },
  });
}
