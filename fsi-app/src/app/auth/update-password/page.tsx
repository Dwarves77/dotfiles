"use client";

/**
 * /auth/update-password — the destination /auth/callback lands a recovery
 * link on (?next=/auth/update-password, set by /auth/reset-password). The
 * callback's exchangeCodeForSession already establishes the session; this
 * page just calls supabase.auth.updateUser({ password }).
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { Button } from "@/components/ui/Button";
import { AuthFrame } from "@/components/auth/AuthFrame";
import { AuthField, AuthErrorBanner, AUTH_INPUT_STYLE } from "@/components/auth/AuthPanel";

export default function UpdatePasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
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
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setDone(true);
  };

  return (
    <AuthFrame>
      <div style={{ width: 380, display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-display)", textTransform: "uppercase", letterSpacing: "0.04em", fontSize: 22, color: "var(--ink)", margin: 0 }}>
            Set a new password
          </h1>
        </div>

        {done ? (
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
            Password updated.{" "}
            <Button
              variant="primary"
              onClick={() => router.push("/")}
              style={{ marginTop: 10 }}
            >
              Continue
            </Button>
          </div>
        ) : (
          <>
            {error && <AuthErrorBanner message={error} />}
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <AuthField label="New password">
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
              <AuthField label="Confirm new password">
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
                {loading ? "Saving…" : "Update password"}
              </Button>
            </form>
          </>
        )}
      </div>
    </AuthFrame>
  );
}
