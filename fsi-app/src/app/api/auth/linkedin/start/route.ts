// src/app/api/auth/linkedin/start/route.ts
//
// GET /api/auth/linkedin/start
//
// Begins the LinkedIn OAuth 2.0 Authorization Code grant. Generates a CSRF
// state token, persists it in a short-lived HTTP-only cookie, and 302-redirects
// the user to LinkedIn's authorization endpoint. The matching callback route
// validates the state, exchanges the code for an access_token, fetches the
// LinkedIn lite profile and email, then upserts the Caro's Ledge `profiles`
// row for the authenticated user.
//
// Env vars (operator-provisioned; absence is handled gracefully here AND at
// the UI layer via /api/auth/linkedin/status):
//   LINKEDIN_CLIENT_ID
//   LINKEDIN_CLIENT_SECRET (consumed by the callback route)
//   LINKEDIN_REDIRECT_URI  (callback URL; should equal {origin}/api/auth/linkedin/callback)
//
// Security notes:
//   - State token: 32 random bytes, base64url-encoded. Stored in a Secure
//     (in production), HttpOnly, SameSite=Lax cookie with a 10-minute lifetime.
//   - We never log credentials or token material. Failure modes redirect to
//     the wizard with a non-sensitive ?linkedin=error&reason=... param.

import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";

export const STATE_COOKIE = "li_oauth_state";
export const STATE_COOKIE_MAX_AGE_SECONDS = 600; // 10 minutes
const AUTHORIZATION_ENDPOINT = "https://www.linkedin.com/oauth/v2/authorization";
const REQUIRED_SCOPES = "r_liteprofile r_emailaddress";

function resolveRedirectUri(origin: string): string {
  const configured = process.env.LINKEDIN_REDIRECT_URI;
  if (configured && configured.length > 0) return configured;
  return `${origin}/api/auth/linkedin/callback`;
}

export async function GET(request: NextRequest) {
  const clientId = process.env.LINKEDIN_CLIENT_ID;
  const { origin } = new URL(request.url);

  // Graceful degradation when the deployment is not configured for LinkedIn.
  // The OnboardingWizard mirrors this gate at the UI layer so the button is
  // disabled before the user ever lands here; this branch is defense in depth.
  if (!clientId) {
    return NextResponse.redirect(
      `${origin}/onboarding?linkedin=error&reason=not-configured`,
      { status: 302 }
    );
  }

  const state = randomBytes(32).toString("base64url");
  const redirectUri = resolveRedirectUri(origin);

  const authUrl = new URL(AUTHORIZATION_ENDPOINT);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("scope", REQUIRED_SCOPES);
  authUrl.searchParams.set("state", state);

  const response = NextResponse.redirect(authUrl.toString(), { status: 302 });
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: STATE_COOKIE_MAX_AGE_SECONDS,
  });
  return response;
}
