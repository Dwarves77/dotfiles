"use client";

// Coverage client calls (lane COV-1, 2026-10-08). Every request to /api/dashboard/coverage/* goes through authedFetch, the
// one place the session bearer token is attached (F40). Each call answers a small { ok, error? } so a view shows a
// plain-language failure and keeps what the reader had on screen.
//
// The export follows the repo's Blob download convention (ActionRow.downloadMarkdownBrief): build a Blob, click an
// object-URL anchor, revoke. No clipboard, no window.open.

import { authedFetch } from "@/lib/api/authed-fetch";
import { coverageHref } from "./coverage-matrix.mjs";

export interface CoverageCallResult {
  ok: boolean;
  error?: string;
  already?: boolean;
}

const SIGN_IN = "Sign in again to continue.";
const NETWORK = "The network request failed. Check your connection and try again.";

async function errorOf(res: Response, fallback: string): Promise<string> {
  if (res.status === 401) return SIGN_IN;
  try {
    const body = (await res.json()) as { error?: unknown };
    return typeof body?.error === "string" && body.error ? body.error : fallback;
  } catch {
    return fallback;
  }
}

/** "Request coverage": one coverage_gap flag for the page path the gap is on. */
export async function requestCoverageRequest(input: { subjectRef: string; label: string }): Promise<CoverageCallResult> {
  try {
    const res = await authedFetch("/api/dashboard/coverage/request", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) return { ok: false, error: await errorOf(res, "Could not record that. Try again.") };
    const body = (await res.json()) as { already?: boolean };
    return { ok: true, already: body?.already === true };
  } catch {
    return { ok: false, error: NETWORK };
  }
}

/** The per-data-class totals the portfolio-add line reads (summary=1 keeps the payload small). */
export async function fetchCoverageSummary(): Promise<
  | { ok: true; dataClasses: Array<{ code: string; label: string; numerator: number; denominator: number }> }
  | { ok: false; error: string }
> {
  try {
    const res = await authedFetch("/api/dashboard/coverage/matrix?summary=1");
    if (!res.ok) return { ok: false, error: await errorOf(res, "Coverage is not available right now.") };
    const body = (await res.json()) as { dataClasses?: Array<{ code: string; label: string; numerator: number; denominator: number }> };
    return { ok: true, dataClasses: body.dataClasses ?? [] };
  } catch {
    return { ok: false, error: NETWORK };
  }
}

/** Download the CSV for the current axes as a file. */
export async function downloadCoverageCsv(query: { mode?: string; dataClass?: string; geography?: string }): Promise<CoverageCallResult> {
  if (typeof window === "undefined") return { ok: false, error: "Export runs in the browser." };
  try {
    const qs = coverageHref(query, "").replace(/^\?/, "");
    const res = await authedFetch(`/api/dashboard/coverage/matrix?format=csv${qs ? `&${qs}` : ""}`);
    if (!res.ok) return { ok: false, error: await errorOf(res, "The export could not be made. Try again.") };
    const disposition = res.headers.get("content-disposition") ?? "";
    const name = /filename="([^"]+)"/.exec(disposition)?.[1] ?? "coverage.csv";
    const blob = new Blob([await res.text()], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    return { ok: true };
  } catch {
    return { ok: false, error: NETWORK };
  }
}
