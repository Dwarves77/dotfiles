// decay.mjs — time-decay on contributed evidence (spec 05 §4, required component 7). PURE.
//
// "Gartner halves review weight every 12 months (100% at 0-12 months, 50% at 12-24, 25% at 24-36). This
// transfers directly. A corroborated 2024 SAF premium is not evidence about 2026." (spec 05 §4).
// Beyond 36 months the weight keeps halving on the same 12-month cadence rather than floor-ing at 25% or
// falling to zero — an old age is a fact, not an error, and a hard floor/cliff would either overstate an
// ancient data point's relevance (floor) or discard it as if it never existed (cliff) instead of just
// letting it fade, which is what "decay" means.

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DAYS_PER_YEAR = 365.25;

/** Full elapsed calendar months from `from` to `to` — same age-difference algorithm as antitrust.mjs's
 * threeMonthLag, kept local (single-purpose, two lines) rather than shared to avoid a cross-module
 * dependency for one helper both already state their own reasoning for. */
function monthsBetween(from, to) {
  let months = (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth());
  if (to.getUTCDate() < from.getUTCDate()) months -= 1;
  return Math.max(0, months);
}

/**
 * Age, decayed weight, and a display chip for one piece of contributed evidence.
 *
 * @param {{ assertedAt: string|Date }} evidence - the evidence's own asserted/observed date
 * @param {Date} [now]
 * @returns {{ ageDays: number, ageMonths: number, weight: number, chip: string }}
 */
export function evidenceAge(evidence, now = new Date()) {
  const assertedAtRaw = evidence?.assertedAt ?? null;
  const assertedAt = assertedAtRaw instanceof Date ? assertedAtRaw : new Date(assertedAtRaw);
  if (!assertedAtRaw || Number.isNaN(assertedAt.getTime())) {
    return { ageDays: 0, ageMonths: 0, weight: 0, chip: "date unknown" };
  }

  const ageDays = Math.max(0, Math.floor((now.getTime() - assertedAt.getTime()) / MS_PER_DAY));
  const ageMonths = monthsBetween(assertedAt, now);

  // One halving per full 12-month period elapsed: 100% for [0,12), 50% for [12,24), 25% for [24,36), ...
  const periodsElapsed = Math.floor(ageMonths / 12);
  const weight = Math.pow(0.5, periodsElapsed);

  const ageYears = ageDays / DAYS_PER_YEAR;
  let chip;
  if (ageDays < 30) {
    chip = "this month";
  } else if (ageMonths < 12) {
    chip = `${ageMonths} mo old · ${Math.round(weight * 100)}% weight`;
  } else {
    const years = Math.round(ageYears * 10) / 10;
    chip = `${years}y old · ${Math.round(weight * 100)}% weight`;
  }

  return { ageDays, ageMonths, weight, chip };
}
