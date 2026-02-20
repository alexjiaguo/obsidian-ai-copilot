#!/bin/bash
set -e

# Initialize if not exists
if [ ! -d ".git" ]; then
    git init
    git branch -M main
    echo "Git initialized."
fi

# Configure User (if needed, generic fallback)
git config user.name "AI Copilot Dev"
git config user.email "dev@aicopilot.local"

# Add files
git add .
git commit -m "Initial commit: v1.1.1 working state" || echo "Nothing to commit"

# Create Private Repo (idempotent check)
if ! gh repo view obsidian-ai-copilot >/dev/null 2>&1; then
    echo "Creating private repository..."
    gh repo create obsidian-ai-copilot --private --source=. --remote=origin --push
else
    echo "Repo exists. Pushing..."
    git push -u origin main
fi
