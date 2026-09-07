"use client";

/**
 * /login — UI system handoff 2026-09-06, README screen 16 "Sign in · Sign
 * up": AuthFrame (masthead identity left) + this form (right). Assembled
 * from AuthFrame + the shared AuthPanel bits + Button — see
 * src/components/auth/AuthFrame.tsx and AuthPanel.tsx headers.
 *
 * Functionality unchanged from the pre-existing page: Supabase password
 * sign-in, same-origin redirect allowlist (Wave-α A6). Added: a real
 * magic-link path (supabase.auth.signInWithOtp) and a real forgot-password
 * link to /auth/reset-password — the mock shows both controls and CLAUDE.md
 * forbids shipping an unwired control (the audit's dead "Complete brief"
 * toggle is exactly this failure mode). "Keep me signed in" is NOT built:
 * src/lib/supabase-browser.ts's client always persists the session via
 * cookies with no session-only mode wired, and that file is outside this
 * lane's write set — see DEVIATION-LOG.md.
 */

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { useRouter, useSearchParams } from "next/navigation";
import { sanitizeReturnPath } from "@/lib/auth/safe-return-path.mjs";
import { Button } from "@/components/ui/Button";
import { AuthFrame } from "@/components/auth/AuthFrame";
import {
  AuthTabs,
  AuthField,
  AuthErrorBanner,
  AuthDivider,
  CheckEmailPanel,
  AUTH_INPUT_STYLE,
} from "@/components/auth/AuthPanel";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [magicLoading, setMagicLoading] = useState(false);
  const [magicSent, setMagicSent] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  // Wave-α A6: same-origin allowlist — `?redirect=https://evil.com` was
  // previously pushed raw into the router post-login (phishing vector).
  const redirect = sanitizeReturnPath(searchParams.get("redirect"));

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    router.push(redirect);
    router.refresh();
  };

  const handleMagicLink = async () => {
    if (!email.trim()) {
      setError("Enter your work email above first.");
      return;
    }
    setError("");
    setMagicLoading(true);
    const supabase = createSupabaseBrowserClient();
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(redirect)}`,
      },
    });
    setMagicLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setMagicSent(true);
  };

  return (
    <AuthFrame>
      <div style={{ width: 380, display: "flex", flexDirection: "column", gap: 14 }}>
        <AuthTabs active="signin" redirect={redirect !== "/" ? redirect : null} />

        {magicSent ? (
          <CheckEmailPanel email={email} note="We sent a sign-in link to" />
        ) : (
          <>
            {error && (
              <AuthErrorBanner message={error} />
            )}

            <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
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
                  autoComplete="current-password"
                  style={AUTH_INPUT_STYLE}
                  placeholder="••••••••"
                />
              </AuthField>

              <div style={{ display: "flex", justifyContent: "flex-end", fontSize: "var(--fs-12)" }}>
                <a href="/auth/reset-password" style={{ fontWeight: 600, color: "var(--ink)" }}>
                  Forgot password?
                </a>
              </div>

              <Button
                type="submit"
                variant="primary"
                disabled={loading}
                className="w-full justify-center"
                style={{ padding: "11px 14px", fontSize: "var(--fs-13)", fontWeight: 700 }}
              >
                {loading ? "Signing in…" : "Sign in"}
              </Button>
            </form>

            <AuthDivider />

            <Button
              type="button"
              variant="secondary"
              disabled={magicLoading}
              onClick={handleMagicLink}
              className="w-full justify-center"
              style={{ padding: "10px 14px", fontSize: "var(--fs-125)", fontWeight: 600 }}
            >
              {magicLoading ? "Sending link…" : "Continue with a magic link"}
            </Button>

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
