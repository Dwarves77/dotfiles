// @ts-check
// FREE-PASS RE-ATTRIBUTION DECISION (pure core) — economy-of-information doctrine, operator ruling 2026-07-13
// + the free-pass re-attribution CONSTRAINT (2026-07-13). The $0 pass may re-attribute a failing FACT span to
// a stored capture ONLY when ALL THREE hold — anything short is NOT free-flippable and exits to the facts-only
// manifest, even if the string matches (a matched span in a non-authoritative page is the fake-cert the moat
// exists for):
//
//   (1) VERBATIM + TIER (reuses floor-attribution.mjs): the span is verbatim-present in the candidate's stored
//       capture, the span is >= MIN_REATTRIB_SPAN, and re-attribution only fires when the current attribution
//       is BELOW the floor / unresolved (a span already at floor keeps its honest attribution).
//   (2) PRIMARY-INSTRUMENT CLASS (reuses officialness.mjs): officialnessOf(...).path === 'a' — the capture is
//       the enacted/official instrument body past the nav at a floor-qualifying tier, NOT portal / consultation
//       / summary furniture (path 'b' is never a floor re-home target).
//   (3) ERROR-BODY PARTITION (reuses entity-gate.mjs): the capture is NOT an error body (bot wall / 403 / 404 /
//       nav shell) — no re-attribution into any capture the gate excluded or would exclude.
//
// PURE (no I/O, no fetch, no model, no clock) so the property is red-then-green under node --test. The SC-13
// codified host tier and the item authority floor are INJECTED by the runner (a pure .mjs must not import a
// relative .ts — officialness.mjs §caveat); this core is a pure function of its inputs.

import { MIN_REATTRIB_SPAN, floorSources } from "../../src/lib/agent/floor-attribution.mjs";
import { officialnessOf } from "../../src/lib/sources/officialness.mjs";
import { isErrorBody } from "../../src/lib/sources/entity-gate.mjs";

export { MIN_REATTRIB_SPAN };

/**
 * @typedef {{ sourceId?: string|null, url?: string, host: string, hostTier: number|null, body: string }} Capture
 * A stored capture the item already holds (a registered floor-tier source's raw_fetches body, or a pool row).
 * `body` is the stored content (snapshot body or pool excerpt); `host` + `hostTier` are the source's identity.
 */

/**
 * Decide whether a failing FACT span may be re-attributed FREE (all three gates). PURE.
 * @param {string|null|undefined} span         the FACT source_span currently failing the floor
 * @param {number|null} currentTier            tier of the extractor-chosen source (null = unregistered host)
 * @param {Capture[]} candidates               stored captures the item holds
 * @param {number|null} floorTier              the item's authority floor (authorityFloorFor(item_type))
 * @returns {{ accept: boolean, target: Capture|null, tier: number|null, reason: string }}
 */
export function freeReattributeDecision(span, currentTier, candidates, floorTier) {
  if (floorTier == null) return { accept: false, target: null, tier: null, reason: "exempt_item_type" };
  if (currentTier != null && currentTier <= floorTier) return { accept: false, target: null, tier: null, reason: "already_at_floor" };
  const needle = String(span ?? "").trim();
  if (needle.length < MIN_REATTRIB_SPAN) return { accept: false, target: null, tier: null, reason: "span_too_short" };
  const lower = needle.toLowerCase();

  // Floor-qualifying candidates, best-tier-first (reuse floorSources' ordering contract).
  const ordered = floorSources(
    (candidates ?? []).map((c) => ({ ...c, tier: c.hostTier, text: c.body })),
    floorTier,
  );

  for (const c of ordered) {
    const body = String(c.body ?? "");
    // (3) error-body partition — a capture the gate excluded / would exclude is never a re-home target.
    if (isErrorBody(body)) continue;
    // (1) verbatim presence in the stored capture.
    if (!body.toLowerCase().includes(lower)) continue;
    // (2) primary-instrument class — path 'a' only (portal/consultation/summary furniture = path 'b' = reject).
    const off = officialnessOf(body, c.host, { hostTier: c.hostTier, floorTier });
    if (off.path !== "a") continue;
    return { accept: true, target: c, tier: c.hostTier, reason: `primary_instrument path=a host=${c.host} tier=${c.hostTier}` };
  }
  return { accept: false, target: null, tier: null, reason: "no_floor_qualifying_primary_capture" };
}
