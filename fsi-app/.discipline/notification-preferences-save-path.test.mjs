// NOTIFICATION-PREFERENCES SAVE-PATH GUARD (Wave S1, 2026-08-31 — dispatch "the audit suspects saves
// may never have succeeded in production"). Pure STATIC scan (read source as text via node:fs, no TS
// import) so this runs in the depless discipline CI — same pattern as relationship-check-literals.test.mjs
// and vocab-drift-guard.test.mjs.
//
// WHAT WAS INVESTIGATED (end to end: settings UI -> notification_preferences table, no API route sits
// between them — src/components/profile/NotificationPreferences.tsx writes directly via the RLS-scoped
// browser client): the three defect classes named in the dispatch.
//   1. RLS mismatch  — self insert/update policies must key on `user_id = auth.uid()` (any auth.uid()
//      call form: bare, or migration 262's InitPlan-wrapped `(select auth.uid())`). If a future
//      migration narrowed or dropped either policy's predicate, this fails loud.
//   2. Wrong column  — every key the component upserts (besides `user_id`, the PK, and `updated_at`,
//      which is DB-computed by the `notification_preferences_updated_at` trigger and app-set only as a
//      best-effort hint) must exist as a real column on the live table, per migration 032. Read from the
//      migration text, not hand-copied, so a future column rename/drop updates this guard for free.
//   3. Swallowed error — the profiles-table precedent (migration 165's header: a plain `.update()` whose
//      RLS predicate silently matched 0 rows, "the UI reports 'saved' while nothing persists") is the
//      exact failure class the audit worried about here. NotificationPreferences.tsx uses `.upsert()`
//      against a table with a real PK+unique constraint on `user_id`, which turns an RLS mismatch into a
//      hard Postgres error rather than a silent 0-row match — but only if that error is actually surfaced
//      to `error`/`setError`, not discarded via the `.then(() => {}, () => {})` swallow idiom this repo
//      uses elsewhere (mint-item.ts) for genuinely non-fatal writes. The save path's upsert must NOT use
//      that idiom.
//
// CONCLUSION AT TIME OF WRITING (verified by this guard, re-verify by running it): all three hold. The
// schema, the RLS predicates, and the error handling are consistent — no live defect found by reading.
// This guard exists so the next migration or edit that breaks any of the three fails CI instead of
// shipping a UI that reports "Saved" while nothing persisted.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const FSI = resolve(dirname(fileURLToPath(import.meta.url)), ".."); // .discipline -> fsi-app

const MIGRATION_PATH = "supabase/migrations/032_community_notifications_moderation.sql";
const COMPONENT_PATH = "src/components/profile/NotificationPreferences.tsx";

const migrationText = readFileSync(resolve(FSI, MIGRATION_PATH), "utf8");
const componentText = readFileSync(resolve(FSI, COMPONENT_PATH), "utf8");

// ── Pure scanners (exported so the self-tests below can attack them with fixtures) ─────────────────────

/** Extract the column names of `create table if not exists notification_preferences ( ... );` in
 *  declaration order. Every non-blank line inside the block is `col_name TYPE ...,` — no CONSTRAINT
 *  lines exist in this table, so the first token of each line is the column name. */
export function extractTableColumns(sql) {
  const m = sql.match(
    /create table if not exists notification_preferences\s*\(([\s\S]*?)\n\);/i
  );
  if (!m) return null;
  return m[1]
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.split(/\s+/)[0]);
}

/** Extract the `with check (...)` / `using (...)` predicate text of a named policy block. */
export function extractPolicyPredicates(sql, policyName) {
  const re = new RegExp(
    `create policy\\s+"${policyName}"[\\s\\S]*?;`,
    "i"
  );
  const m = sql.match(re);
  if (!m) return null;
  const block = m[0];
  // One level of nested parens tolerated (auth.uid()'s own parens) — the predicates here never nest
  // deeper than that.
  const BALANCED = "((?:[^()]|\\([^()]*\\))*)";
  const using = block.match(new RegExp(`using\\s*\\(${BALANCED}\\)`, "i"))?.[1]?.trim() ?? null;
  const withCheck = block.match(new RegExp(`with check\\s*\\(${BALANCED}\\)`, "i"))?.[1]?.trim() ?? null;
  return { using, withCheck, block };
}

/** A predicate is a valid self-scoping RLS check iff it ties user_id to auth.uid(), in either the bare
 *  or migration-262 InitPlan-wrapped `(select auth.uid())` form, in either operand order. */
export function isSelfScoped(predicate) {
  if (!predicate) return false;
  const p = predicate.replace(/\s+/g, " ").trim();
  const authCall = "(?:auth\\.uid\\(\\)|\\(select auth\\.uid\\(\\)\\))";
  const re = new RegExp(`^(?:user_id\\s*=\\s*${authCall}|${authCall}\\s*=\\s*user_id)$`, "i");
  return re.test(p);
}

/** Pull the `.upsert(\n {...},\n { onConflict: "user_id" }\n)` payload object's top-level keys out of
 *  the component's `persist` function. Deliberately narrow (this file's actual shape) rather than a
 *  general object-literal parser — a general parser would hide a real shape change instead of failing
 *  the "keys I expected are still there" assertion below. */
export function extractUpsertPayloadKeys(tsx) {
  const m = tsx.match(/\.upsert\(\s*\{([\s\S]*?)\},\s*\{\s*onConflict/);
  if (!m) return null;
  return m[1]
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.includes(":"))
    .map((l) => l.split(":")[0].trim());
}

/** True iff the given call-site text (the `.upsert(...)` statement plus a trailing window) chains the
 *  fire-and-forget swallow idiom `.then(() => {}, () => {})` this repo uses for genuinely non-fatal
 *  writes (see mint-item.ts). The notification-preferences save must NOT use it — its error must reach
 *  the `error`/`setError` binding the component's error banner reads. */
export function usesSwallowIdiom(tsx) {
  const m = tsx.match(/\.upsert\(\s*\{[\s\S]*?\}\s*\)/);
  if (!m) return false;
  const start = tsx.indexOf(m[0]);
  const window = tsx.slice(start, start + m[0].length + 80);
  return /\.then\(\s*\(\)\s*=>\s*\{\}\s*,\s*\(\)\s*=>\s*\{\}\s*\)/.test(window);
}

// ── Live checks against the real migration + component ──────────────────────────────────────────────

const LIVE_COLUMNS = extractTableColumns(migrationText);

test("sanity: notification_preferences columns parsed from migration 032 match the verified live set", () => {
  assert.ok(LIVE_COLUMNS, "could not locate the notification_preferences CREATE TABLE block in migration 032");
  assert.deepEqual(LIVE_COLUMNS, [
    "user_id",
    "enabled",
    "on_mention",
    "on_reply_in_my_threads",
    "on_new_post_in_joined_groups",
    "on_invite",
    "on_promote",
    "channels",
    "updated_at",
  ]);
});

test("RLS: notification_preferences_insert_self checks user_id = auth.uid()", () => {
  const pred = extractPolicyPredicates(migrationText, "notification_preferences_insert_self");
  assert.ok(pred, "insert_self policy not found in migration 032");
  assert.ok(
    isSelfScoped(pred.withCheck),
    `insert_self WITH CHECK is not self-scoped to user_id = auth.uid(): "${pred.withCheck}"`
  );
});

test("RLS: notification_preferences_update_self checks user_id = auth.uid() on both USING and WITH CHECK", () => {
  const pred = extractPolicyPredicates(migrationText, "notification_preferences_update_self");
  assert.ok(pred, "update_self policy not found in migration 032");
  assert.ok(
    isSelfScoped(pred.using),
    `update_self USING is not self-scoped to user_id = auth.uid(): "${pred.using}"`
  );
  assert.ok(
    isSelfScoped(pred.withCheck),
    `update_self WITH CHECK is not self-scoped to user_id = auth.uid(): "${pred.withCheck}"`
  );
});

test("save path: every upserted key (besides updated_at, which is DB-computed) is a real column", () => {
  const keys = extractUpsertPayloadKeys(componentText);
  assert.ok(keys && keys.length > 0, "could not locate the persist() upsert payload in NotificationPreferences.tsx");
  const dbComputed = new Set(["updated_at"]);
  for (const k of keys) {
    if (dbComputed.has(k)) continue;
    assert.ok(
      LIVE_COLUMNS.includes(k),
      `NotificationPreferences.tsx upserts key "${k}" which is not a column on notification_preferences ` +
        `per migration 032 (columns: ${LIVE_COLUMNS.join(", ")})`
    );
  }
  // And the inverse for the user-facing toggle columns specifically (catches a silently DROPPED key,
  // not just an added wrong one) — user_id and updated_at are handled separately above.
  const togglesAndChannels = LIVE_COLUMNS.filter((c) => !["user_id", "updated_at"].includes(c));
  for (const c of togglesAndChannels) {
    assert.ok(keys.includes(c), `NotificationPreferences.tsx no longer upserts column "${c}" — a save would silently drop it`);
  }
});

test("save path: the upsert error is NOT discarded via the fire-and-forget swallow idiom", () => {
  assert.equal(
    usesSwallowIdiom(componentText),
    false,
    "the notification_preferences upsert call chains the .then(() => {}, () => {}) swallow idiom — its " +
      "error would never reach setError(), reproducing the profiles-table silent-save-failure class " +
      "(migration 165)"
  );
});

// ── Self-tests: prove the scanners are not vacuous (rule 15 — a guard is proven by attack) ─────────────

test("scanner self-test: isSelfScoped rejects a predicate scoped to a DIFFERENT column", () => {
  assert.equal(isSelfScoped("org_id = auth.uid()"), false);
});

test("scanner self-test: isSelfScoped accepts both the bare and migration-262 wrapped auth.uid() forms", () => {
  assert.equal(isSelfScoped("user_id = auth.uid()"), true);
  assert.equal(isSelfScoped("user_id = (select auth.uid())"), true);
});

test("scanner self-test: extractUpsertPayloadKeys catches a wrong-column-name fixture", () => {
  const fixture = `
    const { error } = await supabase
      .from("notification_preferences")
      .upsert(
        {
          user_id: userId,
          enabld: next.enabled,
          channels: next.channels,
        },
        { onConflict: "user_id" }
      );
  `;
  const keys = extractUpsertPayloadKeys(fixture);
  assert.ok(keys.includes("enabld"), "fixture setup: expected the typo'd key to be extracted");
  assert.equal(LIVE_COLUMNS.includes("enabld"), false, "the fixture's typo must not accidentally match a real column");
});

test("scanner self-test: usesSwallowIdiom catches the mint-item.ts-style swallow pattern on a fixture upsert", () => {
  const fixture = `
    await supabase
      .from("notification_preferences")
      .upsert({ user_id: userId, enabled: true })
      .then(() => {}, () => {});
  `;
  assert.equal(usesSwallowIdiom(fixture), true);
});
