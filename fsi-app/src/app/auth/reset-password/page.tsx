"use client";

/**
 * /auth/reset-password — the "Forgot password?" destination from /login
 * (README screen 16 shows the link; the request/confirm flow itself is not
 * a separate artboard, so this page reuses AuthFrame + the AuthPanel field
 * geometry rather than inventing new chrome). Real Supabase call
 * (resetPasswordForEmail), not a decorative form — see /login's header for
 * why an unwired control is not acceptable here.
 *
 * emailRedirectTo -> /auth/callback?next=/auth/update-password, so the
 * recovery link lands the user on a real session (via the callback route's
 * existing exchangeCodeForSession) and then on the new-password form.
 */

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { Button } from "@/components/ui/Button";
import { AuthFrame } from "@/components/auth/AuthFrame";
import { AuthField, AuthErrorBanner, AUTH_INPUT_STYLE } from "@/components/auth/AuthPanel";

export default function ResetPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const supabase = createSupabaseBrowserClient();
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${origin}/auth/callback?next=${encodeURIComponent("/auth/update-password")}`,
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setSent(true);
  };

  return (
    <AuthFrame>
      <div style={{ width: 380, display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-display)", textTransform: "uppercase", letterSpacing: "0.04em", fontSize: 22, color: "var(--ink)", margin: 0 }}>
            Reset your password
          </h1>
          <p style={{ fontSize: "var(--fs-125)", color: "var(--ink-2)", marginTop: 6 }}>
            We&apos;ll email you a link to set a new password.
          </p>
        </div>

        {sent ? (
          <div
            style={{
              borderRadius: "var(--radius-card)",
              border: "1px solid var(--line-1)",
              background: "var(--card)",
              padding: 16,
              fontSize: "var(--fs-125)",
              color: "var(--ink-2)",
            }}
          >
            If an account exists for <strong style={{ color: "var(--ink)" }}>{email}</strong>, a reset
            link is on its way. <a href="/login" style={{ color: "var(--ink)", fontWeight: 600 }}>Back to sign in</a>
          </div>
        ) : (
          <>
            {error && <AuthErrorBanner message={error} />}
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
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
              <Button
                type="submit"
                variant="primary"
                disabled={loading}
                className="w-full justify-center"
                style={{ padding: "11px 14px", fontSize: "var(--fs-13)", fontWeight: 700 }}
              >
                {loading ? "Sending…" : "Send reset link"}
              </Button>
            </form>
            <a href="/login" style={{ fontSize: "var(--fs-12)", fontWeight: 600, color: "var(--ink)" }}>
              ← Back to sign in
            </a>
          </>
        )}
      </div>
    </AuthFrame>
  );
}
