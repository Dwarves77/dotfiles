// Structural regression test for src/components/onboarding/OnboardingWizard.tsx (FOLD-56, F9).
// No JSX render harness exists in this repo (see DetailShell.npmtest.mjs's own header for the same
// constraint) — this reads the component's source text to guard the one contract F9 binds: step 4
// ("Briefing") is built from the SAME BriefingScheduleSection Settings mounts, not a page-local
// duplicate, and the notification-defaults seed on step transition (a separate concern) survives
// the swap unchanged.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "OnboardingWizard.tsx"),
  "utf8"
);

test("step 4 imports and mounts the SAME BriefingScheduleSection Settings uses, not a page-local form", () => {
  assert.match(SOURCE, /import \{ BriefingScheduleSection \} from "@\/components\/settings\/BriefingScheduleSection"/);
  const stepBody = SOURCE.slice(SOURCE.indexOf("function StepBriefing"), SOURCE.indexOf("function StepBriefing") + 1500);
  assert.match(stepBody, /<BriefingScheduleSection\s*\/>/);
});

test("StepBriefing no longer mounts NotificationPreferences (a different concern — notification-channel toggles, not the briefing schedule)", () => {
  const stepBody = SOURCE.slice(SOURCE.indexOf("function StepBriefing"), SOURCE.indexOf("function StepBriefing") + 1500);
  assert.doesNotMatch(stepBody, /<NotificationPreferences/);
});

test("the notification-defaults seed on entering step 4 is unchanged by the swap (a separate write, not step 4's own render)", () => {
  assert.match(SOURCE, /seedNotificationDefaults/);
  assert.match(SOURCE, /DEFAULT_NOTIFICATION_PREFS/);
});

test("step 4 is still wired into the stepper at step === 4", () => {
  assert.match(SOURCE, /step === 4 && <StepBriefing \/>/);
});

// ── the artboard's "← Back" link (lane lists60, 2026-09-08) ─────────────────────────────────────
// Artboard 17/id="p17" draws "← Back" in the footer row of the step it renders (step 2). The build
// renders it from step 3 onward and renders an empty placeholder at step 2, and that is the correct
// composition, not a missing region: this wizard STARTS at step 2, because step 1 (Workspace) is a
// separate, already-completed flow with no route to return to — the stepper shows it with a ✓, not
// as a place the reader can go. A "← Back" at step 2 would navigate nowhere, which is precisely the
// dead control operator audit P0 1.1 ruled a defect. Logged in DEVIATION-LOG.md. Both halves of
// that decision are asserted here so neither can drift: the link EXISTS and is wired wherever there
// is a previous step, and it is withheld exactly where there is not.

test("the artboard's '← Back' link exists and is wired to the wizard's own previous-step function", () => {
  assert.match(SOURCE, /onClick=\{goBack\}/);
  assert.match(SOURCE, /← Back/);
});

test("Back renders only where a previous step exists — step 2 is the wizard's first step", () => {
  assert.match(SOURCE, /\{step > 2 \? \(/);
  // goBack itself refuses to move below step 2, so even a stray caller cannot land on a step 1 the
  // wizard does not render.
  assert.match(SOURCE, /const goBack = \(\) => \{\s*\n\s*if \(step === 2\) return;/);
});
