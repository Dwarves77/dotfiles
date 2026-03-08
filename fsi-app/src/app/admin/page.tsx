"use client";

import { useEffect } from "react";
import { useAuthStore } from "@/hooks/useAuth";
import { AdminPanel } from "@/components/admin/AdminPanel";
import { LoginForm } from "@/components/admin/LoginForm";
import { AmbientOrbs } from "@/components/ui/AmbientOrbs";
import { APP_NAME } from "@/lib/constants";
import { ArrowLeft, LogOut } from "lucide-react";
import Link from "next/link";

export default function AdminPage() {
  const { isAuthenticated, isLoading, checkSession, logout, role } = useAuthStore();

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  return (
    <div className="relative min-h-screen bg-surface-base">
      <AmbientOrbs />
      <div className="relative z-10 mx-auto max-w-4xl px-4 sm:px-6 py-6">
        {/* Header */}
        <header className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <Link
                href="/"
                className="inline-flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors mb-2"
              >
                <ArrowLeft size={12} /> Back to Dashboard
              </Link>
              <h1 className="font-display text-3xl uppercase tracking-tight text-text-primary">
                {APP_NAME}
              </h1>
              <p className="text-xs font-light tracking-[0.2em] uppercase text-text-secondary mt-1">
                Administration
              </p>
            </div>
            {isAuthenticated && (
              <button
                onClick={logout}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors"
              >
                <LogOut size={12} /> Sign Out
              </button>
            )}
          </div>
          <div className="mt-3 h-px bg-gradient-to-r from-border-medium via-surface-overlay to-transparent" />
        </header>

        {/* Content */}
        {isLoading ? (
          <div className="py-20 text-center text-xs text-text-secondary">
            Checking session...
          </div>
        ) : isAuthenticated ? (
          <AdminPanel />
        ) : (
          <div className="py-12">
            <LoginForm onSuccess={() => {}} />
          </div>
        )}
      </div>
    </div>
  );
}
