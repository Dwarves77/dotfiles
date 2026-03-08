"use client";

import { useState } from "react";
import { useAuthStore } from "@/hooks/useAuth";
import { Lock } from "lucide-react";
import { cn } from "@/lib/cn";

export function LoginForm({ onSuccess }: { onSuccess?: () => void }) {
  const { login, isLoading, error } = useAuthStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const success = await login(email, password);
    if (success && onSuccess) onSuccess();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-sm mx-auto">
      <div className="text-center mb-6">
        <Lock size={24} className="mx-auto text-text-secondary mb-2" />
        <h2 className="font-display text-lg uppercase tracking-tight text-text-primary">
          Admin Login
        </h2>
      </div>

      {error && (
        <div className="px-3 py-2 text-xs text-red-400 border border-red-400/20 rounded-[2px] bg-red-400/5">
          {error}
        </div>
      )}

      <div>
        <label className="text-[10px] uppercase tracking-wider text-text-secondary font-semibold block mb-1">
          Email
        </label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className={cn(
            "w-full px-3 py-2 text-sm bg-surface-input border border-border-subtle rounded-[2px]",
            "text-text-primary placeholder:text-text-tertiary",
            "focus:outline-none focus:border-[var(--cyan)]"
          )}
          placeholder="admin@company.com"
        />
      </div>

      <div>
        <label className="text-[10px] uppercase tracking-wider text-text-secondary font-semibold block mb-1">
          Password
        </label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className={cn(
            "w-full px-3 py-2 text-sm bg-surface-input border border-border-subtle rounded-[2px]",
            "text-text-primary placeholder:text-text-tertiary",
            "focus:outline-none focus:border-[var(--cyan)]"
          )}
          placeholder="••••••••"
        />
      </div>

      <button
        type="submit"
        disabled={isLoading}
        className={cn(
          "w-full py-2 text-xs font-bold uppercase tracking-wider border rounded-[1px] transition-all",
          "border-text-primary text-text-primary",
          "hover:bg-text-primary hover:text-surface-base",
          isLoading && "opacity-50 pointer-events-none"
        )}
      >
        {isLoading ? "Signing in..." : "Sign In"}
      </button>
    </form>
  );
}
