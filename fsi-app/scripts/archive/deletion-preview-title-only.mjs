/**
 * _deletion-preview-title-only.mjs
 *
 * Read-only Task 1 re-run with title-only pattern matching.
 * Reasoning per Claude Code review: the prior preview matched title +
 * summary + full_brief, which produced 6 false positives in a 12-row
 * sample (legitimate research briefs that mention Cloudflare or
 * security-check in passing got swept). Title-only is the right scope
 * because garbage extractions have titles literally describing fetch
 * failures.
 *
 * No DELETE, no UPDATE. Outputs JSON for the doc generator.
 */

import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { writeFileSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FSI_APP_ROOT = resolve(__dirname, "..");
process.loadEnvFile(resolve(FSI_APP_ROOT, ".env.local"));

const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const TITLE_GARBAGE_PATTERNS = [
  { name: "blocked", re: /cloudflare|just a moment|checking your browser|attention required|challenge[- ]platform|captcha|recaptcha|hcaptcha|security (check|verification)|access (denied|restricted|issue|error)|please verify you are human|enable javascript|page verification|website (security|access|verification)|verification (page|portal)/i },
  { name: "not_found", re: /404( error| not found| page)?|page not found|no longer (available|exists)|requested url .+ not found|page (has moved|cannot be found|doesn'?t exist)|page error|directory and services portal.*404|website page not found/i },
  { name: "maintenance", re: /under maintenance|temporarily unavailable|service unavailable|we'?ll be back|scheduled maintenance|website service unavailable|feed unavailable|rss feed unavailable|feed change notice/i },
];

const { data: items, error } = await c
  .from("intelligence_items")
  .select("id, title, summary, source_id, source_url, item_type, domain, created_at")
  .order("created_at", { ascending: false });

if (error) { console.error(JSON.stringify({ error: error.message })); process.exit(1); }

const matched = [];
for (const it of items) {
  const title = (it.title || "").trim();
  const reasons = [];
  for (const p of TITLE_GARBAGE_PATTERNS) {
    if (p.re.test(title)) reasons.push(p.name);
  }
  if (reasons.length > 0) matched.push({ ...it, _reasons: reasons });
}

const knownTopicFailures = new Set(["eb08d16c-f51c-44bd-8f50-0fada86c67d4"]);
const titleHits = items.filter(it => /saeima|latvian.+parliament|latvia.+legislat/i.test(it.title || "") && !knownTopicFailures.has(it.id));
const topicFailures = [];
for (const id of knownTopicFailures) {
  const found = items.find(it => it.id === id);
  if (found) topicFailures.push(found);
}
for (const t of titleHits) topicFailures.push(t);

const allSourceIds = [...new Set([...matched, ...topicFailures].map(x => x.source_id).filter(Boolean))];
const { data: sources } = await c
  .from("sources")
  .select("id, name, url, tier")
  .in("id", allSourceIds.length > 0 ? allSourceIds : ["00000000-0000-0000-0000-000000000000"]);
const srcById = Object.fromEntries((sources || []).map(s => [s.id, s]));

const reasonBuckets = {};
for (const m of matched) for (const r of m._reasons) reasonBuckets[r] = (reasonBuckets[r] || 0) + 1;

const out = {
  total_items: items.length,
  hard_delete_count: matched.length,
  topic_failure_count: topicFailures.length,
  reason_buckets: reasonBuckets,
  hard_delete: matched,
  topic_failures: topicFailures,
  sources_by_id: srcById,
};

writeFileSync(resolve(FSI_APP_ROOT, "scripts/tmp/deletion-preview-title-only.json"), JSON.stringify(out, null, 2));
console.log("hard_delete_count:", matched.length);
console.log("reason_buckets:", JSON.stringify(reasonBuckets, null, 2));
console.log("topic_failures:", topicFailures.length);
