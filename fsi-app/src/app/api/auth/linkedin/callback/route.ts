// src/app/api/auth/linkedin/callback/route.ts
//
// GET /api/auth/linkedin/callback
//
// Receives the LinkedIn authorization-code redirect. Validates the CSRF state
// cookie, exchanges the authorization code for an access_token, fetches the
// LinkedIn lite profile + primary email, maps to the Caro's Ledge profile
// shape, and UPSERTs into `profiles` for the currently authenticated user.
// On success redirects back to /onboarding (or /profile if onboarding is
// already complete) with ?linkedin=imported. On failure redirects back with
// ?linkedin=error&reason=...
//
// Security:
//   - Validates state by comparing the OAuth state query param against the
//     httpOnly cookie issued by the /start route. Mismatch or missing cookie
//     redirects with reason=state-mismatch.
//   - Validates the code parameter is present before any token exchange.
//   - Wraps the token exchange and profile fetches in try/catch and returns
//     reason=token-exchange-failed or reason=profile-fetch-failed on error.
//   - Requires an authenticated Supabase session (cookie-based) to perform
//     the profile upsert. Unauthenticated callers get reason=not-authenticated.
//   - Never logs the access_token or any LinkedIn token material. Logs are
//     limited to success / failure event names plus the failure reason key.

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server-client";
import { STATE_COOKIE } from "../start/route";

const TOKEN_ENDPOINT = "https://www.linkedin.com/oauth/v2/accessToken";
const PROFILE_ENDPOINT = "https://api.linkedin.com/v2/me";
const EMAIL_ENDPOINT =
  "https://api.linkedin.com/v2/emailAddress?q=members&projection=(elements*(handle~))";

type FailureReason =
  | "not-configured"
  | "not-authenticated"
  | "state-mismatch"
  | "missing-code"
  | "provider-denied"
  | "token-exchange-failed"
  | "profile-fetch-failed"
  | "profile-upsert-failed";

interface LinkedInProfileResponse {
  id?: string;
  localizedFirstName?: string;
  localizedLastName?: string;
  localizedHeadline?: string;
  vanityName?: string;
}

interface LinkedInEmailResponse {
  elements?: Array<{
    "handle~"?: { emailAddress?: string };
  }>;
}

function redirectWithError(origin: string, reason: FailureReason, returnTo: string): NextResponse {
  const url = new URL(returnTo, origin);
  url.searchParams.set("linkedin", "error");
  url.searchParams.set("reason", reason);
  const response = NextResponse.redirect(url.toString(), { status: 302 });
  // Clear the state cookie on any terminal outcome so it cannot be replayed.
  response.cookies.set(STATE_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}

function redirectSuccess(origin: string, returnTo: string): NextResponse {
  const url = new URL(returnTo, origin);
  url.searchParams.set("linkedin", "imported");
  const response = NextResponse.redirect(url.toString(), { status: 302 });
  response.cookies.set(STATE_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}

function resolveRedirectUri(origin: string): string {
  const configured = process.env.LINKEDIN_REDIRECT_URI;
  if (configured && configured.length > 0) return configured;
  return `${origin}/api/auth/linkedin/callback`;
}

export async function GET(request: NextRequest) {
  const { origin, searchParams } = new URL(request.url);

  const clientId = process.env.LINKEDIN_CLIENT_ID;
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return redirectWithError(origin, "not-configured", "/onboarding");
  }

  // LinkedIn surfaces user-cancellation or provider-side rejection as an
  // ?error param on the callback. Surface this as provider-denied so the
  // wizard can show a non-modal toast.
  const providerError = searchParams.get("error");
  if (providerError) {
    console.warn("[linkedin-oauth] callback received provider error", {
      reason: "provider-denied",
    });
    return redirectWithError(origin, "provider-denied", "/onboarding");
  }

  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const stateCookie = request.cookies.get(STATE_COOKIE)?.value;

  if (!state || !stateCookie || state !== stateCookie) {
    console.warn("[linkedin-oauth] state validation failed", {
      reason: "state-mismatch",
    });
    return redirectWithError(origin, "state-mismatch", "/onboarding");
  }

  if (!code || code.length === 0) {
    return redirectWithError(origin, "missing-code", "/onboarding");
  }

  // The remainder of the flow requires an authenticated Supabase session so
  // we know which profile row to UPSERT into.
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return redirectWithError(origin, "not-authenticated", "/login?redirect=/onboarding");
  }

  // Exchange the authorization code for an access_token.
  let accessToken: string;
  try {
    const tokenBody = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: resolveRedirectUri(origin),
      client_id: clientId,
      client_secret: clientSecret,
    });
    const tokenRes = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: tokenBody.toString(),
      cache: "no-store",
    });
    if (!tokenRes.ok) {
      // Never include the access_token or response body in logs; record only
      // the high-level outcome.
      console.warn("[linkedin-oauth] token exchange non-2xx", {
        status: tokenRes.status,
      });
      return redirectWithError(origin, "token-exchange-failed", "/onboarding");
    }
    const tokenJson = (await tokenRes.json()) as { access_token?: string };
    if (!tokenJson.access_token) {
      return redirectWithError(origin, "token-exchange-failed", "/onboarding");
    }
    accessToken = tokenJson.access_token;
  } catch (err) {
    console.warn("[linkedin-oauth] token exchange threw", {
      reason: "token-exchange-failed",
      // Capture only error.name to avoid leaking arbitrary message content.
      errorName: (err as Error)?.name ?? "unknown",
    });
    return redirectWithError(origin, "token-exchange-failed", "/onboarding");
  }

  // Fetch the lite profile and primary email in parallel. Failures collapse
  // into a single profile-fetch-failed redirect; we never persist a partial
  // import.
  let profile: LinkedInProfileResponse;
  let primaryEmail: string | null = null;
  try {
    const authHeader = { Authorization: `Bearer ${accessToken}` };
    const [profileRes, emailRes] = await Promise.all([
      fetch(PROFILE_ENDPOINT, { headers: authHeader, cache: "no-store" }),
      fetch(EMAIL_ENDPOINT, { headers: authHeader, cache: "no-store" }),
    ]);
    if (!profileRes.ok) {
      console.warn("[linkedin-oauth] profile fetch non-2xx", {
        status: profileRes.status,
      });
      return redirectWithError(origin, "profile-fetch-failed", "/onboarding");
    }
    profile = (await profileRes.json()) as LinkedInProfileResponse;

    // Email is best-effort: a workspace that does not grant r_emailaddress
    // (or LinkedIn account without a verified email) should still let the
    // lite-profile import succeed.
    if (emailRes.ok) {
      const emailJson = (await emailRes.json()) as LinkedInEmailResponse;
      const handle = emailJson.elements?.[0]?.["handle~"];
      if (handle && typeof handle.emailAddress === "string") {
        primaryEmail = handle.emailAddress;
      }
    }
  } catch (err) {
    console.warn("[linkedin-oauth] profile fetch threw", {
      reason: "profile-fetch-failed",
      errorName: (err as Error)?.name ?? "unknown",
    });
    return redirectWithError(origin, "profile-fetch-failed", "/onboarding");
  }

  // Map LinkedIn fields onto the profiles row shape.
  const firstName = profile.localizedFirstName?.trim() ?? "";
  const lastName = profile.localizedLastName?.trim() ?? "";
  const fullName = `${firstName} ${lastName}`.trim();
  const headline = profile.localizedHeadline?.trim() || null;
  const vanity = profile.vanityName?.trim();
  const linkedinUrl = vanity ? `https://linkedin.com/in/${vanity}` : null;

  const update: Record<string, unknown> = {
    linkedin_verified: true,
    verification_tier: "linkedin_verified",
    updated_at: new Date().toISOString(),
  };
  if (fullName.length > 0) update.full_name = fullName;
  if (headline) update.headline = headline;
  if (linkedinUrl) update.linkedin_url = linkedinUrl;

  // Note: we intentionally do NOT write LinkedIn's email back to profiles.
  // primary_email is best-effort and we currently have no destination column
  // for it on profiles; the Supabase auth.users row owns the canonical email.
  void primaryEmail;

  const { error: upsertError } = await supabase
    .from("profiles")
    .update(update)
    .eq("id", user.id);
  if (upsertError) {
    console.warn("[linkedin-oauth] profile upsert failed", {
      reason: "profile-upsert-failed",
      pgCode: upsertError.code ?? "unknown",
    });
    return redirectWithError(origin, "profile-upsert-failed", "/onboarding");
  }

  // Decide where to send the user: if onboarding is incomplete we keep them
  // in the wizard so they can review and continue. Onboarding completion
  // proxy: presence of a non-empty sector_profile on the user's primary
  // workspace. We treat "not in a workspace" or any read error as "still
  // onboarding" and route to /onboarding by default.
  let returnTo = "/onboarding";
  try {
    const { data: membership } = await supabase
      .from("org_memberships")
      .select("org_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();
    const orgId = membership?.org_id ?? null;
    if (orgId) {
      const { data: settings } = await supabase
        .from("workspace_settings")
        .select("sector_profile")
        .eq("org_id", orgId)
        .maybeSingle();
      const sectors = (settings?.sector_profile as string[] | null) ?? null;
      if (Array.isArray(sectors) && sectors.length > 0) {
        returnTo = "/profile";
      }
    }
  } catch {
    // Onboarding-incomplete fallback already applies.
  }

  console.info("[linkedin-oauth] import succeeded", {
    userId: user.id,
    hasHeadline: Boolean(headline),
    hasVanity: Boolean(vanity),
  });
  return redirectSuccess(origin, returnTo);
}
