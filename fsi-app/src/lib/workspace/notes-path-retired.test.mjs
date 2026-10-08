// notes-path-retired.test.mjs (lane S8-A, 2026-10-07, coordinator ruling: two notes surfaces is not acceptable, never a
// second copy). Private workspace notes live in item_notes (migration 358) behind the shared Notes section DetailShell
// mounts on every detail page. The old single text field, workspace_item_overrides.notes, is RETIRED as a notes path:
// nothing writes it and nothing reads it. The column stays until the data move has run (two-track); a later migration
// drops it. Source-text checks (these files import npm packages, so they cannot be loaded here), same convention as
// dispatch-kinds.npmtest.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
const read = (rel) => strip(readFileSync(resolve(SRC, rel), "utf8"));

test("the Market detail page mounts no second notes surface: no NotesField, no initialNote, no Your notes card", () => {
  const src = read("components/pages/MarketSignalDetailSurface.tsx");
  assert.doesNotMatch(src, /NotesField/);
  assert.doesNotMatch(src, /initialNote/);
  assert.doesNotMatch(src, /Your notes/i);
  assert.doesNotMatch(src, /"\/api\/workspace\/overrides"/, "the surface no longer writes overrides at all");
});

test("the shell is the one notes mount: DetailPageWrapper renders ItemCollabSlot, which mounts ItemNotesBlock", () => {
  const src = read("components/detail/DetailShell.tsx");
  assert.match(src, /<ItemCollabSlot \/>/);
  assert.match(src, /<ItemNotesBlock itemId=\{itemId\} \/>/);
  assert.equal((src.match(/<ItemNotesBlock\b/g) ?? []).length, 1, "mounted exactly once");
});

test("/api/workspace/overrides no longer writes notes: a notes key is refused with a pointer to the notes route", () => {
  const src = read("app/api/workspace/overrides/route.ts");
  assert.doesNotMatch(src, /update\.notes\b/);
  assert.match(src, /"notes" in body[\s\S]{0,300}status: 400/);
  assert.match(src, /\/api\/workspace\/items\//);
});

test("the override read path no longer selects or maps notes (supabase-server, bootstrap hook type, hydration, store)", () => {
  const server = read("lib/supabase-server.ts");
  const block = server.slice(server.indexOf("export interface WorkspaceOverrideRow"), server.indexOf("export function mapOverrideRows"));
  assert.ok(block.length > 500, "the override block was located");
  assert.doesNotMatch(block, /\bnotes\b/);
  const mapper = server.slice(server.indexOf("export function mapOverrideRows"), server.indexOf("export function mapOverrideRows") + 900);
  assert.doesNotMatch(mapper, /\bnotes\b/);
  assert.doesNotMatch(read("lib/hooks/useWorkspaceOverridesHydration.ts"), /\bnotes\b/);
  const boot = read("lib/hooks/useWorkspaceBootstrap.ts");
  assert.doesNotMatch(boot.slice(boot.indexOf("export interface BootstrapOverrideRow"), boot.indexOf("export interface WorkspaceBootstrapData")), /\bnotes\b/);
  const store = read("stores/resourceStore.ts");
  assert.doesNotMatch(store.slice(store.indexOf("export interface WorkspaceOverride"), store.indexOf("export interface WorkspaceOverride") + 900), /\bnotes\b/);
  assert.doesNotMatch(store, /\bnotes:\s*""/, "no store action builds an override with a notes default");
});
