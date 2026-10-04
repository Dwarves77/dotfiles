// index.mjs — the COMMUNITY-A / COMMUNITY-B interface contract (Wave 3 lane plan,
// docs/plans/wave3-lanes-2026-09-03.md). Both lanes build to this file's exports; COMMUNITY-B imports it
// (or, where COMMUNITY-A's route is not yet present in that worktree, builds against this same shape via
// its own `src/components/community/api-client.ts` + fixtures). Re-exports only — every function is
// implemented, documented and unit-tested in its own module; this file adds no logic of its own so the
// contract surface stays exactly what the wave-3 plan named:
//
//   evaluateAntitrustGuard(post) -> { allowed, reason }
//   projectAuthorIdentity(profile) -> { orgType, role, sector, region, verified }
//
// Wave 3 addition (lane COMMUNITY-C, 2026-09-03):
//   deriveOrganisationKey({domain, verified, salt}) -> { organisationKey, refused, reason }
//   sanitizeMemberWrite(body) -> { ok, data } | { ok: false, error }, strips verification columns
//
// Lane W2-B addition (R8.7 identity-by-default, migration 336, 2026-09-29):
//   resolveEffectiveAnonymous({postAnonymous, profileDefaultAnonymous}) -> boolean (per-post overrides per-user default)
//   projectAuthorIdentity(profile) now also projects name/company (withheld when anonymous), see identity.mjs's own header
//
// Community benchmarks and response submission were removed by ADR-042 (2026-10-03).
// Community is social only (ADR-041, 2026-10-03): the promotion ladder, corroboration counter, evidence
// age decay and lineage guard were REMOVED. No Community-derived content feeds any other surface.

export { evaluateAntitrustGuard, kAnonymity, dominanceCap, threeMonthLag, SENSITIVE_FIELDS } from "./antitrust.mjs";
export {
  projectAuthorIdentity,
  ORG_TYPES,
  resolveEffectiveAnonymous,
  buildAuthorIdentityForRender,
} from "./identity.mjs";
export {
  deriveOrganisationKey,
  domainFromEmail,
  isCorporateDomain,
  isFreeMailDomain,
  FREE_MAIL_DOMAINS,
} from "./organisation-key.mjs";
export {
  sanitizeMemberWrite,
  projectOwnProfile,
  REGIONS,
  MEMBER_WRITE_FORBIDDEN_COLUMNS,
} from "./profile-policy.mjs";
export { validateMemberPrefToggle } from "./group-member-prefs.mjs";
// createMemberPrefTogglePatchHandler (member-pref-route.mjs) is NOT re-exported here: it imports
// next/server, and this barrel is imported by plain `node --test` files with no npm resolver
// (index.test.mjs among them), see that module's own header. Routes import it directly.
export { validateEntityIds, MAX_ENTITY_IDS } from "./entity-binding.mjs";
