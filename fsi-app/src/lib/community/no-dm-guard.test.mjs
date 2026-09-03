// no-dm-guard.test.mjs — proves spec 05 §6 acceptance criterion 5 ("direct messaging does not exist") by
// scanning the actual community API route tree, so a future PR that quietly adds a DM/messages endpoint
// fails THIS test rather than only violating an unenforced prose rule. fs use is confined to this *.test.mjs
// file — F34 (fitness) exempts test modules from the no-fs-at-module-scope rule; nothing under src/app or
// a page-reachable module performs this scan.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, statSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const COMMUNITY_API_ROOT = resolve(HERE, "..", "..", "app", "api", "community");

const DM_PATTERN = /\b(dm|direct-?message|private-?message|conversation)s?\b/i;

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
    } else {
      out.push(full);
    }
  }
  return out;
}

test("acceptance criterion 5: no direct-messaging route exists under /api/community", () => {
  const files = walk(COMMUNITY_API_ROOT);
  assert.ok(files.length > 0, "expected to find community API route files to scan");
  const offenders = files.filter((f) => DM_PATTERN.test(f.replace(COMMUNITY_API_ROOT, "")));
  assert.deepEqual(offenders, [], `direct-messaging-shaped route path(s) found: ${offenders.join(", ")}`);
});
