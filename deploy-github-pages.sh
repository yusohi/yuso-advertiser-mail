#!/usr/bin/env bash
set -euo pipefail

repo_url="${1:-}"

if [[ -z "$repo_url" ]]; then
  echo "Usage: ./deploy-github-pages.sh git@github.com:OWNER/REPO.git"
  echo "   or: ./deploy-github-pages.sh https://github.com/OWNER/REPO.git"
  exit 1
fi

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git init -b main
fi

git branch -M main

if git remote get-url origin >/dev/null 2>&1; then
  git remote set-url origin "$repo_url"
else
  git remote add origin "$repo_url"
fi

git push -u origin main
