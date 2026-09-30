#!/bin/zsh
cd -- "${0:A:h}"
if ! command -v node >/dev/null 2>&1; then
  echo 'Please install Node.js 24 or newer from https://nodejs.org, then open Butler again.'
  read -r '?Press Enter to close.'
  exit 1
fi
exec node scripts/launch.js
