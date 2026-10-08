// ADR-041 (Community is social only): the "promote" notification kind belonged to the retired
// editorial promotion path. Source-text check (dispatch.ts imports supabase-js; same constraint as
// the other .npmtest.mjs files). The DB CHECK notifications_kind_check still lists 'promote' until a
// population-stage migration; only the code surface is asserted gone.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const strip = (s) => s.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
const DISPATCH = strip(readFileSync(resolve(HERE, "dispatch.ts"), "utf8"));
const LIST = strip(
  readFileSync(resolve(HERE, "../../components/community/NotificationsList.tsx"), "utf8")
);

test("NotificationKind no longer includes promote", () => {
  const union = DISPATCH.match(/export type NotificationKind =([\s\S]*?);/)[1];
  const kinds = [...union.matchAll(/"(\w+)"/g)].map((m) => m[1]);
  assert.deepEqual(kinds, ["reply", "invite", "moderation", "mention", "archive", "assignment"]);
});

test("NotificationsList renders no promote kind (label or icon)", () => {
  assert.doesNotMatch(LIST, /promote/i);
  assert.doesNotMatch(LIST, /\bStar\b/);
});

test("NotificationsList labels and iconises the assignment kind (lane S8-A)", () => {
  assert.match(LIST, /assignment:\s*"Assigned"/);
  assert.match(LIST, /case "assignment":\s*return <UserCheck/);
});
