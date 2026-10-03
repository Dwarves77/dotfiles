import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  // Lane R7-LINT-CI, 2026-10-01, operator-approved narrow exception (ESLint wired into CI for the
  // first time; the full-tree lint cleanup that followed found this codebase already has a wide,
  // pre-existing convention of prefixing a deliberately-unused parameter or destructured binding with
  // a leading underscore (e.g. src/lib/email/send-invitation-email.ts's `_params`, src/lib/llm/spend-
  // client.ts's `_itemId`/`_status`/`_sourceUrl`, src/lib/intake/apply-staged-update.ts's `_kd`/`_sn`/
  // `_al`). @typescript-eslint/no-unused-vars ships with no ignore pattern by default, so every one of
  // those sites still warned despite the naming already signaling intent. This is the rule being
  // objectively wrong for this repo's convention, not a loosening of what counts as unused: a binding
  // not prefixed with `_` is still flagged exactly as before.
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
  // Lane R7-LINT-CI, 2026-10-01, second named exception. tsconfig.json's own `exclude` already
  // carves `supabase/functions` out of this project's TypeScript checking: those files are Deno Edge
  // Functions, importing via Deno-only `jsr:`/`npm:` specifiers tsc/ESLint's type resolution cannot
  // follow at all, a different runtime from everything else this config lints. capture-worker/
  // index.ts already hand-documents its three loosely-typed `(supabase, row)` helper signatures with
  // `// deno-lint-ignore no-explicit-any`, Deno's own linter's equivalent marker, for the same reason.
  // Scoping `@typescript-eslint/no-explicit-any` off for this one already-excluded directory aligns
  // ESLint's boundary with the boundary tsconfig already drew; it changes nothing for any file this
  // config's type-aware rules can actually check.
  {
    files: ["supabase/functions/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
]);

export default eslintConfig;
