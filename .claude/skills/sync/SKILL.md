---
name: sync
description: 'Sync the Gmail filter set to match filters.js — dry run first, then apply. Owns the 🔍 and 💾 title prefixes across that pair, so other sessions can see a live write in flight. Use when asked to sync, apply the spec, push filters to Gmail, or reconcile the account with filters.js.'
---

# Sync (filters.js → the live Gmail filter set)

`src/sync.js` is a dry run by default; `--apply` performs the deletes and creates. This skill is the
two of them as one operation, and it exists because the stretch between them is the only thing in
this repo another session acts on. See `AGENTS.md` (Repo → Session titles).

`filter` and `archive` end by syncing — they invoke this skill rather than calling `sync.js`
directly, so the prefixes go on wherever a sync happens.

### 1. `🔍 ` before the dry run

Read the session's title (`mcp__ccd_session_mgmt__get_session` with `"self"`) and set it back with a
`🔍 ` prefix (`mcp__ccd_session_mgmt__set_session_title`), replacing any existing lifecycle prefix
rather than stacking. In a cloud session, where those do not exist, `mcp__claude-code-remote__get_session` with no
`session_id` describes this session (`ccr.id`, `ccr.title`), and
`mcp__claude-code-remote__set_session_title` takes that id. Skip this only when neither tool exists. Do not report this.

Then:

```bash
node src/sync.js
```

Read the plan. Nothing is written yet.

### 2. Check the sidebar before applying

`--apply` takes a lock, but the dry run does not, so the plan just printed is stale the moment
another session applies. List sessions (`mcp__ccd_session_mgmt__list_sessions`) and look for another
`💾 ` whose `cwd` is an email-filter-builder worktree — a `💾 ` in another repo writes some other
resource and does not contend for this account. If one is there, wait rather than applying — and re-run step 1 afterwards, because its plan was
computed against the account as it was.

Re-run step 1 too if anything else happened between the dry run and here.

### 3. `💾 ` across the apply

Swap the prefix to `💾 ` **before** the command, not after it returns — the warning is only useful
while the write is in flight. Do not report this.

```bash
GMAIL_SYNC_SESSION_TITLE='<this session title>' node src/sync.js --apply
```

Pass the title read in step 1, single-quoted (an apostrophe in it becomes `'\''`). The lock records it
beside the session id, so a session refused while this one applies prints a link to this chat by name.

**If the apply refuses because another session holds the lock**, tell the user which chat it is by
pasting the `link` line it printed — `[title](#local_…)` — verbatim; the app renders it as a link
that opens that session. When there is no `link` line (a terminal session, or a lock taken before
ids were recorded), name the holder by its `title`, branch and worktree instead. Never build a link
from a session id you did not read from that output. Put the title back to what it was before the
`💾 ` — this session is not writing — and wait, then re-run step 1.

It prompts before a destructive run and refuses without a terminal to ask; `--yes` skips the prompt.
If it stops for that confirmation and the user has to click, the title stays `💾 ` while it waits — a
write in flight outranks a park, and handing back mid-apply is still mid-apply.

### 4. Whatever stage the branch reached

Once it returns, replace `💾 ` with what is true now: `📦 ` if the change is gated and shippable,
`⏳ ` if there is more to do, `🚙 ` if it waits on the user. Never leave `💾 ` on a session that has
stopped writing — another session reads it as a live write and waits on nothing. Do not report this.

If the apply failed, say so with its output and put the title back the same way. A partial apply is
possible: re-run step 1 to see what the account actually holds rather than assuming the plan applied
or did not.
