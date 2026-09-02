// types.contractable-barrier.check.ts — the compiled PROOF of spec §4 Layer 2's type barrier. Lane
// DP-SURF, system-completion train, 2026-09-02.
//
// NOT a node:test file — nothing here is executed; its only job is to be included in `tsc --noEmit`
// (tsconfig.json's `include: ["**/*.ts", ...]` picks up every .ts file under the repo, this one included,
// with no test-file exclusion). A `// @ts-expect-error` comment makes `tsc` FAIL if the FOLLOWING line does
// NOT produce a type error, and SUPPRESS the diagnostic if it does — so this file's presence alone is the
// gate: if a future edit ever widens `Contractable` (propagation/types.ts) to admit "modelled" or loosens
// `StatutoryInput`/`computeStatutory`'s parameter type, the `@ts-expect-error` below stops reporting an
// error where one is expected, `tsc --noEmit` fails, and CI catches the regression at compile time — the
// exact mechanism the task brief asks for ("test this with a `// @ts-expect-error` case").
//
// Both calls below are otherwise IDENTICAL except for one field's `derivation` literal, so the only thing
// under test is the barrier itself, not some unrelated shape mismatch.

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
