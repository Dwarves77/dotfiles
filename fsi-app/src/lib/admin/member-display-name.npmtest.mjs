// The invariant: no raw identifier reaches the reader in place of a name, on any surface.
//
// The production defect this would have caught (click-through audit 2026-09-08, /admin): the
// WORKSPACES card's "Newest join" printed "a0764ff3… · owner". MembersPanel.tsx carried a display
// chain whose own header reads "DO-NOT-REVERT ... NO raw UUIDs render in member rows" — and ended in
// a `user_id.slice(0, 8)` fallback — while WorkspacesUsageRow.tsx did not use that chain at all and
// printed the sliced id unconditionally, never looking at the joined profile it was already given.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const APP = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": APP } });
const { memberDisplayName, NO_PROFILE_LABEL } = jiti("./member-display-name.ts");

const UUID = "a0764ff3-1c2d-4e5f-8a9b-0c1d2e3f4a5b";

test("the chain prefers full name, then display name, then email", () => {
  assert.equal(
    memberDisplayName({ user_id: UUID, user: { full_name: "Jane Roe", display_name: "jr", email: "j@x.com" } }),
    "Jane Roe"
  );
  assert.equal(memberDisplayName({ user_id: UUID, user: { display_name: "jr", email: "j@x.com" } }), "jr");
  assert.equal(memberDisplayName({ user_id: UUID, user: { email: "j@x.com" } }), "j@x.com");
});

test("blank and whitespace-only fields fall through rather than rendering empty", () => {
  assert.equal(memberDisplayName({ user_id: UUID, user: { full_name: "   ", display_name: "", email: "j@x.com" } }), "j@x.com");
});

test("a member with no usable profile renders the absence, never an identifier", () => {
  for (const m of [{ user_id: UUID }, { user_id: UUID, user: null }, { user_id: UUID, user: {} }, {}]) {
    const out = memberDisplayName(m);
    assert.equal(out, NO_PROFILE_LABEL);
    assert.ok(!out.includes(UUID.slice(0, 8)), "no UUID fragment reaches the reader");
  }
});

test("both admin surfaces read the one chain; neither slices an id of its own", () => {
  const files = ["components/admin/redesign/MembersPanel.tsx", "components/admin/redesign/WorkspacesUsageRow.tsx"];
  for (const rel of files) {
    const src = readFileSync(resolve(APP, rel), "utf8");
    assert.ok(src.includes('from "@/lib/admin/member-display-name"'), `${rel} imports the shared chain`);
    assert.ok(
      !/user_id[^\n]*\.slice\(/.test(src),
      `${rel} must not slice a user_id for display — that is the defect`
    );
  }
});
