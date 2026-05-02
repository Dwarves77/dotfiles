"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { useRouter } from "next/navigation";
import { APP_NAME } from "@/lib/constants";
import { UserPlus, AlertCircle, MailCheck, ArrowRight } from "lucide-react";

// ───────────────────────────────────────────────────────────────────────────
// /signup
// Email + password signup. Phase C scope.
// - No Google OAuth, no LinkedIn OAuth.
// - LinkedIn import shown as a "Coming soon" stub on the onboarding wizard,
//   not here.
// - On submit, calls Supabase auth.signUp with emailRedirectTo pointing at
//   /auth/callback?next=/onboarding so the verified user lands in the wizard.
// - "Check your email" state replaces the form after a successful signUp.
// - Mid-session: if user is already authenticated, redirect to /login (which
//   in turn will redirect signed-in users on through to /).
// ───────────────────────────────────────────────────────────────────────────

export default function SignupPage() {
  const router = useRouter();
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
        emailRedirectTo: `${origin}/auth/callback?next=/onboarding`,
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
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: "var(--color-background)" }}
      >
        <p
          className="text-sm"
          style={{ color: "var(--color-text-muted)" }}
        >
          Loading…
        </p>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ backgroundColor: "var(--color-background)" }}
    >
      <div className="w-full max-w-sm space-y-6">
        {/* Header */}
        <div className="text-center">
          <h1
            className="text-2xl font-bold tracking-tight"
            style={{ color: "var(--color-text-primary)" }}
          >
            {APP_NAME}
          </h1>
          <p
            className="text-sm mt-1"
            style={{ color: "var(--color-text-secondary)" }}
          >
            Create your account
          </p>
        </div>

        {submitted ? (
          <CheckYourEmail email={email} />
        ) : (
          <>
            {error && (
              <div
                className="flex items-center gap-2 p-3 rounded-lg text-sm"
                style={{
                  backgroundColor: "rgba(220, 38, 38, 0.06)",
                  border: "1px solid rgba(220, 38, 38, 0.15)",
                  color: "var(--color-error)",
                }}
              >
                <AlertCircle size={14} />
                {error}
              </div>
            )}

            <form onSubmit={handleSignup} className="space-y-4">
              <Field label="Email">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className="w-full px-3 py-2.5 text-sm rounded-lg border outline-none transition-colors"
                  style={inputStyle}
                  placeholder="you@company.com"
                />
              </Field>

              <Field label="Password">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  minLength={8}
                  className="w-full px-3 py-2.5 text-sm rounded-lg border outline-none transition-colors"
                  style={inputStyle}
                  placeholder="At least 8 characters"
                />
              </Field>

              <Field label="Confirm password">
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  minLength={8}
                  className="w-full px-3 py-2.5 text-sm rounded-lg border outline-none transition-colors"
                  style={inputStyle}
                  placeholder="Re-enter password"
                />
              </Field>

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                style={{
                  backgroundColor: "var(--color-invert-bg)",
                  color: "var(--color-invert-text)",
                }}
              >
                <UserPlus size={14} />
                {loading ? "Creating account…" : "Create account"}
              </button>
            </form>

            <p
              className="text-center text-xs"
              style={{ color: "var(--color-text-muted)" }}
            >
              Already have an account?{" "}
              <a
                href="/login"
                className="underline"
                style={{ color: "var(--color-text-secondary)" }}
              >
                Sign in
              </a>
            </p>
          </>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  borderColor: "var(--color-border)",
  backgroundColor: "var(--color-surface)",
  color: "var(--color-text-primary)",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label
        className="block text-sm font-medium mb-1.5"
        style={{ color: "var(--color-text-primary)" }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

function CheckYourEmail({ email }: { email: string }) {
  return (
    <div
      className="rounded-lg border p-5 text-center space-y-3"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-surface)",
      }}
    >
      <div
        className="mx-auto w-10 h-10 rounded-full flex items-center justify-center"
        style={{
          backgroundColor: "var(--color-active-bg)",
          color: "var(--color-primary)",
        }}
      >
        <MailCheck size={18} />
      </div>
      <h2
        className="text-base font-semibold"
        style={{ color: "var(--color-text-primary)" }}
      >
        Check your email
      </h2>
      <p
        className="text-sm"
        style={{ color: "var(--color-text-secondary)" }}
      >
        We sent a confirmation link to{" "}
        <span style={{ color: "var(--color-text-primary)", fontWeight: 600 }}>
          {email}
        </span>
        . Click the link to verify your account and finish setting up your
        profile.
      </p>
      <p
        className="text-xs"
        style={{ color: "var(--color-text-muted)" }}
      >
        Didn&apos;t get it? Check your spam folder, or sign in below if you
        already confirmed in another tab.
      </p>
      <a
        href="/login"
        className="inline-flex items-center gap-1 text-sm font-medium"
        style={{ color: "var(--color-primary)" }}
      >
        Go to sign in <ArrowRight size={12} />
      </a>
    </div>
  );
}
