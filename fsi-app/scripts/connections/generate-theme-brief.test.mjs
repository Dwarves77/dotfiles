// generate-theme-brief.test.mjs — proves buildBriefBundle's member_hash inclusion, the JSON/MD
// payload parser, and the write-time member_hash staleness refusal (validateAgainstLiveMembers).
// Importing this module never invokes main() (IS_MAIN checks process.argv[1] against the test file).
import test from "node:test";
import assert from "node:assert/strict";
import { buildBriefBundle, parseBriefPayload, validateAgainstLiveMembers } from "./generate-theme-brief.mjs";
import { computeMemberHash } from "../../src/lib/connections/brief-staleness.mjs";

// ── buildBriefBundle ─────────────────────────────────────────────────────────────────────────────

test("buildBriefBundle: member_hash matches computeMemberHash SoT exactly (the ONE recipe)", () => {
  const theme = { id: "theme-1", member_ids: ["b", "a", "c"], dominant_signals: [], surfaces: [], convergence: 1.2, pivots: [] };
  const bundle = buildBriefBundle(theme, [], [], []);
  assert.equal(bundle.member_hash, computeMemberHash(["b", "a", "c"]));
  assert.equal(bundle.member_count, 3);
  assert.equal(bundle.theme_id, "theme-1");
});

test("buildBriefBundle: carries members, intra-theme edges, and forward events through unchanged", () => {
  const theme = { id: "theme-1", member_ids: ["a", "b"] };
  const members = [{ id: "a", title: "Item A" }, { id: "b", title: "Item B" }];
  const edges = [{ source_item_id: "a", target_item_id: "b", score: 0.5 }];
  const events = [{ id: "ev1", intelligence_item_id: "a" }];
  const bundle = buildBriefBundle(theme, members, edges, events);
  assert.deepEqual(bundle.members, members);
  assert.deepEqual(bundle.intra_theme_edges, edges);
  assert.deepEqual(bundle.forward_events, events);
});

// ── parseBriefPayload ────────────────────────────────────────────────────────────────────────────

test("parseBriefPayload: valid JSON payload parses all four required fields", () => {
  const content = JSON.stringify({ theme_id: "t1", title: "My Theme", brief_md: "# Brief\nBody", member_hash: "abc123" });
  const r = parseBriefPayload("brief.json", content);
  assert.equal(r.ok, true);
  assert.equal(r.theme_id, "t1");
  assert.equal(r.title, "My Theme");
  assert.equal(r.brief_md, "# Brief\nBody");
  assert.equal(r.member_hash, "abc123");
});

test("parseBriefPayload: invalid JSON -> refused with a parse error", () => {
  const r = parseBriefPayload("brief.json", "{not valid json");
  assert.equal(r.ok, false);
  assert.match(r.error, /invalid JSON/);
});

test("parseBriefPayload: JSON missing a required field -> refused, names the missing field", () => {
  const r = parseBriefPayload("brief.json", JSON.stringify({ theme_id: "t1", title: "X" }));
  assert.equal(r.ok, false);
  assert.match(r.error, /brief_md/);
  assert.match(r.error, /member_hash/);
});

test("parseBriefPayload: Markdown with frontmatter parses theme_id/title/member_hash + body", () => {
  const md = `---\ntheme_id: t1\ntitle: My Theme\nmember_hash: abc123\n---\n# Brief\n\nBody text here.\n`;
  const r = parseBriefPayload("brief.md", md);
  assert.equal(r.ok, true);
  assert.equal(r.theme_id, "t1");
  assert.equal(r.title, "My Theme");
  assert.equal(r.member_hash, "abc123");
  assert.equal(r.brief_md, "# Brief\n\nBody text here.");
});

test("parseBriefPayload: Markdown without a frontmatter block -> refused", () => {
  const r = parseBriefPayload("brief.md", "# Just a brief, no frontmatter\n");
  assert.equal(r.ok, false);
  assert.match(r.error, /frontmatter/);
});

test("parseBriefPayload: unsupported extension -> refused", () => {
  const r = parseBriefPayload("brief.txt", "anything");
  assert.equal(r.ok, false);
  assert.match(r.error, /unsupported payload extension/);
});

test("parseBriefPayload: quoted frontmatter values are unquoted", () => {
  const md = `---\ntheme_id: "t1"\ntitle: 'My Theme'\nmember_hash: abc123\n---\nBody\n`;
  const r = parseBriefPayload("brief.md", md);
  assert.equal(r.ok, true);
  assert.equal(r.theme_id, "t1");
  assert.equal(r.title, "My Theme");
});

// ── validateAgainstLiveMembers ───────────────────────────────────────────────────────────────────

test("validateAgainstLiveMembers: matching hash -> ok, row assembled with fresh generated_at/generated_by", () => {
  const liveMembers = ["a", "b", "c"];
  const payload = { theme_id: "t1", title: "T", brief_md: "B", member_hash: computeMemberHash(liveMembers) };
  const r = validateAgainstLiveMembers(payload, liveMembers);
  assert.equal(r.ok, true);
  assert.equal(r.row.theme_id, "t1");
  assert.equal(r.row.member_hash, computeMemberHash(liveMembers));
  assert.equal(r.row.member_count, 3);
  assert.equal(r.row.title, "T");
  assert.equal(r.row.brief_md, "B");
  assert.equal(r.row.generated_by, "session-executor");
  assert.ok(r.row.generated_at);
});

test("validateAgainstLiveMembers: mismatched hash (membership drifted) -> refused, names both hashes", () => {
  const payload = { theme_id: "t1", title: "T", brief_md: "B", member_hash: "stale-hash" };
  const r = validateAgainstLiveMembers(payload, ["a", "b"]);
  assert.equal(r.ok, false);
  assert.match(r.error, /member_hash mismatch/);
  assert.match(r.error, /stale-hash/);
  assert.match(r.error, /Re-run --theme t1/);
});

test("validateAgainstLiveMembers: member re-ordering alone does not cause a mismatch (hash is order-independent)", () => {
  const payload = { theme_id: "t1", title: "T", brief_md: "B", member_hash: computeMemberHash(["b", "a", "c"]) };
  const r = validateAgainstLiveMembers(payload, ["c", "a", "b"]); // same set, different order
  assert.equal(r.ok, true);
});

test("validateAgainstLiveMembers: one member added since authoring -> mismatch, refused", () => {
  const payload = { theme_id: "t1", title: "T", brief_md: "B", member_hash: computeMemberHash(["a", "b"]) };
  const r = validateAgainstLiveMembers(payload, ["a", "b", "c"]);
  assert.equal(r.ok, false);
});
