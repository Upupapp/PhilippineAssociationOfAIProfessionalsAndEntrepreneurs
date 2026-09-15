#!/bin/sh
# Netlify build-skip hook for production deploys.
#
# Netlify's contract: exit 0 CANCELS the build, and any other exit code runs it.
#
# Polarity: default to BUILD. A wrongly skipped build means a fix that silently
# never ships, which is far worse than a wasted build. Skip only with positive
# proof that every changed path is on the docs-only allow-list below.
#
# Every allow-list entry must be a committed file. A misspelt entry looks exactly
# like a dead one, and the cost of a misspelling is a missed deploy.
set -u

ALLOW="README.md .gitignore"

build() {
  echo "netlify-ignore: BUILD ($1)"
  exit 1
}

from=${CACHED_COMMIT_REF:-}
to=${COMMIT_REF:-}

[ -n "$from" ] && [ -n "$to" ] || build "no cached or current commit ref"
[ "$from" != "$to" ] || build "same commit: a retry or manual redeploy"

changed=$(git diff --name-only "$from" "$to" 2>/dev/null) || build "diff unreadable"
# An empty diff must BUILD: "every path is irrelevant" is vacuously true of no paths.
[ -n "$changed" ] || build "empty diff"

outside=$(printf '%s\n' "$changed" | while IFS= read -r f; do
  # Leading "(" on each pattern: bash's sh mode cannot parse a bare "pattern)"
  # inside $( ... ), so without it the hook errors out and always builds.
  case " $ALLOW " in
    (*" $f "*) ;;
    (*) printf '%s\n' "$f" ;;
  esac
done)
[ -z "$outside" ] || build "site path changed: $(printf '%s' "$outside" | head -n 1)"

echo "netlify-ignore: SKIP (docs-only change: $(printf '%s' "$changed" | tr '\n' ' '))"
exit 0
