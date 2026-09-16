#!/bin/sh
# DeploySave — deploy paaipe.org for the smallest number of Netlify credits.
#
#   sh scripts/deploysave.sh          inspect only: says what a deploy would cost
#   sh scripts/deploysave.sh --push   actually push (and therefore deploy)
#
# WHY THIS EXISTS
#
# paaipe.org has no build command, so it is tempting to assume a deploy is free.
# It is not. Every push to main starts a production deploy, Netlify spins up a
# build container for it, and build time is billed in whole minutes. A deploy
# that changes one character of one page therefore costs the same as one that
# rebuilds the site - and a deploy that changes nothing a visitor can see costs
# exactly as much again.
#
# So the saving is not in making deploys cheaper. It is in making FEWER of them:
#
#   1. BATCH. Four pushes in an afternoon cost four times one push carrying four
#      commits. The site is identical either way. This script is the single
#      entrance so that batching is the default rather than something you have
#      to remember.
#   2. DON'T DEPLOY NOTHING. If every changed file is one no visitor can see -
#      Firebase rules, scripts, notes - there is nothing to ship. The same test
#      runs again on Netlify's side via scripts/netlify-ignore.sh, so even if
#      one slips through, the build is cancelled there. Both read the SAME list,
#      scripts/netlify-skip-paths.txt.
#   3. MEASURE FIRST. Run it with no arguments and it tells you what you are
#      about to spend and on what. Free.
#
# It does NOT replace the six-step deploy protocol - it runs the sweep and
# refuses to push if the remote is ahead, because losing another agent's work
# costs more than any number of build minutes.
set -u

cd "$(dirname "$0")/.." || exit 1
. "./scripts/netlify-skip-match.sh"

PUSH=0
[ "${1:-}" = "--push" ] && PUSH=1

say()  { printf '%s\n' "$*"; }
rule() { printf '%s\n' "------------------------------------------------------------"; }
die()  { printf 'DeploySave: %s\n' "$*" >&2; exit 1; }

say "DeploySave — paaipe.org"
rule

# --- step 1: sweep the remote -----------------------------------------------
git fetch --quiet --all --tags --prune || die "could not reach the remote"

ahead=$(git rev-list --count origin/main..main 2>/dev/null) || die "no main/origin/main"
behind=$(git rev-list --count main..origin/main 2>/dev/null) || die "no main/origin/main"

say "commits local-only : $ahead"
say "commits upstream   : $behind"

if [ "$behind" -gt 0 ]; then
  rule
  say "STOP. origin/main has $behind commit(s) you do not have:"
  git log --oneline main..origin/main | sed 's/^/    /'
  say ""
  say "That is someone else's work. Merge it in, preserving everything local,"
  say "re-test the combination, and only then deploy. Do not push over it."
  exit 2
fi

if [ "$ahead" -eq 0 ]; then
  rule
  say "Nothing to deploy — local and origin/main are the same commit."
  say "COST IF YOU PUSHED ANYWAY: 1 build. SAVED: 1 build."
  exit 0
fi

# --- step 2: what would actually change for a visitor? ----------------------
changed=$(git diff --name-only origin/main..main)
[ -n "$changed" ] || die "commits differ but no files do — inspect by hand"

serving=$(printf '%s\n' "$changed" | while IFS= read -r f; do
  [ -n "$f" ] || continue
  needs_deploy "$f" && printf '%s\n' "$f"
done)
invisible=$(printf '%s\n' "$changed" | while IFS= read -r f; do
  [ -n "$f" ] || continue
  needs_deploy "$f" || printf '%s\n' "$f"
done)

n_serving=$(printf '%s' "$serving" | grep -c . 2>/dev/null || echo 0)
n_invis=$(printf '%s' "$invisible" | grep -c . 2>/dev/null || echo 0)

rule
say "files a visitor would see change : $n_serving"
[ "$n_serving" -gt 0 ] && printf '%s\n' "$serving" | sed 's/^/    /'
say "files nobody would notice        : $n_invis"
[ "$n_invis" -gt 0 ] && printf '%s\n' "$invisible" | sed 's/^/    /'
rule

# --- step 3: the cost gate --------------------------------------------------
if [ "$n_serving" -eq 0 ]; then
  say "This push would deploy NOTHING a visitor can see."
  say "Netlify's hook would cancel the build, so it should cost 0 build minutes."
  say "Pushing is still worth doing to keep the repos aligned — it just is not a"
  say "deploy. Re-run with --push when you want the commits on the remote."
  [ "$PUSH" -eq 1 ] || exit 0
else
  say "This push costs ONE production deploy, carrying $ahead commit(s)."
  say "Deploying these commits separately would have cost $ahead."
  say "SAVED BY BATCHING: $((ahead - 1)) deploy(s)."
fi

# --- step 4: don't deploy a dirty tree twice --------------------------------
dirty=$(git status --porcelain | grep -c . || true)
if [ "$dirty" -gt 0 ]; then
  rule
  say "WARNING: $dirty uncommitted change(s) in the working tree."
  say "Anything left out now needs a SECOND deploy later. Commit it first and"
  say "ship both together, or accept the extra build."
  git status --short | sed 's/^/    /'
fi

rule
if [ "$PUSH" -eq 0 ]; then
  say "Inspection only — nothing was pushed and nothing was spent."
  say "Run:  sh scripts/deploysave.sh --push"
  exit 0
fi

# --- step 5: push, and prove it arrived -------------------------------------
say "Pushing…"
git push origin main || die "push failed"

remote=$(git ls-remote origin refs/heads/main | cut -f1)
local=$(git rev-parse main)
say "remote main : $remote"
say "local  main : $local"
[ "$remote" = "$local" ] || die "PUSH DID NOT ARRIVE — the refs differ"
say "Aligned. One deploy spent."
