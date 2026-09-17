# Tests

Playwright suites for paaipe.org, run against a local static server.

```sh
cd tests && npm install playwright      # browsers are usually already cached
python3 -m http.server 8899 --bind 127.0.0.1 &   # from the repo root
sh tests/gate.sh
```

To gate a commit in isolation, per the deploy protocol:

```sh
git worktree add --detach ../paaipe-gate-<sha> <sha>
(cd ../paaipe-gate-<sha> && python3 -m http.server 8900 --bind 127.0.0.1 &)
sh tests/gate.sh ../paaipe-gate-<sha> 8900
```

## These live in the repository, and that is the point

They used to live in a scratch directory under `/private/tmp`. On 2026-09-17
that directory was cleaned between turns and **twenty-six suites — 483
assertions — were lost outright.** Nothing shipped was affected: every line of
product code was committed and pushed. But the thing that proved it worked was
not, so it died with a temp folder.

The rule this repository now keeps: if it is worth running before a deploy, it
is worth committing. `tests/` is in `scripts/netlify-skip-paths.txt`, so
changing a test costs no build.

## Conventions

- `PAAIPE_ROOT` and `PAAIPE_BASE` must steer every suite. A hardcoded repo path
  makes a detached-worktree gate measure the working tree while reporting
  someone else's SHA, and `gate.sh` refuses to run when it finds one.
- A break-check asserts its own mutation applied. A no-op patch reads exactly
  like a passing guard.
- Assert on behaviour, not wording, unless the wording *is* the behaviour —
  several of these exist precisely because a page said something untrue.
