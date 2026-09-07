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
