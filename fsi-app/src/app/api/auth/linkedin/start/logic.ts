// The LinkedIn OAuth CSRF-state cookie constants, split out of route.ts (BUILDGATE, 2026-09-02,
// F34's named residual / build-graph proof). Next 16's route-type validator rejects a route.ts
// that exports anything besides route handlers/config fields, so these constants move to a
// sibling module; both this route (which sets the cookie) and ../callback/route.ts (which
// validates and clears it) import from here. Behaviour is unchanged; only the file they live in
// moved.

export const STATE_COOKIE = "li_oauth_state";
export const STATE_COOKIE_MAX_AGE_SECONDS = 600; // 10 minutes
