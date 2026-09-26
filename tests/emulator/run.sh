#!/bin/sh
# Run the Firestore rules unit tests against the emulator.
#
#   sh tests/emulator/run.sh
#
# Installs its deps into tests/emulator/node_modules (gitignored) on first run,
# then boots the Firestore emulator and executes the rules suite inside it. Needs
# Java (the emulator) and Node. A rules mistake is only catchable against the
# real ruleset, so this drives the emulator rather than stubbing it.
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
cd "$HERE"

if [ ! -d node_modules/@firebase/rules-unit-testing ]; then
  echo "installing emulator test deps (first run)…"
  npm install --no-save --prefix "$HERE" \
    firebase@12 @firebase/rules-unit-testing@4 firebase-tools@14 >/dev/null 2>&1 \
    || npm install --prefix "$HERE" firebase @firebase/rules-unit-testing firebase-tools
fi

export FIRESTORE_EMULATOR_PORT="${FIRESTORE_EMULATOR_PORT:-8080}"
# emulators:exec starts Firestore, runs the command, then shuts it down.
exec ./node_modules/.bin/firebase emulators:exec \
  --only firestore \
  --project paaipe-rules-test \
  "node registration_rules.mjs"
