// uncertainty.mjs - the one documented uncertainty band for an estimated figure's inputs.
//
// PURE, ZERO DEPENDENCIES. `UNCERTAINTY_PCT = 0.10` (+/-10%) is an EXPLICIT, DOCUMENTED convention, not a
// statistically fitted confidence interval: the generic "a published series moved since it was published"
// margin, nowhere else more precisely quantified in the corpus. ADR-024 decision 2 (ESTIMATE_DISPLAY =
// "range") means a figure built on such an input renders low, point and high, never a bare point.
// Moved here from the retired Operations calculator library (ADR-043) so the one kept consumer,
// src/lib/market/carbon-cost-per-feu.mjs, no longer imports a retired module.

export const UNCERTAINTY_PCT = 0.10;
