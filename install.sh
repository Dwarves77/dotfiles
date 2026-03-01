#!/bin/bash
# Dotfiles bootstrap for GitHub Codespaces
# Runs automatically when a new Codespace is created

DOTFILES_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== Installing Claude Code dotfiles ==="

# Install Claude Code globally
if ! command -v claude &>/dev/null; then
  echo "Installing Claude Code..."
  npm install -g @anthropic-ai/claude-code
else
  echo "Claude Code already installed: $(claude --version)"
fi

# Set up .bashrc (append to existing, don't clobber Codespace defaults)
if [ -f "$DOTFILES_DIR/.bashrc" ]; then
  echo "Appending shell config to ~/.bashrc..."
  echo "" >> ~/.bashrc
  echo "# --- Jason's dotfiles ---" >> ~/.bashrc
  cat "$DOTFILES_DIR/.bashrc" >> ~/.bashrc
fi

# Set up Claude global commands
echo "Installing Claude commands..."
mkdir -p ~/.claude/commands
cp "$DOTFILES_DIR/.claude/commands/"*.md ~/.claude/commands/

# Pull global CLAUDE.md from Gist (unpinned URL = always latest)
echo "Fetching global CLAUDE.md from Gist..."
curl -sf -o ~/.claude/CLAUDE.md \
  "https://gist.githubusercontent.com/Dwarves77/f6f6ad1b22aab561e5e9225b32b42c59/raw/CLAUDE.md" \
  || echo "Warning: Gist unavailable, skipping CLAUDE.md"

echo "=== Dotfiles install complete ==="
