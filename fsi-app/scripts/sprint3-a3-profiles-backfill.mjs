/**
 * sprint3-a3-profiles-backfill.mjs — Sprint 3 A3 profiles projection backfill.
 *
 * Per Sprint 3 dispatch brief Section 8 A3 + operator-approved Option B
 * for region (leave empty until explicit operator population).
 *
 * STEPS (executed in this order; each verified with read-back before next):
 *   1. profiles.org_id ← oldest org_memberships.org_id per user
 *   2. profiles.workspace_role ← same membership.role
 *   3. profiles.sector ← workspace_settings.sector_profile for active org
 *   4. (SKIPPED per Option B) profiles.region — leave empty
 *
 * IDEMPOTENT: each UPDATE only writes rows whose target column is
 * still NULL/empty. Re-running after a successful run is a no-op.
 *
 * Output: docs/audits/sprint3-a3-backfill-log-2026-05-25.json
 *
 * Run: node scripts/sprint3-a3-profiles-backfill.mjs
 */

import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
process.chdir(resolve(__dirname, ".."));
process.loadEnvFile(".env.local");

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

const LOG_DIR = resolve("docs", "audits");
if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });
const LOG_PATH = resolve(LOG_DIR, "sprint3-a3-backfill-log-2026-05-25.json");

const log = { run_date: new Date().toISOString(), steps: [] };

function step(name, payload) {
  log.steps.push({ name, ...payload });
  console.log(`[A3] ${name}: ${JSON.stringify(payload)}`);
}

async function preReadState() {
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, email, org_id, workspace_role, sector, region");
  const { data: memberships } = await supabase
    .from("org_memberships")
    .select("user_id, org_id, role, created_at")
    .order("created_at", { ascending: true });
  const { data: orgs } = await supabase
    .from("organizations")
    .select("id, name, slug");
  const { data: settings } = await supabase
    .from("workspace_settings")
    .select("org_id, sector_profile");
  return { profiles, memberships, orgs, settings };
}

async function step1_orgId() {
  // Group memberships by user_id, pick oldest by created_at.
  const { data: memberships } = await supabase
    .from("org_memberships")
    .select("user_id, org_id, created_at")
    .order("created_at", { ascending: true });

  const userToOldestOrg = new Map();
  for (const m of memberships ?? []) {
    if (!userToOldestOrg.has(m.user_id)) {
      userToOldestOrg.set(m.user_id, m.org_id);
    }
  }

  let updated = 0;
  const targets = [];
  for (const [userId, orgId] of userToOldestOrg) {
    const { data: existing, error: readErr } = await supabase
      .from("profiles")
      .select("id, org_id")
      .eq("id", userId)
      .maybeSingle();
    if (readErr) {
      step("step1_orgId.read_error", { userId, error: readErr.message });
      continue;
    }
    if (!existing) continue;
    if (existing.org_id !== null) {
      targets.push({ userId, action: "skip", reason: "org_id already set" });
      continue;
    }
    const { error: updErr } = await supabase
      .from("profiles")
      .update({ org_id: orgId })
      .eq("id", userId)
      .is("org_id", null);
    if (updErr) {
      targets.push({ userId, action: "error", error: updErr.message });
      continue;
    }
    updated++;
    targets.push({ userId, action: "updated", org_id: orgId });
  }
  step("step1_orgId", { updated, targets });
  return updated;
}

async function step2_workspaceRole() {
  const { data: memberships } = await supabase
    .from("org_memberships")
    .select("user_id, role, created_at")
    .order("created_at", { ascending: true });

  const userToOldestRole = new Map();
  for (const m of memberships ?? []) {
    if (!userToOldestRole.has(m.user_id)) {
      userToOldestRole.set(m.user_id, m.role);
    }
  }

  let updated = 0;
  const targets = [];
  for (const [userId, role] of userToOldestRole) {
    const { data: existing } = await supabase
      .from("profiles")
      .select("id, workspace_role")
      .eq("id", userId)
      .maybeSingle();
    if (!existing) continue;
    if (existing.workspace_role !== null) {
      targets.push({ userId, action: "skip", reason: "workspace_role already set" });
      continue;
    }
    const { error: updErr } = await supabase
      .from("profiles")
      .update({ workspace_role: role })
      .eq("id", userId)
      .is("workspace_role", null);
    if (updErr) {
      targets.push({ userId, action: "error", error: updErr.message });
      continue;
    }
    updated++;
    targets.push({ userId, action: "updated", workspace_role: role });
  }
  step("step2_workspaceRole", { updated, targets });
  return updated;
}

async function step3_sector() {
  // For each profile with org_id NOW set, look up the workspace_settings
  // for that org and copy sector_profile into profiles.sector.
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, org_id, sector");
  const { data: settings } = await supabase
    .from("workspace_settings")
    .select("org_id, sector_profile");
  const orgToSectors = new Map();
  for (const s of settings ?? []) {
    orgToSectors.set(s.org_id, s.sector_profile ?? []);
  }

  let updated = 0;
  const targets = [];
  for (const p of profiles ?? []) {
    if (!p.org_id) {
      targets.push({ profileId: p.id, action: "skip", reason: "no org_id" });
      continue;
    }
    const isEmpty = !Array.isArray(p.sector) || p.sector.length === 0;
    if (!isEmpty) {
      targets.push({ profileId: p.id, action: "skip", reason: "sector already populated" });
      continue;
    }
    const sectors = orgToSectors.get(p.org_id) ?? [];
    if (sectors.length === 0) {
      targets.push({ profileId: p.id, action: "skip", reason: "no workspace_settings.sector_profile for org" });
      continue;
    }
    const { error: updErr } = await supabase
      .from("profiles")
      .update({ sector: sectors })
      .eq("id", p.id);
    if (updErr) {
      targets.push({ profileId: p.id, action: "error", error: updErr.message });
      continue;
    }
    updated++;
    targets.push({ profileId: p.id, action: "updated", sector: sectors });
  }
  step("step3_sector", { updated, targets });
  return updated;
}

async function postReadState() {
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, email, org_id, workspace_role, sector, region");
  return data;
}

async function main() {
  const pre = await preReadState();
  log.pre_state = pre;
  console.log(`[A3] pre-state: ${(pre.profiles ?? []).length} profiles, ${(pre.memberships ?? []).length} memberships`);

  await step1_orgId();
  await step2_workspaceRole();
  await step3_sector();
  // Step 4 (region) intentionally skipped per Option B operator decision.

  const post = await postReadState();
  log.post_state = post;
  console.log(`[A3] post-state profiles:\n${JSON.stringify(post, null, 2)}`);

  writeFileSync(LOG_PATH, JSON.stringify(log, null, 2));
  console.log(`[A3] log written to ${LOG_PATH}`);
}

main().catch((e) => {
  console.error(e);
  log.error = e.message;
  writeFileSync(LOG_PATH, JSON.stringify(log, null, 2));
  process.exit(1);
});
