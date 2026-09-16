#!/bin/sh
# Does this path need a production deploy?
#
# Shared by the Netlify build-skip hook and the local DeploySave cost gate, so
# the two can never disagree. Reads scripts/netlify-skip-paths.txt.
#
#   needs_deploy <path>   -> 0 (true) if a visitor could notice, 1 if not
#
# Default is "yes, deploy". Silence from the list means BUILD.
set -u

# Find the list. $0 is the SOURCING script, not this file, so a single
# dirname guess is wrong as soon as anything sources this from elsewhere - and
# the failure is silent and expensive: an unreadable list means every path looks
# deployable, so the skip never fires and every push bills a build. Try the
# candidates, then say so out loud if none is readable.
if [ -z "${SKIP_LIST:-}" ]; then
  for _c in "./scripts/netlify-skip-paths.txt" \
            "$(dirname "$0")/netlify-skip-paths.txt" \
            "$(dirname "$0")/../scripts/netlify-skip-paths.txt"; do
    [ -r "$_c" ] && { SKIP_LIST=$_c; break; }
  done
fi
if [ -z "${SKIP_LIST:-}" ] || [ ! -r "$SKIP_LIST" ]; then
  echo "netlify-skip-match: WARNING — no readable netlify-skip-paths.txt;" \
       "treating every path as deployable" >&2
  SKIP_LIST=""
fi

needs_deploy() {
  _f=$1
  [ -r "$SKIP_LIST" ] || return 0        # no list readable: deploy, don't guess
  while IFS= read -r pat || [ -n "$pat" ]; do
    case $pat in
      ''|'#'*) continue ;;
    esac
    case $pat in
      */)  case $_f in ("$pat"*) return 1 ;; esac ;;   # directory prefix
      \**) case $_f in ($pat)    return 1 ;; esac ;;   # *.ext, any depth
      *)   [ "$_f" = "$pat" ] && return 1 ;;           # exact
    esac
  done < "$SKIP_LIST"
  return 0
}
