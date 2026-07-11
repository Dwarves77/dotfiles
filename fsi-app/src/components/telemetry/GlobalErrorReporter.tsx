"use client";

// Global client-side error reporter (Wave-β R0.2). First-party equivalent of
// a Sentry browser SDK: window.onerror + window.onunhandledrejection handlers
// posting to /api/telemetry/error, which groups into error_events (mig 195).
//
// Mounted once in the root layout. Renders nothing.
//
// Bounds (client half of the ingest contract):
//   - per-session cap (sessionStorage counter) + minimum interval between
//     posts, so an error loop cannot flood the endpoint;
//   - message/stack clamped before send;
//   - every failure in the reporter itself is swallowed — telemetry must
//     never break the page it observes (same permitted-swallow class as
//     capture-error.ts; the loss is acceptable, breaking the app is not).

import { useEffect } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";

const SESSION_CAP = 10; // max reports per browser session
const MIN_INTERVAL_MS = 3000; // min spacing between reports
const MESSAGE_MAX = 1000;
const STACK_MAX = 4000;

const COUNT_KEY = "cl-err-report-count";
const LAST_KEY = "cl-err-report-last";

function underLimits(): boolean {
  try {
    const count = Number(sessionStorage.getItem(COUNT_KEY) || "0");
    const last = Number(sessionStorage.getItem(LAST_KEY) || "0");
    if (count >= SESSION_CAP) return false;
    if (Date.now() - last < MIN_INTERVAL_MS) return false;
    return true;
  } catch {
    // sessionStorage unavailable (privacy mode): report nothing rather than
    // risk an unbounded loop.
    return false;
  }
}

function bumpLimits(): void {
  try {
    sessionStorage.setItem(
      COUNT_KEY,
      String(Number(sessionStorage.getItem(COUNT_KEY) || "0") + 1)
    );
    sessionStorage.setItem(LAST_KEY, String(Date.now()));
  } catch {
    // ignore — limits are best-effort
  }
}

/**
 * Report one client error. Exported so the route-level error boundary
 * (src/app/error.tsx) shares the same limited, authed pipe.
 */
export async function reportClientError(message: string, stack?: string | null): Promise<void> {
  try {
    if (!underLimits()) return;
    bumpLimits();

    const supabase = createSupabaseBrowserClient();
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return; // pre-auth pages: not captured (documented R0.2 deviation)

    await fetch("/api/telemetry/error", {
      method: "POST",
      keepalive: true,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        message: String(message || "Unknown client error").slice(0, MESSAGE_MAX),
        stack: stack ? String(stack).slice(0, STACK_MAX) : null,
        path: typeof window !== "undefined" ? window.location.pathname : "",
      }),
    });
  } catch {
    // Telemetry must never break the page (permitted swallow class).
  }
}

export function GlobalErrorReporter() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      const err = event.error;
      void reportClientError(
        event.message || (err instanceof Error ? err.message : "window.onerror"),
        err instanceof Error ? err.stack : null
      );
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      if (reason instanceof Error) {
        void reportClientError(`Unhandled rejection: ${reason.message}`, reason.stack);
      } else {
        let text = "";
        try {
          text = JSON.stringify(reason);
        } catch {
          text = String(reason);
        }
        void reportClientError(`Unhandled rejection: ${text}`, null);
      }
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
