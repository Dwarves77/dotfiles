// Perf capture — measure end-to-end response time on each authenticated
// surface of the PR #21 Vercel preview, save a JSON report.
//
// Auth strategy:
//   1. Mint an admin session via Supabase Admin API (generate_link / magiclink).
//   2. Try the @supabase/ssr cookie format first
//      (sb-<projectRef>-auth-token = JSON-encoded array).
//   3. Fall back to Authorization: Bearer <access_token>, which the Supabase
//      server client also accepts.
//
// Usage:
//   PERF_TEST_BASE_URL=https://<preview>.vercel.app node supabase/seed/perf-capture.mjs
//   node supabase/seed/perf-capture.mjs https://<preview>.vercel.app

import { createClient } from "@supabase/supabase-js";
import { writeFileSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
process.chdir(resolve(__dirname, "..", ".."));
process.loadEnvFile(".env.local");

// ─── Args / env ────────────────────────────────────────────────────────────

const cliBaseUrl = process.argv.slice(2).find((a) => a.startsWith("http"));
const BASE_URL = (cliBaseUrl || process.env.PERF_TEST_BASE_URL || "").replace(/\/$/, "");
if (!BASE_URL) {
  console.error("ERROR: PERF_TEST_BASE_URL not set.");
  console.error("");
  console.error("Pass it as the first arg or via env var:");
  console.error("  PERF_TEST_BASE_URL=https://<preview>.vercel.app node supabase/seed/perf-capture.mjs");
  console.error("  node supabase/seed/perf-capture.mjs https://<preview>.vercel.app");
  process.exit(2);
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PERF_TEST_EMAIL = process.env.PERF_TEST_EMAIL || "jasonlosh@gmail.com";
const PERF_TEST_PASSWORD = process.env.PERF_TEST_PASSWORD || null;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error("ERROR: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing in .env.local");
  process.exit(2);
}

// Project ref is the host segment of NEXT_PUBLIC_SUPABASE_URL
// e.g. https://kwrsbpiseruzbfwjpvsp.supabase.co → kwrsbpiseruzbfwjpvsp
const projectRef = new URL(SUPABASE_URL).host.split(".")[0];

const SURFACES = [
  "/",
  "/regulations",
  "/operations",
  "/market",
  "/map",
  "/research",
  "/admin",
  "/community",
  "/community/browse",
];

const REPORT_PATH = "C:\\Users\\jason\\dotfiles\\docs\\PERF-CAPTURE.json";
const REQUEST_TIMEOUT_MS = 30_000;
const REPS = 3; // first = cold, next 2 = warm

// ─── Mint a session ────────────────────────────────────────────────────────

async function mintSession() {
  // Path A: admin generate_link → returns access_token in some Supabase
  // versions. We'll attempt this first.
  console.log(`[auth] Attempting admin generate_link for ${PERF_TEST_EMAIL} ...`);
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
      method: "POST",
      headers: {
        apikey: SERVICE_ROLE,
        Authorization: `Bearer ${SERVICE_ROLE}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ type: "magiclink", email: PERF_TEST_EMAIL }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      console.log(`[auth] generate_link failed: HTTP ${res.status} — ${JSON.stringify(body)?.slice(0, 200)}`);
    } else {
      // Some Supabase setups return access_token directly; others just return
      // an action_link (with a hashed token in the URL fragment) which is not
      // an access_token. Surface what we got and fall through if no token.
      const token = body?.properties?.access_token || body?.access_token || null;
      const refresh = body?.properties?.refresh_token || body?.refresh_token || null;
      if (token) {
        console.log(`[auth] OK — got access_token via generate_link (len=${token.length})`);
        return { access_token: token, refresh_token: refresh, source: "generate_link" };
      }
      // Try to extract token from action_link (fragment after #)
      const link = body?.properties?.action_link || body?.action_link || null;
      if (link) {
        try {
          const u = new URL(link);
          const frag = new URLSearchParams(u.hash.replace(/^#/, ""));
          const t = frag.get("access_token");
          const r = frag.get("refresh_token");
          if (t) {
            console.log(`[auth] OK — extracted access_token from action_link fragment`);
            return { access_token: t, refresh_token: r, source: "action_link_fragment" };
          }
        } catch {}
      }
      console.log(`[auth] generate_link returned no usable access_token; payload keys: ${Object.keys(body || {}).join(", ")}`);
    }
  } catch (e) {
    console.log(`[auth] generate_link threw: ${e.message?.slice(0, 200)}`);
  }

  // Path B: signInWithPassword fallback if PERF_TEST_PASSWORD is set.
  if (PERF_TEST_PASSWORD) {
    console.log(`[auth] Falling back to signInWithPassword ...`);
    const sb = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await sb.auth.signInWithPassword({
      email: PERF_TEST_EMAIL,
      password: PERF_TEST_PASSWORD,
    });
    if (error) {
      console.log(`[auth] signInWithPassword failed: ${error.message}`);
    } else if (data?.session?.access_token) {
      console.log(`[auth] OK — signed in via password`);
      return {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        source: "password",
      };
    }
  } else {
    console.log(`[auth] PERF_TEST_PASSWORD not set; skipping password fallback.`);
  }

  return null;
}

// ─── Build cookie header per @supabase/ssr convention ─────────────────────

function buildCookieHeader(session) {
  // @supabase/ssr stores the session as JSON-encoded array under
  // sb-<projectRef>-auth-token. The array shape (per supabase-js v2) is:
  //   [access_token, refresh_token, provider_token, provider_refresh_token]
  // For our purposes the first two are what server-side getUser() validates.
  // Note: when the JSON exceeds ~4KB, @supabase/ssr splits across multiple
  // cookies (-token.0, -token.1, ...). For an admin session the payload is
  // usually well under 4KB so a single cookie works.
  const cookieName = `sb-${projectRef}-auth-token`;
  const value = JSON.stringify([
    session.access_token,
    session.refresh_token || "",
    null,
    null,
  ]);
  // The cookie value must be percent-encoded so that brackets, quotes, and
  // commas survive HTTP transport.
  const encoded = encodeURIComponent(value);
  return `${cookieName}=${encoded}`;
}

// ─── Single timed GET ──────────────────────────────────────────────────────

async function timedGet(url, headers) {
  const t0 = performance.now();
  let status = 0, size = 0, redirectedTo = null;
  try {
    const res = await fetch(url, {
      method: "GET",
      headers,
      redirect: "manual", // we want to detect /login redirects
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    status = res.status;
    if (status >= 300 && status < 400) {
      redirectedTo = res.headers.get("location");
    }
    const body = await res.text();
    size = body.length;
  } catch (e) {
    const elapsed = performance.now() - t0;
    return { ms: Math.round(elapsed), status: 0, size: 0, error: e.message?.slice(0, 200) || String(e).slice(0, 200) };
  }
  const elapsed = performance.now() - t0;
  return { ms: Math.round(elapsed), status, size, redirectedTo };
}

// ─── Main ──────────────────────────────────────────────────────────────────

console.log("=".repeat(70));
console.log("PERF CAPTURE");
console.log("=".repeat(70));
console.log(`Base URL:    ${BASE_URL}`);
console.log(`Project ref: ${projectRef}`);
console.log(`Surfaces:    ${SURFACES.length}`);
console.log(`Reps each:   ${REPS} (1 cold + ${REPS - 1} warm)`);
console.log("");

const session = await mintSession();
if (!session) {
  console.error("ERROR: Could not mint a session. Aborting.");
  console.error("Set PERF_TEST_PASSWORD env var or check Supabase admin permissions.");
  process.exit(3);
}

// Attempt cookie auth first; fall back to Bearer if a probe redirects to /login.
let authMethod = "cookie";
const cookieHeader = buildCookieHeader(session);
const cookieHeaders = {
  Cookie: cookieHeader,
  "User-Agent": "fsi-perf-capture/1.0",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};
const bearerHeaders = {
  Authorization: `Bearer ${session.access_token}`,
  "User-Agent": "fsi-perf-capture/1.0",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

console.log("[auth] Probing root with cookie ...");
const probe = await timedGet(`${BASE_URL}/`, cookieHeaders);
if (probe.redirectedTo && /login/i.test(probe.redirectedTo)) {
  console.log(`[auth] Cookie probe redirected to ${probe.redirectedTo} — switching to Bearer.`);
  authMethod = "bearer";
} else if (probe.status >= 400) {
  console.log(`[auth] Cookie probe got HTTP ${probe.status} — switching to Bearer.`);
  authMethod = "bearer";
} else {
  console.log(`[auth] Cookie probe OK (HTTP ${probe.status}, ${probe.ms}ms).`);
}

const authHeaders = authMethod === "cookie" ? cookieHeaders : bearerHeaders;

// ─── Run ───────────────────────────────────────────────────────────────────

const ranAt = new Date().toISOString();
const results = [];

for (const path of SURFACES) {
  const url = `${BASE_URL}${path}`;
  console.log(`\n→ ${path}`);

  const samples = [];
  for (let r = 0; r < REPS; r++) {
    const out = await timedGet(url, authHeaders);
    const tag = r === 0 ? "cold" : `warm${r}`;
    samples.push({ tag, ...out });
    if (out.error) {
      console.log(`    ${tag}: ERROR (${out.ms}ms) — ${out.error}`);
    } else {
      const flag = out.redirectedTo
        ? ` → ${out.redirectedTo.slice(0, 50)}`
        : "";
      console.log(`    ${tag}: ${out.status} ${out.ms}ms (${(out.size / 1024).toFixed(1)} kB)${flag}`);
    }
  }

  const cold = samples[0];
  const warms = samples.slice(1).filter((s) => !s.error);
  const warmMs = warms.map((s) => s.ms).sort((a, b) => a - b);
  const warmMin = warmMs[0] ?? null;
  const warmMax = warmMs[warmMs.length - 1] ?? null;
  const warmMedian = warmMs.length
    ? warmMs[Math.floor(warmMs.length / 2)]
    : null;

  // Auth-failed flag: any 30x to /login OR 401/403 on the cold sample
  let outcome = "ok";
  const anyAuthFail = samples.some(
    (s) => (s.status === 401 || s.status === 403) ||
           (s.redirectedTo && /login/i.test(s.redirectedTo))
  );
  if (anyAuthFail) outcome = "auth-failed";
  else if (samples.some((s) => s.error)) outcome = "error";

  results.push({
    path,
    outcome,
    cold_ms: cold.ms,
    cold_status: cold.status,
    cold_redirect: cold.redirectedTo || null,
    warm_min_ms: warmMin,
    warm_median_ms: warmMedian,
    warm_max_ms: warmMax,
    status: samples[samples.length - 1].status,
    size_kb: samples[samples.length - 1].size
      ? +(samples[samples.length - 1].size / 1024).toFixed(1)
      : 0,
    samples,
  });
}

// ─── Console table ─────────────────────────────────────────────────────────

console.log("\n" + "=".repeat(70));
console.log("SUMMARY");
console.log("=".repeat(70));
console.table(
  results.map((r) => ({
    path: r.path,
    outcome: r.outcome,
    status: r.status,
    cold_ms: r.cold_ms,
    warm_min: r.warm_min_ms,
    warm_med: r.warm_median_ms,
    warm_max: r.warm_max_ms,
    size_kb: r.size_kb,
  }))
);

// ─── Persist JSON ─────────────────────────────────────────────────────────

const report = {
  ran_at: ranAt,
  base_url: BASE_URL,
  auth_method: authMethod,
  auth_source: session.source,
  project_ref: projectRef,
  surfaces_probed: SURFACES.length,
  reps_per_surface: REPS,
  results,
};

mkdirSync(dirname(REPORT_PATH), { recursive: true });
writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
console.log(`\nReport written: ${REPORT_PATH}`);
