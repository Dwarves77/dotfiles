// market-carbon-overlay-composition.test.mjs — the F27-shaped seam proof for WO-24's re-scoped carbon
// overlay (2026-08-30). See docs/plans/unblocking-the-five-2026-08-30.md §2 and
// src/lib/market/select-modal-factor.mjs's own header for the ruling this composition implements.
//
// WHY THIS EXISTS. select-modal-factor.mjs (pure jurisdiction+mode selection) and
// carbon-overlay-view.mjs (the pure view-model that is the ONLY caller DriversTab's carbon-overlay slot
// invokes) each have their own unit coverage — select-modal-factor.test.mjs proves the selector in
// isolation, and carbon-overlay-view.mjs's exported function is exercised inline above. Neither of those
// proves the SEAM: that real selectModalFactor output flows into buildCarbonOverlayView unchanged, and
// that the composed result satisfies what the rendering surface actually needs (a `state` DriversTab can
// switch on, a `figure` that is populated if and ONLY IF state is "resolved", specific non-generic copy
// per state). That is exactly the defect class F27 exists to catch (see F27-producer-seam-proof.mjs's own
// header: two isolated proofs, the untested join between them is where a NULL column / a wrong composed
// value hides) — this file is that proof, importing both modules together, same shape as
// market-producer-composition.test.mjs (parser -> planner).
//
// NOTE ON F27's LITERAL SCOPE (recorded honestly, not silently worked around — see this session's
// Addendum in docs/ops/session-log.md for the full finding). F27-producer-seam-proof.mjs's
// `isProducerEntryPoint()` only recognises files under `scripts/producers/**` carrying a
// `#!/usr/bin/env node` shebang as "producer entry points" needing a composition proof; its
// `collectProducers()` never scans `src/components/**` or `src/lib/market/select-modal-factor.mjs`'s
// actual consumer (MarketSignalDetailSurface.tsx, a .tsx React component, which is outside F27's glob
// entirely). So F27 as currently coded does NOT gate this seam and will not go red if this proof is
// deleted. This file exists because the WO-24 brief explicitly calls for a real composition proof
// regardless — "the fix is a real proof, never an exemption" — and because it is simply good practice for
// exactly the reason F27 itself documents. It is written to F27's own candidate-proof glob
// (`fsi-app/src/__tests__/**/*.test.mjs`) and would be picked up automatically if F27's scope is ever
// broadened to cover component consumers, not just producer scripts.
//
// $0: pure, in-process, no database, no network, no React/DOM.

import { test } from "node:test";
import assert from "node:assert/strict";
import { selectModalFactor } from "../lib/market/select-modal-factor.mjs";
import { buildCarbonOverlayView } from "../lib/market/carbon-overlay-view.mjs";

// The two LIVE emission_factors rows, 2026-08-30 — the exact shape the server-side fetch in
// src/app/market/[slug]/page.tsx selects (see EmissionFactorRow in MarketSignalDetailSurface.tsx).
const LIVE_FACTORS = [
  {
    factor_id: "f-road-us",
    tier: "modal_default",
    scope_kind: "modal",
    mode: "road",
    vehicle_class: "medium_heavy_duty_truck",
    jurisdiction: "US",
    quantity_basis: "tonne_km",
    ttw_co2e: 0.128411,
    wtt_co2e: null,
    wtw_co2e: null,
    source_key: "epa_egrid",
  },
  {
    factor_id: "f-rail-us",
    tier: "modal_default",
    scope_kind: "modal",
    mode: "rail",
    vehicle_class: "freight_rail_average",
    jurisdiction: "US",
    quantity_basis: "tonne_km",
    ttw_co2e: 0.014505,
    wtt_co2e: null,
    wtw_co2e: null,
    source_key: "epa_egrid",
  },
];

test("composition: selectModalFactor's resolved output flows unchanged into buildCarbonOverlayView's figure", () => {
  const raw = selectModalFactor({ jurisdictionIso: ["US"], factors: LIVE_FACTORS, mode: "road" });
  assert.equal(raw.state, "resolved");

  const view = buildCarbonOverlayView({ jurisdictionIso: ["US"], factors: LIVE_FACTORS, mode: "road" });
  assert.equal(view.state, "resolved");
  // The figure must be built from the SAME factor object selectModalFactor chose, not re-derived.
  assert.equal(view.figure.value, raw.factor.ttw_co2e);
  assert.equal(view.figure.jurisdiction, raw.factor.jurisdiction);
  assert.equal(view.figure.mode, raw.factor.mode);
  assert.equal(view.figure.sourceKey, raw.factor.source_key);
  // "national modal default, not corridor-specific" must actually be said, not just implied.
  assert.match(view.body, /national/i);
  assert.match(view.body, /not.*corridor/i);
});

test("composition: THE ambiguous-wins-over-partial-match case survives end to end into the view — never a number", () => {
  // ["CN","IR","SG","US"] — US alone has a live factor. The selector must refuse to pick it, and that
  // refusal must survive into the composed view: no figure, ever.
  const jurisdictionIso = ["CN", "IR", "SG", "US"];
  const raw = selectModalFactor({ jurisdictionIso, factors: LIVE_FACTORS, mode: "road" });
  assert.equal(raw.state, "ambiguous");

  const view = buildCarbonOverlayView({ jurisdictionIso, factors: LIVE_FACTORS, mode: "road" });
  assert.equal(view.state, "ambiguous");
  assert.equal(view.figure, null, "an ambiguous composed view must never carry a figure");
  // The copy must name why, and must name the actual jurisdictions — not a generic "not available".
  assert.match(view.body, /CN, IR, SG, US/);
  assert.match(view.body, /multiple/i);
});

test("composition: no_factor (SG, no row) survives end to end — never a number, and the copy is specific to SG", () => {
  const view = buildCarbonOverlayView({ jurisdictionIso: ["SG"], factors: LIVE_FACTORS });
  assert.equal(view.state, "no_factor");
  assert.equal(view.figure, null);
  assert.match(view.body, /SG/);
});

test("composition: GLOBAL survives end to end as no_factor even though US factors exist — GLOBAL never resolves", () => {
  const view = buildCarbonOverlayView({ jurisdictionIso: ["GLOBAL"], factors: LIVE_FACTORS, mode: "road" });
  assert.equal(view.state, "no_factor");
  assert.equal(view.figure, null);
});

test("composition: US with no mode given (both road+rail candidates) survives as no_factor, not an arbitrary pick", () => {
  const raw = selectModalFactor({ jurisdictionIso: ["US"], factors: LIVE_FACTORS });
  assert.equal(raw.state, "no_factor");
  assert.equal(raw.reason, "no_mode_basis");

  const view = buildCarbonOverlayView({ jurisdictionIso: ["US"], factors: LIVE_FACTORS });
  assert.equal(view.state, "no_factor");
  assert.equal(view.figure, null);
  assert.match(view.body, /more than one/i);
});

test("composition: every state's `figure` is populated if and only if `state === \"resolved\"` — the one place a fabricated number could leak", () => {
  const cases = [
    { jurisdictionIso: ["US"], mode: "road" },
    { jurisdictionIso: ["US"], mode: "rail" },
    { jurisdictionIso: ["US"] },
    { jurisdictionIso: [] },
    { jurisdictionIso: ["GLOBAL"] },
    { jurisdictionIso: ["SG"] },
    { jurisdictionIso: ["CN", "IR", "SG", "US"] },
  ];
  for (const c of cases) {
    const view = buildCarbonOverlayView({ ...c, factors: LIVE_FACTORS });
    if (view.state === "resolved") {
      assert.notEqual(view.figure, null, `resolved case ${JSON.stringify(c)} must carry a figure`);
    } else {
      assert.equal(view.figure, null, `non-resolved state "${view.state}" for ${JSON.stringify(c)} must never carry a figure`);
    }
  }
});
