---
name: ship
description: 'Finish a feature branch in a worktree: run the quality gates (build, test, format), commit, rebase on master, squash, fast-forward merge into master, push, and extract the session's learnings. Use when done with a change in this repo and want it on master without opening a PR.'
---

# Ship (finish feature → merge to master)

Solo-developer workflow for this repo. Take the current feature branch (usually in a worktree), verify it, land it on `master` as a single commit via fast-forward merge, and push to `origin`. No PR.

## Procedure

### 0. Prefix the session title with 🚀

Read the session's title (`mcp__ccd_session_mgmt__get_session` with `"self"`) and set it back with a
`🚀 ` prefix (`mcp__ccd_session_mgmt__set_session_title`), replacing any existing lifecycle prefix
rather than stacking — a shipping session was usually `📦 ` a moment ago. Do this **now**, before any
of the work: the sidebar should say what the session is doing while it is doing it. Step 7 puts the
title back if the ship does not land. Do not report either. See `AGENTS.md` (Repo → Session titles).

### 1. Quality gates (must pass before committing)

Run in order, stop on the first failure, fix, then re-run before proceeding:

```bash
npm run build && npm test && npm run format
```

- `npm run build` — regenerates `README.md` from `README-template.md` and `filters.sample.js` through the current renderers, so the committed README matches the code. It needs nothing that is missing from a worktree.
- `npm test` — jest, the full suite once. `.github/workflows/test.yml` runs the same command after the push to `master`, so a failure skipped here shows up there. (`npm run test:watch` is the watch mode — don't use it here.)
- `npm run format` — prettier `--write`. Run it last so any reformatting lands in the commit.

This is the whole gate: there is no lint or type check in this repo.

### 2. Commit all staged and unstaged changes

Generate a commit message from the diff. Use an imperative, sentence-case subject (`Add …`, `Fix …`, `Rename …`, `Remove …`) to match the repo's history. A `type:` prefix is optional and used only occasionally here — plain imperative subjects are the norm. Follow the conventions in `AGENTS.md` (Repo → Git).

### 3. Rebase on master

```bash
git rebase master
```

If the rebase hits conflicts: resolve them (prefer the branch changes unless clearly wrong), `git add` the resolved files, `git rebase --continue`, and repeat until it completes. Then re-run the step 1 gates and `git add` whatever they change: a conflict resolution is content they have never seen, and step 4 commits only what is staged.

### 4. Squash all commits into one

```bash
git reset --soft "$(git merge-base HEAD master)" && git commit -m "subject" -m "body"
```

Use a single message that describes the overall diff. Reset to the merge base, not to `master`: if
another worktree lands on `master` while a rebase is paused on a conflict, a soft reset onto the new
tip keeps a tree without its commits, so the squash would silently revert them. From the merge base,
step 5 refuses to fast-forward instead, and its retry loop takes the new commits in.

### 5. Fast-forward merge into master

Use this exactly — it resolves the branch and the main checkout (`$MAIN`, the directory holding the shared `.git`), so nothing is hardcoded:

```bash
BRANCH=$(git branch --show-current) && MAIN="$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")" && git -C "$MAIN" merge --ff-only "$BRANCH"
```

**If `--ff-only` fails with "Not possible to fast-forward":** another worktree merged into `master` in the meantime, so this branch is no longer a direct descendant. This is expected when running parallel agent sessions and is safe — nothing was merged or lost. Recover by re-integrating on the new `master`:

1. Go back to **step 3** (`git rebase master`) — this replays this branch's single squashed commit onto the updated `master`, surfacing any genuine conflict with the work that landed first. Resolve conflicts the same way.
2. Redo **step 4** (`git reset --soft "$(git merge-base HEAD master)" && git commit`) to re-squash onto the new base.
3. Retry **step 5**.

Repeat until the fast-forward succeeds. Because `master`'s ref only advances via this atomic `--ff-only` step, at most one worktree wins each round and the others simply rebase and retry — no merge commits, no clobbering.

### 6. Push and post-merge

```bash
MAIN="$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")" && git -C "$MAIN" push origin master
```

- Push `master` to `origin` from the main worktree.
- If `package.json` or `package-lock.json` changed, run `npm install` in the main worktree so its dependencies match.
- The branch is now merged into `master`. If this worktree is finished with, it and the branch can be cleaned up from the main checkout:

  ```bash
  BRANCH=$(git branch --show-current) && MAIN="$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")" && git -C "$MAIN" worktree remove <this-worktree-path> && git -C "$MAIN" branch -d "$BRANCH"
  ```

  Only do this when the user confirms the worktree is no longer needed.

### 7. Correct the title if the ship did not land

The push in step 6 is what counts as shipped. If it succeeded, the `🚀 ` from step 0 is already
right — leave it. If it failed, or the ship was abandoned before the push, put the title back to the
prefix that is true now (`📦 ` for a branch that is done and gated, otherwise whatever stage it
actually reached). Do not report this step.

### 8. Extract the learnings

Invoke the `learn` skill. A shipped change is the moment its lessons are worth writing down: the
branch is landed, nothing is pending, and whatever the session learned about the spec, the accounts
or the workflow is still in context — an hour later it is in nobody's. This is not optional and the
user does not have to ask for it; it is the last stage of shipping.

Skip this step when `ship` was itself invoked by `learn` (its procedure ends in a ship), or the two
would call each other forever. Landing the learnings is that ship's whole job.

`learn` puts `📚 ` on the title, replacing the `🚀 `. Put `🚀 ` back when it finishes: the session
shipped, and that is the stage it rests at.

If `learn` finds nothing worth recording, that is a normal outcome — say so in one line and move on.

### 9. Report completion

Print `🚀 Shipped` as the last line of the response, after the learn report.
