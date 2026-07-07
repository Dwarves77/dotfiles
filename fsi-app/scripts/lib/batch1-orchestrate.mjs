// @ts-check
// BATCH-1 ORCHESTRATION CORE (one-time hold-lift re-collection of the retrieval-class items; RD-14 +
// Earth-Exhaustion). PURE + DEP-INJECTED: no fetch, no db write, no spend happens here — every side-effecting
// step (seek-more fetch, pool persist, ground, validate, exhaustion persist, spend ticket) is an INJECTED
// function, so the candidate→fetch→classify DECISION logic is red-then-green node-testable with fakes and the
// scrape hold is honored by construction. The executable wiring (live transports, groundBrief, spend client,
// Supabase) lives in scripts/batch1-runner.mjs, which imports these pure functions and injects the LIVE deps.
//
// WHY A NEW ORCHESTRATOR (not an extension of funded-pass): funded-pass.mjs is GROUND-ONLY — it deletes
// BROWSERLESS_API_KEY and REFUSES to run while it is set, so it structurally cannot fetch. Batch-1 FETCHES
// (seek-more → the live ladder) before grounding, so it is a distinct runner. It REUSES funded-pass's spend
// scaffolding verbatim (seed program total, the 4 stop-layers, ticket/ledger discipline, DRY-RUN default) and
// REUSES the built fetch front-half (generateCandidates + runSeekMore + escalateFetch + captureForStorage +
// the exhaustion-record flag pattern) and the built ground back-half (groundBrief over the now-updated pool).
// GOVERNING: remediation-discipline (category 13 / RD-14 — transport failure is never terminal), source-
// credibility-model (the moat qualifies only content that grounds), analysis-construction-spec (retrieval fix).

// ── BATCH SELECTION (mirrors scripts/_diag/_batch1-flip-projection.mjs — the SoT for the split) ──────────────
// Non-reg floored types: a below-floor FACT on these is resolver-excluded (a higher-tier source for that finding
// likely does not exist) → STRUCTURAL, not retrieval-flippable.
export const NONREG_FLOORED = new Set(["research_finding", "technology", "tool"]);

/**
 * Classify a non-verified item as RETRIEVAL-flippable (a new/better source via seek-more/re-fetch can cover the
 * slot → batch-1) vs STRUCTURAL-hold (retrieval alone cannot cure it: below-floor on a non-reg floored type, or
 * a relabel-only hold — those route to the 4c-relabel lever / a named event, not a paid fetch). PURE.
 * @param {{ reasons: string[], itemType: string }} arg
 * @returns {"retrieval" | "structural"}
 */
export function selectBatchClass({ reasons, itemType }) {
  const rs = [...new Set(reasons || [])];
  const belowFloor = rs.includes("fact_below_authority_floor");
  const missingSlot = rs.includes("missing_required_slot");
  const onlyRelabel = rs.length > 0 && rs.every((x) => x === "unlabeled_assertion" || x === "analysis_missing_label_syntax");
  const isStructural = (belowFloor && NONREG_FLOORED.has(itemType) && !missingSlot) || onlyRelabel;
  return isStructural ? "structural" : "retrieval";
}

/** True when an item belongs in the batch-1 (retrieval) set. @param {{reasons:string[], itemType:string, valid:boolean}} it */
export function isBatch1Item(it) {
  return !it.valid && selectBatchClass({ reasons: it.reasons, itemType: it.itemType }) === "retrieval";
}

// ── OUTCOME CLASSIFICATION ──────────────────────────────────────────────────────────────────────────────────
/**
 * Classify the per-item outcome from the seek-more result + the post-ground validity. PURE.
 *  - no content captured (block/404 exhaustion) → NO_REACHABLE_SOURCE (hold, event-bound; exhaustion record is
 *    the durable proof of exhaustion).
 *  - content captured + item now valid → FLIPPED (verified).
 *  - content captured but still invalid → HELD (honest: a source was reached but it did not satisfy the
 *    floor/slots — quarantine stays, not papered over).
 * @param {{ outcome: string, hasCaptured: boolean }} seek
 * @param {boolean} afterValid
 * @returns {"FLIPPED" | "HELD" | "NO_REACHABLE_SOURCE"}
 */
export function classifyOutcome(seek, afterValid) {
  if (seek.outcome !== "content" || !seek.hasCaptured) return "NO_REACHABLE_SOURCE";
  return afterValid ? "FLIPPED" : "HELD";
}

/**
 * The per-item batch-1 pipeline, PURE given its injected deps. Sequence:
 *   validate(before) → [skip if already verified] → setTicket → seekMore (fetch via the live ladder) →
 *   if content: persistCaptured (write the new source into the pool) + ground + validate(after) →
 *   persistExhaustion (always — the durable record) → classify.
 * NO fetch / db / spend here; each is an injected function. Returns the per-item result row.
 *
 * @param {{ id:string, key:string, title?:string, identifier?:string, jurisdiction?:string, source_url?:string,
 *           itemType?:string, priority?:string, provenanceStatus?:string }} item
 * @param {{
 *   validate: (itemId:string) => Promise<{ valid:boolean, reasons:string[] }>,
 *   setTicket: (item:object, before:{reasons:string[]}) => void,
 *   seekMore: (item:object) => Promise<{ captured:{url?:string,text:string}|null, exhaustionRecord:Array<object>,
 *              outcome:string, holdReason:string|null, candidates:string[] }>,
 *   persistCaptured: (itemId:string, captured:{url?:string,text:string}) => Promise<void>|void,
 *   ground: (itemId:string) => Promise<{ ok:boolean, detail?:any, slotForcing?:any }>,
 *   persistExhaustion: (itemId:string, record:Array<object>, verdict:{outcome:string,holdReason:string|null}) => Promise<void>|void,
 *   itemCost: () => number,
 *   breakerTripped: (cost:number) => { tripped:boolean, reason:string },
 * }} deps
 * @returns {Promise<object>}
 */
export async function processItem(item, deps) {
  const before = await deps.validate(item.id);
  if (before.valid) {
    return { key: item.key, id: item.id, outcome: "ALREADY_VERIFIED", valid: true, cost: 0, skipped: "already-verified" };
  }

  deps.setTicket(item, before);
  const seek = await deps.seekMore(item);
  const hasCaptured = !!(seek.captured && seek.captured.text);

  // Persist the exhaustion record on EVERY item (proven-exhaustion doctrine — the durable artifact that lets a
  // hold/keep call be honest). Even a content success records the (candidate × transport) attempts that led to it.
  await deps.persistExhaustion(item.id, seek.exhaustionRecord || [], { outcome: seek.outcome, holdReason: seek.holdReason ?? null });

  if (!hasCaptured) {
    return {
      key: item.key, id: item.id, outcome: "NO_REACHABLE_SOURCE", valid: false,
      holdReason: seek.holdReason ?? "NO_REACHABLE_SOURCE", candidates: seek.candidates,
      attempts: (seek.exhaustionRecord || []).length, cost: deps.itemCost(),
    };
  }

  // A new/better source was reached — write it into the item's pool, then re-ground over the updated pool.
  await deps.persistCaptured(item.id, seek.captured);
  const g = await deps.ground(item.id);
  const after = await deps.validate(item.id);
  const cost = deps.itemCost();
  const breaker = deps.breakerTripped(cost);
  const outcome = classifyOutcome({ outcome: seek.outcome, hasCaptured }, after.valid);
  return {
    key: item.key, id: item.id, outcome, valid: after.valid,
    before: before.reasons, after: after.reasons,
    capturedUrl: seek.captured.url ?? null, candidates: seek.candidates,
    attempts: (seek.exhaustionRecord || []).length, slotForcing: g.slotForcing ?? null,
    cost, breakerTripped: breaker.tripped,
  };
}

// ── ENVELOPE ESTIMATE ───────────────────────────────────────────────────────────────────────────────────────
/**
 * Per-item spend estimate (PURE; the $ model fn + slot count are injected so this stays TS/config-free). Mirrors
 * funded-pass's restated estimate (a Sonnet ground call over the pool + slots×K Haiku judge) and adds the
 * batch-1-specific candidate web_search head (one Sonnet search, only when the deterministic resolvers miss) +
 * a Browserless-unit estimate for the fetch.
 * @param {{ poolChars:number, nSlots:number, hasDeterministicCandidate:boolean }} item
 * @param {{ K:number, costUsdForModel:(model:string,inTok:number,outTok:number)=>number, browserlessUnitsPerFetch?:number }} cfg
 * @returns {{ groundUsd:number, judgeUsd:number, searchUsd:number, usd:number, browserlessUnits:number }}
 */
export function estimateItemEnvelope(item, cfg) {
  const { K, costUsdForModel, browserlessUnitsPerFetch = 3 } = cfg;
  const poolChars = Math.min(560000, Math.max(0, item.poolChars || 0));
  const groundUsd = costUsdForModel("claude-sonnet-4-6", Math.round(poolChars / 4), 8000);
  const judgeUsd = costUsdForModel("claude-haiku-4-5", (item.nSlots || 0) * K * 300, (item.nSlots || 0) * K * 40);
  // Candidate web_search fires ONLY when no deterministic (CELEX/ELI/UK-SI/lovdata/gazette/API) candidate exists.
  const searchUsd = item.hasDeterministicCandidate ? 0 : costUsdForModel("claude-sonnet-4-6", 1200, 400);
  return {
    groundUsd, judgeUsd, searchUsd, usd: groundUsd + judgeUsd + searchUsd,
    browserlessUnits: browserlessUnitsPerFetch,
  };
}
