// Golden for the admin human-gate phrase scan (Unit 0c Part 4). A human-gate phrase OUTSIDE the allowlist trips;
// allowlisted controls (emergency-stop / SC-3 override / community) pass; the post-relabel visibility copy passes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { scanAdminPhrases, isAllowlisted } from "./admin-phrase-scan.mjs";

test("TRIPS: a human-gate phrase outside the allowlist is flagged", () => {
  const hits = scanAdminPhrases([
    { path: "a.tsx", text: `sub: "Discovered URLs awaiting promote / reject",` },
    { path: "b.tsx", text: `Each row needs a human decision.` },
    { path: "c.tsx", text: `Editorial draft-staging queue. Each row is an intelligence item awaiting publish-decision.` },
    { path: "d.tsx", text: `Worker-staged regulations awaiting approval` },
  ]);
  // one hit per flagged line (the scan reports the line; it stops at the first forbidden phrase on it).
  assert.equal(hits.length, 4);
  assert.deepEqual([...new Set(hits.map((h) => h.path))].sort(), ["a.tsx", "b.tsx", "c.tsx", "d.tsx"]);
});

test("ALLOWLIST passes: emergency-stop / SC-3 override / community controls are legitimate human levers", () => {
  assert.equal(isAllowlisted(`<button>Release the emergency stop</button>`), true);
  assert.equal(isAllowlisted(`label: "Resume processing (pause release)"`), true);
  assert.equal(isAllowlisted(`Set tier_override — requires approval by the operator (SC-3)`), true);
  assert.equal(isAllowlisted(`Community moderation: promote-to-public needs a human decision`), true);
  // scan skips allowlisted lines even when they contain a forbidden phrase:
  const hits = scanAdminPhrases([
    { path: "emergency.tsx", text: `Emergency stop: pending your approval to resume` },
    { path: "community.tsx", text: `Community post awaiting approval before promote-to-public` },
    { path: "tier.tsx", text: `SC-3 tier_override requires your approval` },
  ]);
  assert.equal(hits.length, 0, "allowlisted human-control lines are exempt");
});

test("NEGATION / retirement context passes (the gate is denied, not asserted)", () => {
  const hits = scanAdminPhrases([
    { path: "a.tsx", text: `// Approve / reject RETIRED (Unit 0c): the machine gates ARE the approval.` },
    { path: "b.tsx", text: `staged-updates surface is VISIBILITY-ONLY — there is no human approve/reject.` },
    { path: "c.tsx", text: `Resolves via the intake cycle. No human approve/reject.` },
  ]);
  assert.equal(hits.length, 0, "retirement + negation copy must not trip (the gate is being removed)");
});

test("POST-RELABEL visibility copy PASSES (the six Unit-0c sites)", () => {
  const relabeled = [
    { path: "AdminDashboard.tsx", text: `sub: "Staged intelligence — machine-gated intake, visibility only (moved from customer-facing /research per design rebuild).", tabs: ["Staged"],` },
    { path: "ResearchPipelineQueueView.tsx", text: `Staged intelligence queue. Each row shows an item's machine-gated disposition (staged / minted / rejected + why) — visibility, not a gate.` },
    { path: "FlagsRejectionsQueue.tsx", text: `Each row shows the agent's concern; the disposition is machine-gated.` },
    { path: "AdminIssuesRail.tsx", text: `sub: "Discovered URLs — machine-gated dedup / mint (visibility)",` },
    { path: "AdminIssuesRail.tsx", text: `sub: "Worker-staged regulations — machine-gated intake (visibility)",` },
    { path: "IntegrityFlagsView.tsx", text: `Each row is surfaced for visibility; the disposition is machine-gated.` },
    { path: "UserProfilePage.tsx", text: `view staged items →` },
  ];
  assert.deepEqual(scanAdminPhrases(relabeled), []);
});
