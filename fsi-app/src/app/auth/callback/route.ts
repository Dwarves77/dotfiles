import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ensureProfile } from "@/lib/auth/provision-personal-workspace";
import { sanitizeReturnPath } from "@/lib/auth/safe-return-path.mjs";

// Supabase auth callback. Handles:
//   - Email-confirmation links from /signup (next=/onboarding by default)
//   - Magic-link / OTP redirects (next=/ default)
//   - Any future flow that wants to land on a specific path post-auth
//
// Phase C: signup links call here with ?next=/onboarding so a freshly verified
// user lands directly in the onboarding wizard.
//
// Lane AUTH-2 (2026-10-06): after a successful code exchange, ensure the user has a profiles row, and
// nothing else. No organisation is created here: a user with no membership is routed to onboarding
// (/workspace/new) to accept an invitation or create an organisation. Idempotent and failure-tolerant
// (a failure is logged and counted in error_events and does not block auth); the server bootstrap runs
// the same ensureProfile on the first request of any session that still has no profile.
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
      if (data?.user?.id) {
        await ensureProfile(data.user.id, data.user.email ?? null);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
