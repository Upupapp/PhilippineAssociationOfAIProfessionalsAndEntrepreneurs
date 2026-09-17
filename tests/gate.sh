#!/bin/sh
# Run every suite against ONE tree, and refuse to run if a suite could read a
# different one.
#
#   sh tests/gate.sh                          # the working checkout on :8899
#   sh tests/gate.sh /path/to/worktree 8900   # a detached worktree, its own port
#
# WHY THE PRE-FLIGHT IS FATAL. Twice a suite has hardcoded the working
# checkout's path while the report named a worktree SHA, so the gate measured
# the tree being edited and stamped a commit it had never read. Every suite
# passes and the SHA is printed; a grep is the only thing that catches it.
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=${1:-$(cd "$HERE/.." && pwd)}
PORT=${2:-8899}
cd "$HERE"

[ -d node_modules/playwright ] || { echo "playwright is not installed here. Run:"; \
  echo "  cd $HERE && npm install playwright"; exit 2; }

fail=0
for f in test_*.mjs; do
  if grep -n "/Users/user/Philippine-Association-of-AI" "$f" | grep -qv "process.env.PAAIPE_ROOT||"; then
    echo "GATE REFUSED: $f hardcodes a repo path, so PAAIPE_ROOT cannot steer it:"
    grep -n "/Users/user/Philippine-Association-of-AI" "$f" | grep -v "process.env.PAAIPE_ROOT||"
    fail=1
  fi
  case "$f" in test_eventslive.mjs) continue;; esac   # queries PRODUCTION on purpose
  if grep -q "127.0.0.1" "$f" && ! grep -q "PAAIPE_BASE" "$f"; then
    echo "GATE REFUSED: $f serves pages but ignores PAAIPE_BASE"; fail=1
  fi
done
[ "$fail" = 0 ] || { echo; echo "Nothing was run."; exit 2; }

echo "pre-flight ok — every suite honours PAAIPE_ROOT and PAAIPE_BASE"
echo "gating ROOT=$ROOT  BASE=http://127.0.0.1:$PORT"
echo
export PAAIPE_ROOT="$ROOT" PAAIPE_BASE="http://127.0.0.1:$PORT"
bad=0; total=0
for f in test_*.mjs; do
  line=$(node "$f" 2>&1 | grep -E '^====' || echo '==== NO SUMMARY ====')
  printf '%-26s %s\n' "$f" "$line"
  n=$(echo "$line" | sed -n 's/==== \([0-9]*\) passed.*/\1/p'); total=$((total + ${n:-0}))
  echo "$line" | grep -q ', 0 failed' || bad=$((bad + 1))
done
echo
echo "$total assertions; $bad suite(s) with failures"
exit $([ "$bad" = 0 ] && echo 0 || echo 1)
