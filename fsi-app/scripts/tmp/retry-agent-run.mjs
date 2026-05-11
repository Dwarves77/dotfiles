// Retry /api/agent/run for a single sourceUrl. Used to retry icom-cc
// after a transient Cloudflare block on first attempt.
//
// Usage:
//   node scripts/tmp/retry-agent-run.mjs <sourceUrl>

import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
process.loadEnvFile(resolve(__dirname, "..", "..", ".env.local"));

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const APP_URL = (process.env.APP_URL || "https://carosledge.com").replace(/\/+$/, "");
const ADMIN_EMAIL =
  process.env.DRAIN_WORKER_EMAIL ||
  process.env.ADMIN_EMAIL ||
  "jasonlosh@hotmail.com";

const sourceUrl = process.argv[2];
if (!sourceUrl) {
  console.error("Usage: node retry-agent-run.mjs <sourceUrl>");
  process.exit(1);
}

const service = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });

async function mintAccessToken() {
  const { data: linkData } = await service.auth.admin.generateLink({
    type: "magiclink",
    email: ADMIN_EMAIL,
  });
  const otp = linkData?.properties?.email_otp;
  const { data: sessionData } = await anon.auth.verifyOtp({
    email: ADMIN_EMAIL,
    token: otp,
    type: "magiclink",
  });
  return sessionData?.session?.access_token;
}

const token = await mintAccessToken();
console.log(`POST ${APP_URL}/api/agent/run with sourceUrl=${sourceUrl}`);
const start = Date.now();
const resp = await fetch(`${APP_URL}/api/agent/run`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
  body: JSON.stringify({ sourceUrl, bypassPause: true }),
});
const text = await resp.text();
console.log(`-> ${resp.status} in ${Date.now() - start}ms`);
console.log(text.slice(0, 1000));
