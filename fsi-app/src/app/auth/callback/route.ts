import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ensurePersonalWorkspace } from "@/lib/auth/provision-personal-workspace";
import { sanitizeReturnPath } from "@/lib/auth/safe-return-path.mjs";

// Supabase auth callback. Handles:
//   - Email-confirmation links from /signup (next=/onboarding by default)
//   - Magic-link / OTP redirects (next=/ default)
//   - Any future flow that wants to land on a specific path post-auth
//
// Phase C: signup links call here with ?next=/onboarding so a freshly verified
// user lands directly in the onboarding wizard.
//
// Sprint 3 Track 2 (2026-05-28): AUTO-PROVISION-ORG-ON-SIGNUP.
// After a successful code exchange, ensure the user has a personal
// workspace + owner membership. Idempotent: short-circuits when the
// user already has an org_membership. Failure-tolerant: provision
// failure does NOT block auth — the defense-in-depth null_orgId
// seed-fallback still catches users whose provisioning silently fails.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // Wave-α A6: same-origin allowlist — a crafted `next` (`//evil.com`,
  // `@evil.com`, `/\evil.com`) could previously escape the origin in the
  // redirect concatenation below. Off-allowlist values fall back to "/".
  const next = sanitizeReturnPath(searchParams.get("next"));

  if (code) {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          },
        },
      }
    );

    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Provision personal workspace if no membership exists.
      // Best-effort: any failure is logged but does not block auth.
      if (data?.user?.id) {
        await ensurePersonalWorkspace(data.user.id, data.user.email ?? "");
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
