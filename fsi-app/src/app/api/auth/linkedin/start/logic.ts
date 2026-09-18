// The LinkedIn OAuth CSRF-state cookie constants, split out of route.ts (BUILDGATE, 2026-09-02,
// F34's named residual / build-graph proof). Next 16's route-type validator rejects a route.ts
// that exports anything besides route handlers/config fields, so these constants move to a
// sibling module; both this route (which sets the cookie) and ../callback/route.ts (which
// validates and clears it) import from here. Behaviour is unchanged; only the file they live in
// moved.

export const STATE_COOKIE = "li_oauth_state";
export const STATE_COOKIE_MAX_AGE_SECONDS = 600; // 10 minutes

// www.linkedin.com -- ONE HOME (lane L35, F46 external-host-home). This module is already the shared
// import site between start/route.ts and ../callback/route.ts (see the header above); the OAuth base is
// added here so both routes compose their specific endpoint from it instead of templating the host
// string again. api.linkedin.com (the profile/email REST endpoints, callback/route.ts only) is a
// DIFFERENT host and out of this host's scope -- left as-is.
export const LINKEDIN_OAUTH_BASE_URL = "https://www.linkedin.com/oauth/v2";
