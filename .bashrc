cc() {
  GIST_URL="https://gist.githubusercontent.com/Dwarves77/f6f6ad1b22aab561e5e9225b32b42c59/raw/CLAUDE.md"
  mkdir -p ~/.claude
  curl -sf -o ~/.claude/CLAUDE.md "$GIST_URL" || echo "Gist unavailable, using local copy"

  # Always ensure global commands exist at ~/.claude/commands/
  mkdir -p ~/.claude/commands

  cat > ~/.claude/commands/start.md << 'EOF'
Review CLAUDE.md and give me:
1. A quick summary of where this project stands
2. What I was working on last
3. What the next steps are
4. Ask me what I want to work on today
EOF

  cat > ~/.claude/commands/done.md << 'EOF'
Update CLAUDE.md with:
1. What we accomplished this session
2. Any decisions or changes made
3. Current blockers or open questions
4. Recommended next steps

Keep it concise. Use bullet points. Do not remove existing content — append a new dated entry under a "## Session Log" section.
EOF

  cat > ~/.claude/commands/status.md << 'EOF'
Give me a quick project health check:
1. Current state of the codebase
2. Any errors, warnings, or broken things
3. What files were changed most recently
4. Dependencies that might need updating
EOF

  claude
}

pushit() {
  git add -A
  git commit -m "${1:-Session update}"
  git push
}

projects() {
  find ~ -name "CLAUDE.md" -not -path "*/node_modules/*" -not -path "*/.claude/*" 2>/dev/null
}
