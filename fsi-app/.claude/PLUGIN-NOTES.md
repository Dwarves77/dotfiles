# Plugin Notes

Operational notes about installed Claude Code plugins. Created 2026-05-20 as the P5 deliverable of the 3-axis skill audit.

## Replicated skills across plugin packages (drift risk)

### Expo skills triplet

The 12 Expo skills are replicated identically across three plugin packages installed in `~/.claude/plugins/cache/expo-plugins/`:

- `expo-app-design/1.0.0/skills/<skill>/SKILL.md`
- `expo-deployment/1.0.0/skills/<skill>/SKILL.md`
- `upgrading-expo/1.0.0/skills/<skill>/SKILL.md`

Replicated skill set: `building-native-ui`, `expo-api-routes`, `expo-cicd-workflows`, `expo-deployment`, `expo-dev-client`, `expo-module`, `expo-tailwind-setup`, `expo-ui-jetpack-compose`, `expo-ui-swift-ui`, `native-data-fetching`, `upgrading-expo`, `use-dom`.

**Drift risk.** If a skill needs editing, updating one copy leaves two stale. Plugin manager may overwrite local edits on plugin update.

**Treatment.** Do not edit plugin skill files in place. If a customization is needed, fork the skill into a custom project skill at `fsi-app/.claude/skills/` with a name that namespaces it (e.g., `caros-ledge-native-data-fetching`).

### Vercel version duplication

All 26 Vercel skills exist in two plugin versions side by side:

- `~/.claude/plugins/cache/claude-plugins-official/vercel/0.42.1/skills/...`
- `~/.claude/plugins/cache/claude-plugins-official/vercel/0.43.0/skills/...`

**Drift risk.** Same shape as Expo. Updates may land in only one version, plugin loader picks one to load.

**Treatment.** Treat 0.43.0 as canonical (most recent). If both versions need to coexist (testing upgrade compatibility), document the difference rather than editing in place.

## Plugin scope vs Caro's Ledge stack

Vercel and Expo plugins are NOT on the Caro's Ledge stack (Next.js + Supabase, not Vercel deploy or Expo native). Most plugin skills are correctly dormant for Caro's Ledge work. Plugin skills relevant to Caro's Ledge:

- `vercel:vercel-cli` and `vercel:vercel-functions`: relevant only if Vercel deploy ever becomes the deployment target. Currently neither loads on Caro's Ledge dispatches.
- Superpowers (separate plugin, no duplication): actively used. See sprint-followups-discipline for which superpowers load on which dispatches.

## Cross-reference

- 3-axis skill audit findings: see commit `<TBD>` for the audit dispatch and OBS-N+2 in `docs/sprint-2/followups.md` (or current sprint followups doc).
- Custom project skills inventory: `fsi-app/.claude/skills/`
- Plugin cache root: `~/.claude/plugins/cache/`
