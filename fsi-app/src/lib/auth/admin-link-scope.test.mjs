// PROOF (lane AUTH-IDENTITY, 2026-09-24). Operator ruling: "Admin only needs one access point", the
// Sidebar footer Admin row (src/components/Sidebar.tsx, gated by the shared platform-admin predicate,
// src/lib/auth/platform-admin-gate.ts). Everything else in the app must reach /admin through THAT one
// row, never a link of its own. This is the class fix: a component that grows a new `/admin` href in
// the future (a card, a banner, a queue notice) fails THIS test, not a design review months later.
//
// Removed by this lane (all customer-visible, none admin-gated):
//   - src/components/profile/UserProfilePage.tsx  (the "Admin" AccountCard, "Open admin ->")
//   - src/components/community/CommunityRooms.tsx (two "Admin pickups (N pending)" links)
//   - src/components/regulations/RegulationDetailSurface.tsx (an "/admin -> Integrity flags" link
//     inside the self-flagged-integrity-concern banner shown on a customer-facing regulation page)
//
// SCOPE. Every tracked *.tsx under fsi-app/src, except:
//   - src/app/admin/**            (the admin app itself; every route there legitimately points at /admin)
//   - src/components/admin/**     (admin-only helper components: internal navigation within the admin
//                                   dashboard, e.g. PartsList.tsx -> /admin/parts, is not a new entry
//                                   point from a non-admin surface; operator ruling 2026-09-24)
//   - src/components/Sidebar.tsx  (the one sanctioned entry point)
//
// Runs in the no-npm discipline node --test glob (src/**/*.test.mjs). Imports node builtins only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..", "..", "..");
const FSI_APP = resolve(REPO_ROOT, "fsi-app");

const EXEMPT_PREFIXES = ["src/app/admin/", "src/components/admin/"];
const EXEMPT_FILES = ["src/components/Sidebar.tsx"];

// A `/admin` route string (bare, or with a path/hash/query tail) inside a quote or template literal:
// href="/admin", href='/admin', href={`/admin/${x}`}, href="/admin#integrity-flags". Requires a
// quote/backtick immediately before "/admin", a negative lookahead so "/admin" is not immediately
// followed by a word character (excludes "/administer"), and a closing quote/backtick somewhere after,
// so it does not false-trip on a bare code comment mentioning the word without a quoted route.
const ADMIN_LINK_RE = /[`"']\/admin(?![\w-])[^`"']*[`"']/;

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

function trackedTsxFiles() {
  const out = execFileSync(
    "git",
    ["ls-files", "-z", "--", "fsi-app/src/**/*.tsx"],
    { cwd: REPO_ROOT, encoding: "utf8" }
  );
  return out.split("\0").filter(Boolean).sort();
}

function isExempt(repoRelPath) {
  // repoRelPath is "fsi-app/src/..."; normalize to the "src/..." form used by the allow-list above.
  const rel = repoRelPath.replace(/^fsi-app\//, "");
  if (EXEMPT_FILES.includes(rel)) return true;
  return EXEMPT_PREFIXES.some((p) => rel.startsWith(p));
}

test("no component outside src/app/admin/**, src/components/admin/** and Sidebar.tsx links to /admin", () => {
  const files = trackedTsxFiles();
  assert.ok(files.length > 0, "git ls-files returned zero tracked .tsx files under fsi-app/src, discovery is broken");

  const violations = [];
  for (const repoRelPath of files) {
    if (isExempt(repoRelPath)) continue;
    const abs = resolve(REPO_ROOT, repoRelPath);
    const raw = readFileSync(abs, "utf8");
    const code = stripComments(raw);
    const lines = code.split("\n");
    lines.forEach((line, i) => {
      if (ADMIN_LINK_RE.test(line)) {
        violations.push(`${repoRelPath}:${i + 1}: ${line.trim()}`);
      }
    });
  }

  assert.deepEqual(
    violations,
    [],
    `found /admin link(s) outside the one sanctioned entry point (Sidebar.tsx):\n${violations.join("\n")}`
  );
});

test("sanity: Sidebar.tsx itself still carries the one /admin entry point", () => {
  const raw = readFileSync(resolve(FSI_APP, "src/components/Sidebar.tsx"), "utf8");
  assert.match(stripComments(raw), /href="\/admin"/, "Sidebar.tsx must still render the Admin row link");
});
