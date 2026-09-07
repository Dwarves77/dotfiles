"use client";

/**
 * /signup — UI system handoff 2026-09-06, README screen 16. Same AuthFrame
 * + tab strip as /login; the mock's single-column email/password form is
 * kept as password + confirm-password since the app has no passwordless-
 * only signup path and the mock's own inputs ("Work email" / "Password")
 * are ambiguous about confirmation — the pre-existing page already asked
 * for both and this preserves that validation rather than weakening it.
 *
 * Functionality unchanged from the pre-existing page: Supabase signUp,
 * emailRedirectTo -> /auth/callback?next=<redirect || /onboarding>,
 * same-origin-only redirect, already-signed-in guard, "check your email"
 * state after submit.
 */

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { AuthFrame } from "@/components/auth/AuthFrame";
import {
  AuthTabs,
  AuthField,
  AuthErrorBanner,
  CheckEmailPanel,
  AUTH_INPUT_STYLE,
} from "@/components/auth/AuthPanel";

/** Internal app paths only: must start with "/" and not "//" (protocol-relative). */
function safeInternalPath(value: string | null): string | null {
  if (!value) return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  return value;
}

export default function SignupPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = safeInternalPath(searchParams.get("redirect"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  // Redirect already-signed-in users away from signup. The proxy in
  // src/proxy.ts also enforces this server-side, but the client-side guard
  // shaves a flash of the form for users with a fresh session.
  useEffect(() => {
    let cancelled = false;
    const supabase = createSupabaseBrowserClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (cancelled) return;
      if (user) {
        router.replace("/login");
        return;
      }
      setCheckingSession(false);
    });
    return () => {
      cancelled = true;
    };
  }, [router]);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    const supabase = createSupabaseBrowserClient();
    const origin =
      typeof window !== "undefined" ? window.location.origin : "";

    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(
          redirect ?? "/onboarding"
        )}`,
      },
    });

    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
      return;
    }

    setSubmitted(true);
    setLoading(false);
  };

  if (checkingSession) {
    return (
      <AuthFrame>
        <p style={{ fontSize: "var(--fs-13)", color: "var(--ink-3)" }}>Loading…</p>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame>
      <div style={{ width: 380, display: "flex", flexDirection: "column", gap: 14 }}>
        <AuthTabs active="signup" redirect={redirect} />

        {submitted ? (
          <CheckEmailPanel
            email={email}
            note="We sent a confirmation link to"
          />
        ) : (
          <>
            {error && <AuthErrorBanner message={error} />}

            <form onSubmit={handleSignup} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <AuthField label="Work email">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  style={AUTH_INPUT_STYLE}
                  placeholder="name@company.com"
                />
              </AuthField>

              <AuthField label="Password">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  minLength={8}
                  style={AUTH_INPUT_STYLE}
                  placeholder="At least 8 characters"
                />
              </AuthField>

              <AuthField label="Confirm password">
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  minLength={8}
                  style={AUTH_INPUT_STYLE}
                  placeholder="Re-enter password"
                />
              </AuthField>

              <Button
                type="submit"
                variant="primary"
                disabled={loading}
                className="w-full justify-center"
                style={{ padding: "11px 14px", fontSize: "var(--fs-13)", fontWeight: 700 }}
              >
                {loading ? "Creating account…" : "Create account"}
              </Button>
            </form>

            <p style={{ fontSize: "var(--fs-115)", color: "var(--ink-3)", lineHeight: 1.5, marginTop: 6 }}>
              Invited to a workspace? Open the invitation link in your email —
              it signs you in and joins the workspace in one step.
            </p>
          </>
        )}
      </div>
    </AuthFrame>
  );
}
