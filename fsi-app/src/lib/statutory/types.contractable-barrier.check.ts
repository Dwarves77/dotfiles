import { computeStatutory } from "./types.ts";

const asOf = { eventDate: "2026-01-01" };

// ── GOOD: every input's derivation is Contractable — this MUST type-check with no error. ────────────────
computeStatutory("fueleu_annex_iv_penalty", {
  ghgIntensityTarget: { derivation: "observed", value: 89.34, unit: "gCO2eq/MJ", citation: "Annex I", asOf },
  ghgIntensityActual: { derivation: "observed", value: 95.0, unit: "gCO2eq/MJ", citation: "reader-reported", asOf },
  energyUsed: { derivation: "observed", value: 1_000_000, unit: "MJ", citation: "reader-reported", asOf },
  consecutiveYears: { derivation: "observed", value: 1, unit: "count", citation: "reader-reported", asOf },
});

// ── BAD: ghgIntensityActual's derivation is "modelled" — a NonContractable value. Spec §4 Layer 2:
// "Accepts ONLY contractable inputs. Passing a modelled value does not type-check." This line MUST fail to
// type-check, or the @ts-expect-error above it makes tsc itself fail (the safety property this file exists
// to prove). ──────────────────────────────────────────────────────────────────────────────────────────
computeStatutory("fueleu_annex_iv_penalty", {
  ghgIntensityTarget: { derivation: "observed", value: 89.34, unit: "gCO2eq/MJ", citation: "Annex I", asOf },
  // @ts-expect-error — a NonContractable ("modelled") derivation must be rejected at compile time (spec §4 Layer 2).
  ghgIntensityActual: { derivation: "modelled", value: 95.0, unit: "gCO2eq/MJ", citation: "our estimate", asOf },
  energyUsed: { derivation: "observed", value: 1_000_000, unit: "MJ", citation: "reader-reported", asOf },
  consecutiveYears: { derivation: "observed", value: 1, unit: "count", citation: "reader-reported", asOf },
});

export {}; // keep this a module, not a global script
