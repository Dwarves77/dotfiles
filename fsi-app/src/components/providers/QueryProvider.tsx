"use client";

// QueryProvider — PERF-12 (2026-09-04, ADR-027 §2, tanstack.com/query's own SSR guidance:
// "Advanced Server Rendering", App Router section).
//
// ONE QueryClient for the whole app, mounted here and wired into AuthProvider.tsx (the outermost
// client boundary this branch's own layout already has — see AuthProvider.tsx's own import site;
// src/app/layout.tsx itself is PERF-10's write set this lane does not touch, per the lane split).
//
// `useState(() => new QueryClient(...))` (not a module-level singleton) is the framework's own
// documented App Router pattern: React Server Components can re-render a client component tree per
// request/navigation, and a module-level client would leak query cache across different users'
// requests on the server if this module were ever imported into server code (it isn't — "use
// client" pins it to the browser bundle — but useState is the pattern TanStack's own docs specify
// regardless, precisely so this file never has to be re-audited if that changes). One instance per
// browser tab's lifetime; SSR pages hand it pre-fetched data via HydrationBoundary (see
// regulations/page.tsx), never their own separate client.
import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // A listing page is per-org, per-session data a user's own action (a mint, an
            // override) can change underneath them; 30s keeps a click-back-and-forth between two
            // ledgers from re-fetching every time, without staying stale for minutes.
            staleTime: 30_000,
            // The SSR page already renders synchronously — a client-side refetch on window focus
            // for data that just painted is wasted work, not a correctness need (mutations already
            // update the cache optimistically via the existing resourceStore, unaffected by this
            // provider).
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      })
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
