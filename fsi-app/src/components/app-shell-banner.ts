export function computeShowNoWorkspaceBanner(params: {
  user: unknown;
  /** Three-valued — see this file's header. MUST be `orgId === null`, never a bare falsy check. */
  orgId: string | null | undefined;
  /** The lookup's status. Only `resolved` may assert "no workspace". */
  identityStatus: "pending" | "resolved" | "error";
  pathname: string;
  /** Route prefixes where the banner is suppressed (already mid-setup-flow, no need to nag). */
  suppressRoutes: readonly string[];
}): boolean {
  const { user, orgId, identityStatus, pathname, suppressRoutes } = params;
  return (
    identityStatus === "resolved" &&
    !!user &&
    orgId === null &&
    !suppressRoutes.some((r) => pathname.startsWith(r))
  );
}

/**
 * The error note (lane AUTH-IDENTITY): shown when the lookup's last round failed for a viewer the
 * browser holds a session for. A viewer with no session gets nothing (there is no workspace to fail to
 * load). Suppressed on the same setup routes as the banner, which render their own chrome.
 */
export function computeShowIdentityErrorNote(params: {
  user: unknown;
  identityStatus: "pending" | "resolved" | "error";
  pathname: string;
  suppressRoutes: readonly string[];
}): boolean {
  const { user, identityStatus, pathname, suppressRoutes } = params;
  return identityStatus === "error" && !!user && !suppressRoutes.some((r) => pathname.startsWith(r));
}

/** Where a signed-in session with a resolved "no workspace" answer is sent (lane AUTH-2, 2026-10-06). */
export const NO_WORKSPACE_ONBOARDING_ROUTE = "/workspace/new";

/**
 * The onboarding redirect for a signed-in user with no membership: the SAME predicate as the banner
 * (resolved lookup, signed in, `orgId === null`, not already on a setup route), so the redirect can
 * never fire for a pending, failed or anonymous lookup, and never loops on the setup routes. Returns the
 * route to replace to, or null for "stay".
 */
export function computeNoWorkspaceRedirect(params: Parameters<typeof computeShowNoWorkspaceBanner>[0]): string | null {
  return computeShowNoWorkspaceBanner(params) ? NO_WORKSPACE_ONBOARDING_ROUTE : null;
}
