# Guess The Line — repository synchronization

Owner: Sean Balsiger · Version 1 · October 15, 2026

GitHub `seanbalz/guess-the-line`, branch `main`, is the shared committed
source. The canonical name was verified October 28, 2026 against repository ID
`1409914333`, unchanged from `seanbalz/guess-the-lines-repo`. The
[completion register](COMPLETION_REGISTER.md) records current work;
dated release records establish what was deployed. The v62 JSON tracker is
historical. Private boards, chat history, credentials, ignored local data and
the production database are not synchronized by Git.

## Start and finish a task

1. Inspect the checkout, branch, upstream and uncommitted files before working.
   Run `git fetch --prune origin` to refresh remote references.
2. Use a separate worktree and task branch based on `origin/main`. Do not switch
   branches, stash, reset or pull inside another session's active checkout.
   A new branch has no matching upstream until its first reviewed push.
3. Save decisions and task evidence in repository documents with their actual
   state: planned, checked locally, merged, hosted or accepted. Keep the current
   completion register linked to the specific work. Never copy secrets, private
   boards or raw player data into public planning documents.
4. Review and test the changes. Stage named files deliberately, inspect
   `git diff --cached` and `git diff --cached --check`, then commit and push the
   task branch with `git push -u origin <task-branch>`. Open a PR into `main` and
   satisfy its review and CI requirements before merge.
5. Run `npm run sync:check` after pushing. At handoff report the branch, full
   commit, PR, checks, ahead/behind counts and any unpublished work. A branch
   push does not mean its PR is merged, and a merge does not mean it is deployed.
6. After merge, update a clean, exclusively owned `main` checkout using
   `npm run sync:pull`, then verify again. Leave other worktrees with their owners.

## Commands and guarantees

```sh
npm run sync:check
npm run sync:check -- --json
npm run sync:pull
```

Both commands fetch the configured remote, compare the matching branch's commit
and ahead/behind counts, inspect uncommitted/untracked files and check the remote
branch directly. Exit 0 means this checkout was clean and equal to its remote
branch at the recorded time. Exit 1 means unresolved work or an unavailable
verification; it must not be reported as synchronized.

`sync:pull` fetches with pruning and fast-forwards with
`git merge --ff-only --no-overwrite-ignore @{upstream}` only when the checkout is clean,
has the same-name remote upstream and has no local-only commits or active Git
operation. The extra merge flag refuses incoming files that would overwrite
ignored local state. It never commits, pushes, stashes, resets or rebases.
Divergence needs deliberate reconciliation. Concurrent writers still require
separate worktrees; this tool is not a filesystem lock or continuous mirroring.

Ignored files are outside the check. A clean Git status does not establish that
`.env.cloud`, local runtime state, screenshots, database rows or deployment logins
are present on another machine. Other branches/worktrees may intentionally differ.
Every new environment must provision its own secure access and run the check.

The shared local repository was configured on October 15 with `pull.ff=only`,
`fetch.prune=true` and `push.default=simple`. These local Git settings do not travel
in a commit; apply them to new clones as appropriate:

```sh
git config --local pull.ff only
git config --local fetch.prune true
git config --local push.default simple
```

## October 15 reconciliation

The original shared checkout was on `claude/release-record-oct14-m01` at
`e5a45f6d73e66505841044f532f4ed644576f635`, 26 commits behind that remote branch,
with five modified documents and an untracked scoring backlog. Their content and
SHA-256 hashes were saved privately before reconciliation. The original checkout
remained active: later scoring-planning answers were observed and separately
captured during this work. The backlog records the imported evidence and its
limits. The original checkout was preserved; new work uses the attached
`shared-sync` worktree.

The planning changes were reconciled onto newer `main` content, retaining newer
release/hosted evidence. The local scoring entry collided with D-47 (weather)
and D-49 was already reserved, so it is recorded as D-50 with provenance in the
[scoring backlog](../planning/scoring-and-player-trends.md). No scoring rule,
migration, private board or live account was changed by this synchronization.

The original six files remain in their original checkout for its owner. Their
presence there means that checkout still fails the clean-sync check, even after
the reconciled content is published. Do not erase those files merely to get a
green status; first verify that their owner has no later edits and select the
intended branch together. New work should use the synchronized task worktree.

## Shared deployment

The [manual deployment workflow](SHARED_DEPLOYMENT.md) is a separate path with
an exact source commit, successful checks, production environment approval and
release evidence. It never runs migrations automatically. Required production
secrets remain in GitHub's environment secret store, never in repository files.

References: [Git pull](https://git-scm.com/docs/git-pull),
[Git worktree](https://git-scm.com/docs/git-worktree), and
[GitHub deployment environments](https://docs.github.com/en/actions/concepts/workflows-and-actions/deployment-environments).
