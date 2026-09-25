// Structural regression test for src/components/ui/ActionRow.tsx (lane uiactions, 2026-09-07).
//
// WHY A TEXT-LEVEL TEST. This repo has no JSX mount infrastructure for a plain `node --test` run
// (see WatchButton.npmtest.mjs / DetailShell.npmtest.mjs's own headers for the same constraint) —
// the rendering guard's Playwright detail-surfaces smoke spec is the real-DOM check. This file
// guards the specific contract points design ruling R5 and the delta brief bind: the four detail
// surfaces share ONE ActionRow rather than four forked copies, the + Tag trigger renders nothing
// without an onTag handler (the workspace-tags lane fills it in later), and the button chrome
// matches the spec (padding 8px 14px, radius 6, primary ink #5A5552, secondary border rgba(0,0,0,.25)).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(resolve(DIR, "ActionRow.tsx"), "utf8");

test("ActionRow renders exactly Export brief, Share, the watch slot, and a conditional + Tag pill", () => {
  assert.match(SOURCE, /Export brief/);
  assert.match(SOURCE, />\s*Share\s*</);
  assert.match(SOURCE, /\{watch\}/, "the watch button is a caller-supplied slot, not reimplemented here");
  assert.match(SOURCE, /\{onTag && \(/, "+ Tag must be conditionally rendered, not always-on");
  assert.match(SOURCE, /\+ Tag/);
});

test("the + Tag trigger takes onTag as an OPTIONAL prop (the tags lane fills it in; absent here renders nothing)", () => {
  assert.match(SOURCE, /onTag\?:\s*\(\)\s*=>\s*void;/);
});

test("button chrome matches spec: padding 8px 14px, radius var(--radius-control) (6px token), secondary border rgba(0,0,0,.25)", () => {
  assert.match(SOURCE, /padding:\s*"8px 14px"/);
  assert.match(SOURCE, /borderRadius:\s*"var\(--radius-control\)"/);
  assert.match(SOURCE, /rgba\(0,0,0,\.25\)/);
});

test("primary (Export brief) uses ink var(--brand) fill with white text, not a second hardcoded color", () => {
  const primaryBranch = SOURCE.slice(SOURCE.indexOf("const primary = variant"));
  assert.match(primaryBranch, /background:\s*primary \? "var\(--brand\)"/);
  assert.match(primaryBranch, /color:\s*primary \? "#fff"/);
});

test("shareResource and downloadMarkdownBrief are exported for reuse by all four detail surfaces (no per-surface fork)", () => {
  assert.match(SOURCE, /export function shareResource/);
  assert.match(SOURCE, /export function downloadMarkdownBrief/);
});

// Operator check 2 (lane PARITY-PARTS, 2026-09-24) completed what lane W10-ActionCard-b started for
// regulations only: all four detail surfaces now mount ONE <ActionCard> (band pill + action row +
// exposure + timeline, rendered inside the masthead card via Masthead's own actionSlot), never a
// direct ActionRow import or a page-local exportBriefAsMarkdown/shareCurrent reimplementation. The
// two former tests here (one for regulations via ActionCard, one for the "three unrefactored"
// surfaces still importing ActionRow directly) are ONE test now, since there is no longer an
// unrefactored surface to hold to a different rule.
test("all four detail surfaces reuse ActionRow indirectly via the shared ActionCard part, never a page-local copy", () => {
  const surfaces = [
    "../regulations/RegulationDetailSurface.tsx",
    "../pages/MarketSignalDetailSurface.tsx",
    "../research/ResearchFindingDetailSurface.tsx",
    "../operations/OperationsDetailSurface.tsx",
  ];
  for (const rel of surfaces) {
    const src = readFileSync(resolve(DIR, rel), "utf8");
    assert.match(
      src,
      /import \{ shareResource, downloadMarkdownBrief \} from "@\/components\/ui\/ActionRow"/,
      `${rel} must import shareResource/downloadMarkdownBrief from the shared ActionRow part`
    );
    assert.doesNotMatch(
      src,
      /import \{ ActionRow[,\s]/,
      `${rel} must not import ActionRow directly - it renders via ActionCard`
    );
    assert.match(
      src,
      /import \{ ActionCard \} from "@\/components\/ui\/ActionCard"/,
      `${rel} must render ActionRow via the shared ActionCard part, not inline`
    );
    assert.doesNotMatch(
      src,
      /function exportBriefAsMarkdown/,
      `${rel} must not keep its own local exportBriefAsMarkdown copy`
    );
    assert.doesNotMatch(
      src,
      /function shareCurrent/,
      `${rel} must not keep its own local shareCurrent copy`
    );
  }

  const actionCardSrc = readFileSync(resolve(DIR, "ActionCard.tsx"), "utf8");
  assert.match(
    actionCardSrc,
    /import \{ ActionRow \} from "@\/components\/ui\/ActionRow"/,
    "ActionCard.tsx must import the shared ActionRow part"
  );
});
