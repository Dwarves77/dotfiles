import { ORG_SIZE_DIMENSIONS, findBand } from "../profile/profile-contract.mjs";

/** Evaluate the role-scope gate. Returns one of 'pass' | 'fail' | 'needs_input'. */
function evaluateRoleScope(roleScope, orgRoles) {
  if (!Array.isArray(roleScope) || roleScope.length === 0) return "pass"; // no role scope named = applies to every role
  if (!Array.isArray(orgRoles) || orgRoles.length === 0) return "needs_input";
  const matched = roleScope.some((r) => orgRoles.includes(r));
  return matched ? "pass" : "fail";
}

/** Evaluate the size-threshold gate. Returns { result: 'pass'|'fail'|'needs_input', reason?: string }. */
function evaluateSizeThreshold(sizeThreshold, orgSize) {
  if (!sizeThreshold) return { result: "pass" };
  const { dimension, band: thresholdBandId, comparison } = sizeThreshold;
  const dim = ORG_SIZE_DIMENSIONS[dimension];
  if (!dim) return { result: "pass" }; // an obligation naming an unknown dimension cannot gate anything; fail open on the gate itself, not on the org
  const thresholdBand = findBand(dimension, thresholdBandId);
  if (!thresholdBand) return { result: "pass" };

  const profileBandId = orgSize?.[`${dimension}_band`];
  if (!profileBandId) return { result: "needs_input", dimension };
  const profileBand = findBand(dimension, profileBandId);
  if (!profileBand) return { result: "needs_input", dimension };

  const passes =
    comparison === "below" ? profileBand.rank < thresholdBand.rank : profileBand.rank >= thresholdBand.rank;
  return {
    result: passes ? "pass" : "fail",
    dimension,
    reason: `${dim.label}: your organisation is "${profileBand.label}", threshold is ${
      comparison === "below" ? "below" : "at least"
    } "${thresholdBand.label}"`,
  };
}

/**
 * computeApplicability(obligation, profile) -> { status, reasons, missingDimensions }
 *
 * Multi-role orgs: an org with several roles applies if ANY of its roles is in the obligation's
 * roleScope (roleScope is "applies to these roles", not "applies only if every one of these roles").
 *
 * Missing dimensions are collected across BOTH gates before returning needs_profile_input, so a
 * caller sees every dimension it needs the reader to fill in, not just the first one hit.
 */
export function computeApplicability(obligation = {}, profile = {}) {
  const orgRoles = Array.isArray(profile.orgRoles) ? profile.orgRoles : [];
  const orgSize = profile.orgSize && typeof profile.orgSize === "object" ? profile.orgSize : {};

  const roleResult = evaluateRoleScope(obligation.roleScope, orgRoles);
  const sizeResult = evaluateSizeThreshold(obligation.sizeThreshold, orgSize);

  const missingDimensions = [];
  if (roleResult === "needs_input") missingDimensions.push("role");
  if (sizeResult.result === "needs_input") missingDimensions.push(sizeResult.dimension);

  if (missingDimensions.length > 0) {
    return {
      status: "needs_profile_input",
      reasons: missingDimensions.map((d) =>
        d === "role"
          ? "Your organisation's role is not set, add it in your profile to see whether this applies to you."
          : `Your organisation's ${ORG_SIZE_DIMENSIONS[d]?.label.toLowerCase() ?? d} is not set, add it in your profile to see whether this applies to you.`
      ),
      missingDimensions,
    };
  }

  if (roleResult === "fail") {
    return {
      status: "does_not_apply",
      reasons: ["Does not apply to any role your organisation holds."],
      missingDimensions: [],
    };
  }

  if (sizeResult.result === "fail") {
    return {
      status: "does_not_apply",
      reasons: [sizeResult.reason ?? "Below the applicability threshold for your organisation's size."],
      missingDimensions: [],
    };
  }

  const reasons = [];
  if (obligation.roleScope?.length) reasons.push("Applies to your organisation's role.");
  if (sizeResult.reason) reasons.push(sizeResult.reason.replace("threshold is", "threshold met:"));
  if (reasons.length === 0) reasons.push("Applies, no role or size restriction on this obligation.");

  return { status: "applies", reasons, missingDimensions: [] };
}
