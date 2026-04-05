"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { useRouter, useSearchParams } from "next/navigation";
import { APP_NAME } from "@/lib/constants";
import { LogIn, AlertCircle } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") || "/";

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
            Sign in to your workspace
          </p>
        </div>

        {/* Error */}
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

        {/* Form */}
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label
              className="block text-sm font-medium mb-1.5"
              style={{ color: "var(--color-text-primary)" }}
            >
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full px-3 py-2.5 text-sm rounded-lg border outline-none transition-colors"
              style={{
                borderColor: "var(--color-border)",
                backgroundColor: "var(--color-surface)",
                color: "var(--color-text-primary)",
              }}
              placeholder="you@company.com"
            />
          </div>

          <div>
            <label
              className="block text-sm font-medium mb-1.5"
              style={{ color: "var(--color-text-primary)" }}
            >
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full px-3 py-2.5 text-sm rounded-lg border outline-none transition-colors"
              style={{
                borderColor: "var(--color-border)",
                backgroundColor: "var(--color-surface)",
                color: "var(--color-text-primary)",
              }}
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
            style={{
              backgroundColor: "var(--color-invert-bg)",
              color: "var(--color-invert-text)",
            }}
          >
            <LogIn size={14} />
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <p
          className="text-center text-xs"
          style={{ color: "var(--color-text-muted)" }}
        >
          Contact your workspace admin for access.
        </p>
      </div>
    </div>
  );
}
