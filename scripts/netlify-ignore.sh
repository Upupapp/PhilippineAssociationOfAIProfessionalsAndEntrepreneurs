#!/bin/sh
# Netlify build-skip hook for production deploys.
#
# Netlify's contract: exit 0 CANCELS the build, and any other exit code runs it.
#
# Polarity: default to BUILD. A wrongly skipped build means a fix that silently
# never ships, which is far worse than a wasted build. Skip only with positive
# proof that every changed path is on the list in netlify-skip-paths.txt.
#
# That list is SHARED with scripts/deploysave.sh, which applies the same test
# locally before you spend anything. Neither file keeps its own copy of it.
set -u

. "$(dirname "$0")/netlify-skip-match.sh"

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

# read line by line, never `for f in $changed`: word-splitting would cut a
# filename containing a space into two paths and test neither of them
first_serving=$(printf '%s\n' "$changed" | while IFS= read -r f; do
  [ -n "$f" ] || continue
  if needs_deploy "$f"; then printf '%s' "$f"; break; fi
done)
[ -z "$first_serving" ] || build "site path changed: $first_serving"

echo "netlify-ignore: SKIP (nothing a visitor sees changed: $(printf '%s' "$changed" | tr '\n' ' '))"
exit 0
