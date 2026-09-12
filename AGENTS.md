# AGENTS.md

Operational knowledge for agent sessions working on this repo and on the mail accounts it manages. Gleaned from live sessions in 2026-08 and 2026-09; verify anything that may have drifted before relying on it. Claude Code reads this file through `CLAUDE.md`, which only imports it — record learnings here, not there.

**Privacy rule: this repo is public.** Never put the account address, filter counts, label names/IDs, or any content from `filters.js` into committed files (docs, tests, commit messages included). Account-specific details belong in **AGENTS.local.md** — in the config directory outside the repo (see **Files outside git**). Inventing an example does not make it safe: a generic phrase made up to illustrate a subject or sender can be verbatim in the spec. Before committing, count each example sender, domain, subject or label name the diff adds against the spec (`grep -ic -- '<example>' "$CONFIG/filters.js"`) and replace any that hits — examples taken from the request included: the user may have drawn them from their own mail.

## Repo

### What the code does

- `email-filter-builder` generates email filters from `filters.js` (personal, outside the repo — see **Files outside git**).
- Source lives in `src/`: the library modules, the two CLIs, and their colocated `*.test.js`. The root keeps project tooling and fixtures — `build.js` (README generation) and `filters.sample.js`.
- `node src/bin.js [filters.js]` writes `out/*.sieve` (ProtonMail, 50k-char chunks) and `out/gmail.xml` (Gmail import file).
- `node src/sync.js [filters.js]` diffs the spec against the account's live Gmail filters over the API and reconciles them — dry run by default, `--apply` to write, `--yes` to skip the delete prompt, `--verbose` to print full queries. This is the supported way to change Gmail filters; the XML import is a one-shot that duplicates on re-import. Needs a one-time OAuth setup (see README.md).
- `src/gmail.js` exports `Specs`, the shared conditions-to-filters expansion (OR-merging, 600-char chunking, one label per filter). Both the XML renderer and `sync.js` go through it, so the two formats cannot drift. Change merging semantics there, not in either consumer.
- `site/` is the small public web page the Gmail OAuth consent screen links to (home page plus privacy policy), deployed separately from the CLI. It exists because Google will not let an app leave Testing status without a reachable home page and privacy policy URL. The contact address is injected from `CONTACT_EMAIL` (a gitignored `.env` locally, a service variable in production) rather than committed, since this repo is public — without it the contact falls back to the GitHub issue tracker. Hosting specifics are in AGENTS.local.md.
- A `subject` is a substring in sieve and a quoted phrase in Gmail, so it must appear contiguously in the real subject. A family that varies mid-phrase needs one condition per variant — a stop word alone splits it, the way "Invoice is Ready" shares no contiguous fragment with "Invoice Ready" past the first word. Prefer the longest fragment of fixed wording shared by the whole family — never a per-message date, name or number, even one every sample happens to share (`filter` skill, step 2) — and check it against the real subjects rather than one sample. The fragment can never contain a double quote: Gmail search has no escape for one, so the renderer refuses the value (in a `from` or `list` too) and the whole render or sync stops — take the fragment on one side of the quote.
- Mapping rules are documented in README.md (Gmail → Mapping). Key invariants: conditions sharing the same actions are OR-merged into `hasTheWord` queries chunked at 600 chars (`maxQueryLength` option); `archive` → skip the inbox (`shouldArchive` in XML, `removeLabelIds: [INBOX]` over the API); `trash` → delete (`shouldTrash` / `addLabelIds: [TRASH]`); one label per Gmail filter (multi-label entries expand); sieve globs become Gmail token search terms — dangling fragments ≤3 chars are dropped, longer ones kept; every sieve string escapes `"` and `\`, while a Gmail value is quoted where it would read as query syntax (`Quote` in `src/gmail.js`: whitespace, `(){}`, a leading `-` or `+`, a `+` outside an address, a bare `AND`/`OR`/`AROUND`) and refused if it holds a double quote.
- After renderer changes, audit the planned queries against the real `filters.js` before applying — `node src/sync.js --verbose` is a dry run that prints them. A glob-translation bug once collapsed a `*@foo*.com`-style pattern to `from:(com)` — a trash filter that would have matched nearly all mail. Never let a `from` term reduce to a bare TLD; tests cover the known shapes. The dry run covers only the Gmail side, and it mixes a change's effect with whatever drift is already pending. To audit the sieve side at all — nothing diffs it against Proton — and to see exactly what a renderer change does to every value, render the real spec through the committed renderers and the working tree's and compare the outputs; that needs no account. Neither renderer requires anything, so `git show HEAD:src/sieve.js` (or `gmail.js`) saved to a scratch file loads standalone.
- Google documents Gmail's search operators but not their lexical rules — which characters act as operators, what can be escaped. gmailctl (`mbrt/gmailctl`) is the best record: `NeedsQuoting` in `internal/engine/filter/convert.go` lists what it quotes (whitespace, `{}()`, a `+` outside an address), and its issue #66 is the source for Gmail having no escape for a double quote.
- `README.md` is generated from `README-template.md` by `npm run build` — edit the template, never the output.

### Skills

- **`ship`** (`.claude/skills/ship/SKILL.md`) — gates, squashes and fast-forwards a worktree branch onto `master`, then invokes `learn`: a landed change is when its lessons are still in context and nothing is pending. `learn` itself ends in a ship, so the skill skips that step when `learn` is the caller. See **Git**. Most sessions here have nothing of their own to land: the spec lives outside git, so one that edited `filters.js` and synced leaves an empty branch and a clean tree. That is the normal outcome, not a sign the work was lost or left uncommitted — there is nothing to gate, squash or merge until `learn` has written something, and its own ship is what gates and lands it. Say the branch was empty rather than hunting for a file to commit.
- **`match`** (`.claude/skills/match/SKILL.md`) — given a screenshot of one message (or its from/subject/List-Id), reports which `filters.js` entries match and why. Use it instead of reading the spec by hand: it evaluates both sieve semantics and the rendered Gmail query, and a disagreement between the two is the finding — the live Gmail filter matching mail the sieve glob would not is exactly the glob-translation hazard above. Its helper reuses `Specs` from `src/gmail.js` rather than reimplementing the rendering, so the queries it checks cannot drift; keep it that way. Reading them is what it does reimplement — a small parser of the rendered query — so a renderer change that adds syntax to the output, as quoting did, must teach that parser too, or its gmail verdict reports a mismatch that is not there. Test it with `--filters` pointed at an invented spec holding the new shape. It takes `--from` alone, so it doubles as the bulk coverage check when importing senders from another provider — see **Bulk-editing filters.js from a script**. It also reports **near misses**: entries that fire nothing but were written for mail like this, whose `from` no longer reaches the sender. That is how a rule dies when a sender changes domain, and nothing else catches it — a dead rule renders, syncs and diffs as in sync, because the spec and the account agree on a filter that matches nothing. Read them before concluding that mail is simply unfiltered. When scripting over its output rather than reading it, cut that section first (`sed '/near miss/,$d'`): a near miss prints the same `entry[N] → <actions>` header as a real match, so a grep for that header over the whole output credits an entry that fired nothing — and reports a sender as covered when it is not.
- **`filter`** (`.claude/skills/filter/SKILL.md`) — turns a plain-language request ("archive the digest from X") into one deterministic `filters.js` rule, states it back, dedupes it against the spec with `match`, edits and syncs. Use it for every add or change to a filter: the duplicate and partial-overlap checks are the part that gets skipped by hand.
- **`archive`** (`.claude/skills/archive/SKILL.md`) — `/filter auto-archive based on sender + subject` as one command: given a screenshot of a message, or its sender and subject, it keys an archive rule on both and runs it through `filter`. It settles what `filter` would otherwise ask — archive only, this kind of mail, sender and subject together — keeps every label the mail already gets, and checks the rule's Gmail query against real mail, so a short subject fragment cannot sweep up the sender's other mail.
- **`render-filter`** (`.claude/skills/render-filter/SKILL.md`) — the one table every response shows a rule in: six columns (Change, Sender, Subject, List-Id, Actions, Replaces), one row per condition, a plain-language sentence under it, and any column no row uses dropped. `filter` and `match` both render through it, so a rule reads the same whether it is being written or explained, and the columns are a closed set — a verdict, a reason, an entry index goes in the prose around the table, never in a seventh column.
- **A shared renderer is amended by column, the way a shared procedure is amended by step.** A caller names which columns its job fills and lets the drop rule remove the rest, rather than restating the table — which is why `match` needed no table of its own despite writing nothing. The same cost applies: adding or renaming a column means grepping the callers for what they said they fill.
- **A skill built on another amends it by step number rather than restating it.** `archive` invokes `filter` and names only the steps it changes, repeating none of `filter`'s paths or procedure — so the spec's move out of the repo rewrote `filter` and `match` and left `archive` untouched. The cost is that steps become an interface: renumbering one, or changing what it does, means grepping the other skills for the skill's name and rereading their amendments. A clean rebase is no check — it can land a rewritten step under an amendment that now restates it.
- **Single-quote a phrase grep over these files.** They quote every identifier in backticks, and a backtick inside double quotes is command substitution in zsh — so `grep "the \`filter\` skill"` runs the backticked word as a command and matches nothing, reporting a phrase as absent instead of erroring. A silent no-output grep over a file known to contain the term is this, not a missing term.
- **A worktree runs its branch's copy of every skill.** Skills load from the worktree, so one changed on `master` after the branch was cut runs in its old form — and `master` can move several commits within a single session. Before following a skill, run `git log --oneline HEAD..master -- .claude/skills/<name>`; if it lists anything, follow master's copy (`git show master:.claude/skills/<name>/SKILL.md`). It matters most for `ship`, which would otherwise land the branch by an outdated procedure.
- **`learn` drafts from session context, where every example is real.** A sender, a subject, a label name, a filter count reached for as an illustration is account content, and the privacy rule keeps all of it out of committed files — which agent files, skill docstrings and commit messages are. Invent the example instead, then run the privacy rule's check on it before committing: the pull toward the concrete case is strongest exactly when writing down what a session just proved.
- **"Why did this get labeled?" is often not a filter question at all.** Before proposing a spec change, settle which namespace the label belongs to — a Shortwave built-in or auto-apply rule wears the same chip as a Gmail user label and no entry will ever explain it. See **Mail setup → Label namespaces**.

### Bulk-editing filters.js from a script

Importing a batch of rules from elsewhere means editing `filters.js` programmatically. Six things
bite:

- **Dedupe by glob match, not string equality.** An existing `*@domain.com` already covers an
  incoming `user@domain.com`, and adding it again is dead weight. A condition carrying a `subject`
  is _not_ general coverage of its sender, so it must not count as a match. Do not write this check
  again: `.claude/skills/match/match.js --from <address>` already reports which entries cover an
  address and under which label, over the real spec. Run the whole incoming list through it first —
  in one import a substantial fraction turned out to be already covered and needed no entry at all.
- **The win is usually widening an existing entry, not adding the import.** When the incoming sender
  is the third or fourth one-off at a domain `filters.js` already lists, replacing all of them with
  `*@domain` retires more conditions than the import adds. Rotating machine senders
  (`no-reply-<hash>@`) are the clearest case — exact addresses can never keep up with them. Decide
  the shape per domain rather than globbing everything: the spec deliberately keeps exact addresses
  for consumer domains and for individual people at a mixed domain, where a glob would over-match.
- **Prettier collapses short `conditions` arrays onto one line**, so the file holds both the
  multi-line and the single-line form. A line-based inserter has to handle each, or it will splice
  entries in above the `conditions:` key and produce a syntax error.
- **Splice bottom-up, computing each insertion point immediately before use.** Indices captured for
  every group up front are invalidated by the first splice — including one that rewrites a collapsed
  array in place.
- **Anchor each edit on text asserted to be unique, and fail the run when it is not.** The spec
  carries the same address or glob under more than one entry on purpose — a sender that earns two
  labels is listed in both — so a one-line anchor is ambiguous by design, and a replace-first-match
  silently edits whichever entry comes first in the file. Widen the anchor to include the
  neighbouring lines, and assert a match count of exactly one before writing: that assertion, not
  the reading that preceded it, is what catches a value you had assumed appeared once.
- **Verify by loading the result, not by reading it**: `require()` the file to catch syntax errors,
  and compare total condition counts before and after against the number you meant to add. Then
  re-run the same coverage check that found the new entries — it should report nothing new.

### Files outside git

Personal files live in a per-user config directory outside every git checkout, so each worktree and clone shares one copy and nothing personal can be committed by accident:

```bash
CONFIG="${EMAIL_FILTER_BUILDER_DIR:-${XDG_CONFIG_HOME:-$HOME/.config}/email-filter-builder}"
```

`src/paths.js` resolves the same defaults, so the tools need no arguments: `node src/bin.js`, `node src/sync.js` and `match.js` all read `$CONFIG/filters.js` and the credentials beside it. An explicit path argument (or `--filters` for `match.js`) wins, then the env overrides `FILTERS_FILE`, `GMAIL_CREDENTIALS_FILE` and `GMAIL_TOKEN_FILE`.

- `filters.js` — the real filter spec. Read and edit `$CONFIG/filters.js` in place (edits produce no git diff). It is JavaScript, not data: a grep answers whether a word appears, but what the values contain — any quote, paren or leading `-` — needs the file `require`d, since the source also holds string delimiters, escapes and comments. Its preamble states the semantics the whole file is written against — which client's ordering rules the entries assume, and that the ordering comments left in the file from the ProtonMail era no longer bind. Read it before reasoning about where an entry sits.
- `.gmail-credentials.json` (OAuth desktop-client JSON) and `.gmail-token.json` (refresh + access token, mode 600) — `sync.js`'s credentials.
- `AGENTS.local.md` — everything the privacy rule keeps out of this file: the account, current filter and label specifics, per-session findings. Read it before touching the accounts; edit it only under the mutex below.

They used to sit at the root of the main checkout. That location now holds symlinks into `$CONFIG`, kept only so sessions started before the move keep working; nothing should reach the files through it. A session reads these instructions once, at start, so moving shared state needs a shim like this for as long as older sessions are live — remove the symlinks once none are. Claude Code refuses Edit/Write to paths under the main checkout from a worktree session, which is why they moved.

### Editing AGENTS.local.md — always hold the mutex

Editing it from a worktree is expected, not off-limits. But a dozen-plus worktrees are typically live at once (`git worktree list`), each possibly running its own agent session, and an unlocked read-modify-write silently drops whatever another session wrote in between. `flock` is not installed on macOS, so use `mkdir`, which is atomic on every POSIX filesystem:

```bash
CONFIG="${EMAIL_FILTER_BUILDER_DIR:-${XDG_CONFIG_HOME:-$HOME/.config}/email-filter-builder}"
LOCK="$CONFIG/.AGENTS.local.md.lock"

# Acquire; reclaim a lock older than 10 min as orphaned.
until mkdir "$LOCK" 2>/dev/null; do
  [ -n "$(find "$LOCK" -maxdepth 0 -mmin +10 2>/dev/null)" ] && rmdir "$LOCK" 2>/dev/null
  sleep 1
done
trap 'rmdir "$LOCK" 2>/dev/null' EXIT

# Read, modify and write "$CONFIG/AGENTS.local.md" here — all inside the lock.
```

- **One Bash call.** Shell state does not persist between tool calls, so acquire, edit and release must be a single invocation or the `trap` fires early and frees the lock mid-edit.
- **Re-read inside the lock.** Never write back content read before acquiring it.
- The lock sits beside the file it guards, so every worktree and clone contends for the same one. Sessions started before the move used `.git/AGENTS.local.md.lock` in the main checkout; a session still quoting that path is running on the old instructions.
- **Committed files are edited in the worktree, never in the main checkout.** `AGENTS.md` appears in both; editing the main checkout's copy writes into whatever branch it has out (usually `master`), where it sits unstaged and easy to miss. The same slip runs code rather than writing it: `cd` into the main checkout before invoking a committed script — a `.claude/skills/*` helper, anything under `src/` — executes whatever `master` has, not the branch, so an edit under test appears to do nothing. Stay in the worktree.

### Git

- Commit subjects are imperative and sentence-case (`Add …`, `Fix …`, `Document …`), as in the history; a `type:` prefix is optional and rare.
- Feature work happens on a branch in a worktree and lands on `master` squashed and fast-forwarded by the `ship` skill (`.claude/skills/ship/SKILL.md`), which also runs the quality gates: `npm run build && npm test && npm run format`.
- **Catch a fresh branch up before building on it.** A request is written against today's `master`, which can move several commits within a session, so a branch cut at the start may already lack code the request names. When something it cites is missing from the checkout, `git log --all -S <name>` finds where it landed; a branch with no commits of its own catches up with `git merge --ff-only master`.
- **Audit what a rebase brings in from the file, not from the commits.** Reading the range commit by commit shows text that a later commit in the same range has already removed, so a cross-reference the branch appears to break may not exist any more. Check `git show master:<file>` before fixing anything, and `git log -S '<phrase>' master` to see when it came and went.
- Before pushing to a PR branch, check whether the PR is already merged (`gh pr view <n> --json state`). Pushes to a merged PR's branch land nowhere; cherry-pick the commits onto a fresh branch off master instead.

### Session titles

The chat sidebar shows a status dot (running / awaiting input / idle) and a branch glyph for
worktree sessions; neither can be set from here — `set_session_title` takes a title string and
nothing else. So a **single leading emoji on the title** is the only lever, and it is spent on what
the app cannot know: where the work stands — so that the sidebar answers "which session is mid-sync
against the account" without opening any of them.

**Ask which session this is before renaming one.** `mcp__ccd_session_mgmt__get_session` with
`"self"` is the only answer, and it changes under a fork: a forked session carries the whole
transcript, the id it read earlier in that transcript, and a different id of its own, so a rename
that reuses the remembered one retitles the session it forked _from_ — often the one still mid-sync,
whose title is therefore the one the sidebar most needs to be true. A fork also starts in the
worktree of the session it forked from, and nothing stops a branch being checked out there, which
moves that worktree under the other session's feet; put it back on the branch it was on when the
work is landed.

| Prefix | Means                                                                                                     |
| ------ | --------------------------------------------------------------------------------------------------------- |
| `⏳ `  | implementing — the weakest of them; every other prefix takes precedence                                   |
| `🔍 `  | dry run: diffing the spec against a live account, or auditing the plan it printed                         |
| `💾 `  | writing to a live account right now — `sync.js --apply`, or driving Gmail/Proton/Shortwave in the browser |
| `📦 `  | done on the branch — gated and shippable without re-running anything                                      |
| `🚀 `  | shipping to `master`, or shipped                                                                          |
| `🚙 `  | parked: the work is sound and waiting on the user (a decision, a password, a confirmation click)          |
| `🪦 `  | dead end — kept for the findings, not to resume                                                           |
| `📚 `  | extracting learnings into `AGENTS.md`, `AGENTS.local.md` or `README-template.md`                          |

**Never mention a prefix in the response** — not what it was set to, not that it was already right,
not that it was left alone. It is sidebar state; say nothing about it unless asked.

These are **stages, not flags**: exactly one prefix at a time, and setting a new one replaces
whatever was there. **Every title carries one**, and a prefix comes off only when another takes its
place — a bare title says nothing about the session, and the sidebar cannot tell it apart from a
chat that never had a stage at all. A session with nothing left to do keeps the prefix of the last
stage it reached. The harness names a session, so every session starts without a prefix: putting the
first one on that inherited title is part of the first response, not something to wait for a stage
change to prompt. Only one reads cleanly at sidebar width, and 🚀 after 📦 is noise — the later
stage implies the earlier.

Set a prefix **optimistically** — when the stage _starts_, not when it succeeds — and correct it if
the stage falls over. A title that only becomes true at the end is blank for the whole stretch the
sidebar is there to describe. 🚀 is set by the `ship` skill, which sets it before it runs the gates
and puts it back if the push fails, so it stays true on its own. 📚 goes on the moment the `learn`
skill is invoked, before anything is read. The rest are set by hand when they apply, and nothing
reconciles a title against reality: an abandoned session keeps whatever prefix it had.

**Handing back is itself a stage.** A response that closes on something for the user to do — a
decision, a password, an OAuth client secret — is a park, and 🚙 goes on before that response, since
the idle dot cannot tell "waiting on you" from "given up on". Handing over a change to the account
is the exception: while the user is clicking through a batch of filter deletions in the Gmail UI, or
confirming a Proton forward, the account is still in flux, so it stays 💾 — the warning to other
sessions outranks the one to the user, who is already reading the response — and becomes 🚙 once
nothing is in flight.

⏳ is the weakest of them: every other prefix takes precedence, so it only shows while nothing more
specific applies. Set it by hand when implementation starts, and replace it when control goes back
to the user — 🚙 if the work is waiting on them, otherwise whatever stage the branch actually
reached.

🔍 and 💾 are the ones that matter to _other_ sessions. `filters.js` is one file in the config
directory, not a per-worktree copy, so concurrent edits race on the same bytes and a fact read from it
early in a turn can be stale by the end of one — re-read before reporting it, and expect a finding
about a live entry to be someone else's edit rather than a bug. The accounts are one shared slot on
top of that: a dry run diffs against live state, and an apply changes it, so a second session that
syncs concurrently audits a plan that is already stale. `sync.js --apply` enforces that much for
itself — it holds a lock and refuses while another run has it (see **Gmail → Account and filters**)
— but nothing enforces the rest. The stretch between a dry run and the apply it was auditing, and
browser work against the mail UIs, are warned about by the prefix alone, so carry it for those — the
browser is equally single-occupancy.

Nothing reads the prefix, so it warns only a session that goes looking. Two sessions drove the
Shortwave UI against one account here, each deleting rules while the other was mid-pass, and the
first sign of it was a row vanishing that this session had not touched. Before browser work on an
account, list the live sessions (`mcp__ccd_session_mgmt__list_sessions`) and look for another
carrying 🔍 or 💾; a row or entry that changes without your having changed it is that, not a bug.

**A message from another session describes the account as it was when written.** One arrived here
naming rules that had to survive; some had stopped needing to a few minutes earlier, when their
coverage was added to the spec and synced, and following it would have reverted approved work and
re-created a rule that did nothing. Re-verify every claim in it against live state — `match.js`
for coverage, the account for the rest — before acting, and reply with what you found, or the
sender is left reporting a loss that never happened.

**Messaging the other session does not stop it.** `send_message` queues behind whatever turn that
session is mid-way through, so it lands after the next several writes have — one naming the rules
that had to survive arrived after some were already deleted. Detection is the whole defence, and
once both sessions are writing there is no safe way to divide the work: stop, and let the user say
who owns the account.

A cloud session never reaches 🔍, 💾 or 🚀. `filters.js` and the OAuth credentials sit outside the
repo (**Files outside git**), so a fresh clone has no spec to diff and no way to reach the account;
and `ship` pushes straight to `master`, where the cloud harness wants a branch and a pull request
instead. It ends at 🚙 — the work is sound and waiting on a session on the user's machine to verify
it against the real spec.

## Mail setup

- **Gmail** is the destination account and the backend for mail, user labels, and Gmail filters. Gmail filters run server-side before any client sees a message.
- **Shortwave** (app.shortwave.com) is the Gmail client in use. It honors Gmail filters and adds its own layer — AI filters, auto-apply rules, bundles, splits — stored in Shortwave's backend and invisible to Gmail.
- **ProtonMail** is the source side of the migration: it runs the generated `out/*.sieve` scripts plus hand-made filters and auto-forwards to Gmail.
- **Division of labor:** keep all deterministic sender/subject→label routing in `filters.js` → Gmail filters (portable, versioned, client-independent). Use Shortwave's layer only for what Gmail cannot express: AI classification, bundles, delivery schedules, splits. Avoid "Always Apply".
- Both providers apply **all** matching filters, but Gmail's are unordered and stack their actions, while Proton's run in list order and the last conflicting action wins — see each section.

### Label namespaces (three things can share one name)

| Kind                     | Lives in                      | In Shortwave's picker                            | Notes                                                                                                                                                                              |
| ------------------------ | ----------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gmail user label         | Gmail, syncs everywhere       | plain tag icon; URL `/labels/gmail%2FLabel_<id>` | The only kind Gmail filters can apply                                                                                                                                              |
| Shortwave built-in label | Shortwave only                | own icon (cart, plane, …); URL `/labels/<name>`  | Travel, Calendar, Newsletters, Purchases, Finance, Social, Promotions, Forums, Updates — auto-applied by Shortwave's classifier, invisible to Gmail, not removable from the picker |
| Gmail system category    | Gmail UI only (`#category/…`) | not shown                                        | ML-assigned; not writable by apps; filters' Categorize-as covers only the five inbox tabs                                                                                          |

Near-identical names across namespaces are easy to misread in the "Label as" picker.

## Browser automation

Lessons that held across every web app driven from these sessions — the Gmail, Shortwave and Proton SPAs, and the Google Cloud console; each app's section below adds only its own quirks.

- **Click by ref, not by coordinate.** The screenshot frame and the page viewport report different sizes (1028×1176 vs 919×1051 in one session), so coordinate clicks land ~15% off. Use refs from `find`/`read_page`, or dispatch events from JS.
- **Refs go stale** after any click, scroll, or re-render. Re-run `find` immediately before each click, one mutation per call, and verify state afterwards — JS DOM reads are the most reliable verification. A stale ref opened the wrong Proton filter's Edit dialog twice in one session.
- **When a ref click does nothing, dispatch MouseEvents** (`mouseover/mousedown/mouseup/click`; Proton modals also need `pointerdown/pointerup`) from `javascript_tool`. Which of the two works is app- and control-specific; the per-app notes say which.
- **A hover-revealed control needs a real cursor hover, not a dispatched one.** A dispatched
  `mouseover`/`mouseenter` reaches the page's own handlers but never sets CSS `:hover`, so a control
  that exists only while its row is hovered is not in the DOM to be clicked or even found. Move the
  cursor with `computer`'s `hover` on the row, then read the DOM: the control is there for as long as
  the cursor stays, and a dispatched click on it works from that point. The two techniques split by
  control, not by app — dispatch for anything click-activated, a real hover first for anything the
  pointer reveals.
- **"Cannot access a chrome-extension:// URL of different extension"** wedges `computer` (and in Proton also `javascript_tool`) while `find`/`read_page`/`get_page_text` keep working. In Gmail it means a native dialog is pending; in Proton it happens with no dialog at all. Recovery is the same: close the tab and open a fresh one.
- **Read the app's own data layer, not its UI.** Before transcribing rows one dialog at a time, try
  the two page-context routes on a logged-in tab: the app's HTTP API carrying the session cookie
  (`credentials: 'include'`), and IndexedDB, which a local-first client fills with its whole account
  state so it can work offline. Both are same-origin from `javascript_tool`, so neither needs an API
  key or a second sign-in. Enumerate before guessing — `indexedDB.databases()`, then the object store
  names, then the keys. A UI that advertises no export usually still has one of these: it is how
  Proton's filters and Shortwave's auto-apply rules both come out.
- **A desktop build of a web app is a separate store.** Its Electron renderer keeps its own IndexedDB
  under its own app-data directory, which browser-tab tools cannot reach. It syncs the same backend,
  so the browser copy is not a partial one — drive the web app and leave the desktop app alone.
- **Getting bulk data out of a page needs chunking and a checksum.** `javascript_tool` truncates a
  long result mid-value, and the extension replaces anything that looks like cookie or base64 data
  with a redaction marker — so returning a raw API response yields nothing usable. Stash the payload
  on `window`, return only the derived fields you need, and emit the bulk of it in explicit slices.
  The clipboard is not an escape hatch — in a driven tab `navigator.clipboard.writeText` throws
  because the document is not focused. Hash the payload in the page (`crypto.subtle.digest`) and
  again on the written file; that is what proves the transcribed copy is complete and in order. The
  digest trips the same redaction: a hex string returned whole comes back as a marker, so return it
  in a few slices.
- **Native `window.confirm()` dialogs cannot be clicked** by any automation path, and overriding `window.confirm` from `javascript_tool` does not work — the tool runs in an isolated world; the page still sees the native function.

## Gmail

### Account and filters

- Target account and current filter/label specifics: see **AGENTS.local.md**. Verify the account before acting — the browser tab title, or the `Account:` line `sync.js` prints.
- Gmail caps filters at 1,000 per account; check the current count before large changes.
- Gmail applies **all** matching filters, and they are unordered — overlapping rules stack their actions (trash + label both apply; trashed mail is hidden from label views).
- Change filters with `node sync.js` (`users.settings.filters` over OAuth), not the settings UI; the UI notes below are a fallback.
- **Apply without asking when the request is clear and the plan is clean.** A request to change how mail is labeled means the live account, not just `filters.js` — edit the spec, dry-run, audit the plan, then `--apply --yes`. Stop and ask only if something unusual turns up: an unfamiliar label to create, a term that vanishes without a replacement, a bare-TLD `from:`, or a delete count the re-chunking does not explain.
- **Report a completed sync with a `💾 Synced to gmail` line.** It is how the user tells a spec-only edit from one that reached the account.
- **Never report mail already sitting in the inbox when a filter is added, and never offer to apply one retroactively.** Gmail filters are not retroactive and that is fine: the user runs inbox zero and clears what is already there by hand. Saying a message "stays put" is noise.
- **`--apply` serializes itself.** It takes a directory lock at `gmail-sync.lock` in the config directory — beside the spec and the credentials, so every worktree and every clone contends for one lock — and refuses while another run holds it, naming that run's worktree, branch and session id so the user knows which chat to go back to. A lock whose process has died is reclaimed automatically; a live holder is never taken from however long it has been there, because the delete confirmation sits inside the lock. **Dry runs take nothing**, so the gap between auditing a plan and applying it is still yours to keep — the spec can change under an audit, and that is what 🔍 in the sidebar is for.
- **The lock protects the account, not your edit.** It serializes applies; it does nothing about the
  spec each one reads. So the collision **Dry-run the previous spec before applying an edit**
  describes also runs the other way: your edit can reach the account inside someone else's apply
  before you have dry-run it once, which is how a rule went live here. Keep the stretch between
  editing the spec and applying it short, and expect an account already ahead of your own apply.
- **A dry run reporting `Already in sync` straight after your own edit means the edit is already
  live.** It prints exactly what a no-op edit prints, and the counts line cannot tell the two apart.
  Read the live filters back for the terms you just added — it needs no lock and no plan:

  ```bash
  node -e 'require("./src/gmail-api")().then(api => api.listFilters()).then(fs => fs.filter(f => /<your term>/.test(f.criteria.query || "")).forEach(f => console.log(f.criteria.query, JSON.stringify(f.action))))'
  ```

  Then report what is live rather than what you ran: `💾 Synced to gmail` is still true, but say
  whose apply carried it, since that run was landing its own change at the same time.

- The diff is genuinely idempotent: Gmail stores `criteria.query` verbatim and hands it back unchanged, so a dry run immediately after an apply reports zero changes. If a re-run ever shows churn on filters nobody touched, suspect the renderer, not Gmail.
- **Hand-made filters diff as different even when they mean the same thing.** A rule built in the Gmail UI populates the API's `from`/`to`/`subject` criteria fields; `sync.js` puts everything in `query`. `from:alice@example.com` and `query:"from:(alice@example.com)"` match the same mail but are not equal, so migrating a hand-made rule into `filters.js` always plans as a delete plus a create. That is correct and expected — it is not the renderer misfiring.
- **A large delete count in a sync plan is usually re-chunking, not lost coverage.** Adding senders to
  a label group re-splits that group's 600-char query chunks, so the old chunks are deleted and
  replacements created. Do not take this on faith — check that every `from:`/`subject:` term in each
  deleted query reappears in a created query _under the same label_. A term that does not is either a
  genuine removal or a label move, and is worth resolving before applying. Check it by rendering
  rather than by reading the plan: pass the pre-edit spec and the edited one through `Specs` from
  `src/gmail.js`, split each query into terms the way `splitTerms` in `.claude/skills/match/match.js`
  does — on the top-level separators only, ignoring the ones inside parentheses or a quoted phrase —
  and diff the resulting term multisets keyed by label-plus-inbox-effect. A plan of dozens of deletes
  and creates then reduces to the few terms that actually moved, and everything it does not name is
  re-chunking. This needs a copy of the spec from before the edit, and the spec is not in git — so
  take one before editing, not after.
- **A plan lists only the deletes and creates, never the filters it leaves alone.** So auditing the
  plan — for the bare-TLD hazard in **What the code does**, or anything else — says nothing about
  the untouched majority still live on the account. Audit the rendered spec, not the plan, when the
  question is about all of them.
- **Dry-run the previous spec before applying an edit.** The account is not necessarily in sync to
  begin with, and unapplied drift rides along in whatever you apply. Diffing the old spec against
  live first is what separates your change's effect from what was already pending. The baseline
  goes stale as easily as the plan does — another session editing the spec or syncing in between
  changes what an apply would do — so audit the plan you are about to apply, not an earlier one.
  The apply prints its own delete/create counts: when they exceed the dry run's, the spec moved
  under the audit and someone else's edit went to the account along with yours. Copy the spec aside
  before editing it — diffing that copy afterwards is the only way to say which conditions were
  theirs, and the report has to name them.
- **`Already in sync` says the spec equals the account, never that a prerequisite edit is in the
  spec.** A task gated on another session's work landing first — an import, a widening — passes
  that gate while the work is still absent, because the two agree on a spec that never received
  it. Check the thing itself: run the senders the task names through `match.js` and read the
  labels back. Here a clean dry run sat over a spec missing most of the senders it was supposed
  to have, and the import landed mid-task, inverting the finding.
- **`sync.js` creates any label the spec names**, so a typo or a foreign label name imported from
  another provider silently becomes a new Gmail label. Read the dry run's `Labels to create` line
  before applying, and confirm an unfamiliar name with the user — label vocabularies do not map 1:1
  across providers.
- A Gmail MCP server is connected (list_labels, delete_label, update_label, label/unlabel thread/message, search_threads, drafts, etc.). It exposes **no filter APIs**.
  - `search_threads` label queries have worked with label **IDs** (`label:Label_42`, from `list_labels`) in some sessions and with the display name (`label:"Name"`) in others, the other form returning nothing. Before concluding a label is empty, run the same query form against a label known to hold mail — a malformed query returns exactly what an empty label returns.
  - `delete_label` is the clean way to remove a label; confirm it is empty first with `search_threads` (`in:anywhere`). The Gmail sidebar may keep rendering a deleted label until the page reloads.

### OAuth app (Google Cloud console)

`sync.js` needs a Google Cloud project with the Gmail API enabled and a Desktop OAuth client. Project and client specifics are in **AGENTS.local.md**. What is worth knowing before touching it:

- **Three scopes, and the obvious one is not enough.** `gmail.settings.basic` covers the filter endpoints but _not_ `users.labels`, which the action mapping needs to turn a `fileinto` destination into a label id (and to create a missing label), so `gmail.labels` is required too. `userinfo.email` is there only so the sync can print which account it is about to write to.
- **Publishing status governs token lifetime.** An External app left in _Testing_ has its refresh token expired by Google every 7 days, so nearly every run reauthorizes. _In production_ makes it durable. Publishing requires a reachable home page and privacy policy URL plus the domain under Authorized domains — that is the only reason `site/` exists.
- **Publishing does not make the app verified.** The "Google hasn't verified this app → Advanced → Go to …" interstitial and the 100-user cap persist, because Gmail's filter scopes are restricted; clearing those needs a full verification review, which is not worth it for a single-user tool. Expect the interstitial on every fresh authorization.
- **Creating a project may demand a billing account** — the console refuses without one even though Gmail API usage is free. Attaching one is the user's decision, not an agent's.
- **The client secret is shown once, at creation.** Agent tooling is blocked from scripting anything that handles it, so the user downloads the JSON and places `.gmail-credentials.json` themselves. Do not close the creation dialog before that file exists, or the client has to be recreated.
- **Do not borrow an unrelated existing project** just because its consent screen is already configured. It pollutes someone else's app with a client and an enabled API, and the consent screen users see carries that project's branding.
- **The console needs dispatched MouseEvents.** Ref clicks silently no-op on its buttons (Enable, Create, Save) far more often than they work. Its dropdowns are `cfc-select` custom elements with `[role="option"]` lists, not `<select>`, so `form_input` does not drive them — click the select, then dispatch on the option. See **Browser automation**.

### Settings UI (fallback — prefer `sync.js`)

Everything below applies only when a session is forced into `https://mail.google.com/mail/u/0/#settings/filters`.

**XML import — automatable, but re-imports duplicate:**

1. "Import filters" link → upload with `file_upload` on the file input ref (never click "Choose File" — it opens a native picker) → "Open file".
2. In the review list Gmail **unchecks** rows it warns about (label+delete combos). Click the import section's "Select: All" link — the All/None pair immediately preceding the "Create filters" button (there are three All/None pairs on the page).
3. Leave "Apply new filters to existing email" **unchecked** unless retroactive application is explicitly wanted.
4. "Create filters" runs an in-page progress overlay at ~1–2 filters/sec (a ~100-filter import takes a couple of minutes). Filters identical to existing ones are silently skipped (the "Failed or skipped" counter).
5. Re-importing the full file **duplicates** every non-identical-but-overlapping filter — Gmail only dedupes exact matches (criteria and actions). To update existing filters, edit them or delete the old ones first; don't blind re-import.

**Filter edit — automatable:** row "edit" link → criteria overlay → Continue → actions screen. The label picker is a div listbox (`role=listbox`/`role=option`), not a `<select>`: open it by clicking the listbox ref, then select by dispatching MouseEvents on the option with the **exact** target text (beware near-identical names), verify the listbox text via DOM read, then "Update filter".

**Filter delete — not safely automatable in the browser.** The per-row delete links and the bulk Delete button call native `window.confirm()` (see **Browser automation**); the API deletes outright, with no dialog.

- While a dialog is pending, `computer` actions fail with the chrome-extension error and DOM tools keep working; close the wedged tab and create a fresh one.
- **Danger:** a pending dialog can be auto-_accepted_ when its tab is destroyed — a deletion that appeared cancelled can land minutes later. Never leave a delete dialog pending, and recount filters afterward rather than assuming a cancelled delete stayed cancelled.
- Deletions should be done by the user (tick checkboxes → Delete → one OK confirms the whole batch), or with the user present to click OK.

**DOM notes:** old-school HTML in the top document (no iframes). Filter rows are `tr` elements containing "Do this:" plus an edit link; edit/delete controls are `span.sA[role="link"]`. The settings page preloads other tabs' content — label-management rows are also in the DOM, so always constrain row selectors with "Do this:".

## Shortwave

### Built-in labels have no off switch

- Settings → Labels renders the nine built-in labels with an ⓘ info icon per row and no toggle, hide, or delete control. Nothing in Labels, Inbox setup, or Appearance stops the classifier from applying them.
- A built-in label is a _label only_ — it does not create a bundle or an inbox split by itself. Bundles (Inbox setup → Label bundles) and splits are separately opt-in, so "hide its bundle" is not an available workaround.
- The stated override is a filter, per the section header: built-in labels "are automatically added to new emails. You can override this behavior by defining filters." An AI filter can target a built-in label (observed on an existing filter's action chip); the Create AI filter picker list was not confirmed.
- To keep a built-in label out of the inbox without removing it: Settings → Filters → **Label skip inbox**. The label stays applied and stays in the sidebar and picker.
- Verified 2026-09 against Updates; the row UI is identical for all nine.

### Rules and filters

- "Always Apply" / auto-apply rules (Settings → Filters → Label auto-apply rules) are stored in **Shortwave's backend** — never as Gmail filters, even for plain sender→label rules targeting Gmail labels. They don't count toward Gmail's 1,000-filter cap.
- Effect vs rule: applying a Gmail label syncs to Gmail (visible in all clients); the rule itself is Shortwave-only and dies with the Shortwave account.
- **The UI has no export** for auto-apply rules — the rule dialog offers only add/remove sender — but
  the whole rule set is in IndexedDB, so do not transcribe gear dialogs one at a time. On any
  logged-in tab, open the `shortwave-db-acct-<id>` database, read object store `settings` key
  `all_settings`, and take `.rules`. Each entry is
  `{ id: { criteria: { senderEmailAddress } }, settings: { userLabelsToAdd, userLabelsToRemove, sharedLabelsToAdd, sharedLabelsToRemove, threadFlagsToAdd, threadFlagsToRemove, inboxVolume, autoTrashMessage } }`.
  Resolve the `{labelId: "gmail/Label_N"}` references against object store `gmail_labels` (`{id, name, color}`).
  `all_settings` also holds `bundling`, `notifications` and `deliverySchedules` by the same route.
  `autoTrashMessage` and `inboxVolume` are string enums (`'ON'`/`'OFF'`, `'INHERIT'`), so a
  truthiness test on either reports every rule as set.
- **A rule keys on exactly one sender address and nothing else.** `criteria` has no subject or
  list field, so a Shortwave rule can never be narrower than "all mail from this address" — which is
  why they accumulate one per sender and why they translate cleanly into `filters.js` `from` entries.
- **`threadFlagsToAdd` drives a built-in label, not a Gmail one.** Its values are upper-case
  built-in identifiers rather than label ids — Shortwave's own labels, which wear the same names as
  Gmail user labels in the picker (**Label namespaces**) and have no Gmail equivalent. There is no
  mechanical translation into a `filters.js` entry — the two are different namespaces, and the same
  name in each is a coincidence, not a mapping. What is available is substitution: naming a Gmail
  user label to stand in for the built-in, which changes which chip the mail wears and is therefore
  the user's call, not a conversion an agent performs quietly. `userLabelsToRemove` is not portable
  at all: Gmail filters add labels, they cannot remove them.
- **Retiring a rule is port, sync, verify, then delete — in that order.** A rule whose effect no
  Gmail filter reproduces is not a permanent keep; it is a keep until the spec covers it. Add the
  condition, apply the sync, confirm with `match.js` that the sender now gets the same outcome, and
  only then remove the rule. Deleting first opens a window where nothing handles that mail, and a
  list of "rules that must survive" drawn up before any porting goes stale the moment one is ported
  — which is how two sessions can each be right about a rule and still disagree.
- **A rule that removes a label may be removing nothing.** Before treating its deletion as a
  regression, find what actually applies that label: `match.js` on the sender, and a
  `from:<sender> label:<name>` search in Gmail against a bare `label:<name>` control, so an empty
  result is distinguishable from a malformed query. A removal rule can outlive whatever used to
  apply the label, leaving it with no effect to reproduce.
- Shortwave cannot manage Gmail filters: it shows a cached count (Settings → Filters → "Gmail filters", refresh link) and links out to Gmail settings for editing.
- AI filters and the quick-start filters (Needs Action, Cold Outreach, FYI, Travel, Finance, Purchases) are Shortwave-side natural-language classifiers, off unless added.

### Automating the Shortwave web app

- SPA; settings at `/settings/labels`, `/settings/filters`, `/settings/inbox`. A "We're still importing your email" interstitial may appear — click Refresh.
- Rule-row gear icons are hover-revealed and absent from the accessibility tree: locate them by geometry in JS (element at the same row height, right of the row) and dispatch MouseEvents.
- The rules list is grouped by label, one row per label with a sender count, so a built-in label and
  a Gmail user label of the same name show as two identical-looking rows. Tell them apart by the icon
  and by position — the built-ins sort above the alphabetical run of user labels — and open the dialog
  to read the sender before removing anything.
- The rule dialog is titled "Auto-apply rules for \<Label\>" with ALWAYS APPLY / ALWAYS REMOVE sender lists.
- **Escape closes the whole settings panel, not the open dialog** — it navigates back to the inbox and re-renders the rule list, so using it to close between rules leaves a loop reading stale rows and firing gear clicks on the wrong ones. Close with the dialog's own control: the first `<button>` inside the overlay.
- **A long address is ellipsis-truncated in the row text** (`alerts@..ation.example.com`), so matching a row on the full address silently finds nothing while short addresses match fine. Split the shown value on `..` and test the target with `startsWith`/`endsWith`.
- **The address sits in a different element per sender** — an `<h4>` beside the display name, a `<p>` when the sender has none. Take the row's deepest leaf whose text looks like an address rather than selecting a tag.
- **Auto-trash rules are not auto-apply rules.** They live in a separate "Blocked senders" section with its own row structure and never appear under Label auto-apply rules, so a deletion pass that walks only the label rows misses them.
- **Emptying a label group removes its row**, and a rule carrying two labels survives removal from one — it disappears only when its last label goes. So the rule count falls more slowly than the senders removed; count rules, not rows, to tell a failed removal from a partial one.
- **The per-sender remove button in the rule dialog** is hover-revealed and, unlike the row gear, does
  **not** appear from a dispatched hover: hover the sender row with `computer` first, then click the
  button that materialises (see **Browser automation**). Removal is immediate — no confirmation step,
  no undo — and the next sender shifts up into the removed one's position, so repeating the same
  hover-and-click empties a list without re-reading the geometry.
- "Create AI filter" (Settings → Filters) did not open its dialog from either a ref click or a coordinate click — no modal rendered either way. Unresolved; budget extra time if a session needs that flow.

## ProtonMail

Proton runs the generated `out/*.sieve` scripts plus any hand-made filters and forwards to Gmail; account specifics live in **AGENTS.local.md**.

### Filter order — last conflicting action wins

Proton applies **all** matching filters, in the listed order, and per Proton's own docs: "When multiple filters apply to a message, all non-conflicting actions will be applied. If there are actions that conflict, the last action will be applied to the message." ([How to use email filters](https://proton.me/support/email-inbox-filters))

Two filters that both `fileinto` a folder **conflict**; the message lands in the _later_ filter's folder. Labels and stars are non-conflicting and accumulate from every match.

This has a sharp consequence for this project:

- **A catch-all "move to Archive" filter must be ordered _before_ the generated sieve scripts.** Placed after them it silently overrides every `trash` rule the builder emits — junk that should be trashed is archived instead, with no error anywhere. Same for any hand-made folder-moving filter that overlaps the generated rules.
- The same hazard exists _within_ a generated script: a later `fileinto "archive"` block beats an earlier `fileinto "trash"` block for any message matching both. Today's entries overlap on sender globs but are kept disjoint by their subject conditions — re-check after editing `filters.js` if a sender appears in both a trash entry and an archive entry.
- The generated scripts contain no `stop`, so nothing short-circuits; every later filter still runs.

### What the Proton UI filter builder can express

Worth knowing before assuming a rule has to live in `filters.js` — this repo's builder supports only sender/subject/mailing-list conditions and `fileinto` actions, so anything below has to be a hand-made Proton filter:

- **Conditions:** the subject / the sender / the recipient / the attachment. Operators: contains, is exactly, begins with, ends with, matches, plus a negation of each.
- **Actions:** label as (any number), move to (exactly one folder), mark as read and/or starred, send auto-reply.
- Conditions are combined with ALL or ANY. One condition row accepts **multiple values**, OR'd inside the comparator — so with a negated comparator a single row means "matches none of these", which is the compact way to write a multi-address exclusion.
- Proton prepends a spam guard to every UI-built filter, so Spam is never touched.
- **Filters can be applied retroactively**, contrary to the usual assumption: a checkbox at filter creation, and "Apply to existing messages" in the row's ⋮ menu afterwards.
- **"Edit Sieve" works on UI-built filters** and is how to read the sieve one generates. Use it to verify a single filter before trusting it — but to read many, use the API below rather than opening each row.

### Reading every filter at once, over the API

Opening rows one at a time does not scale past a handful, and the row name is only a naming
convention — the sieve is what actually runs. Fetch the lot from page context on any logged-in
Proton tab:

```js
const uid = JSON.parse(localStorage.getItem('ps-0')).UID
await fetch('/api/mail/v4/filters', {
  credentials: 'include',
  headers: { 'x-pm-uid': uid, 'x-pm-appversion': 'web-account@<version from the sidebar footer>' },
})
```

- Auth is the `AUTH-*` cookie (HttpOnly, so `credentials: 'include'` does the work) plus the `x-pm-uid`
  header, whose value is in `localStorage['ps-0']`. Nothing needs the password.
- Each filter returns `Sieve` (the source) and `Tree` (Proton's parsed AST). Parsing `Sieve` is
  straightforward once the boilerplate — the `require` lines, the generated spam guard, and the
  `/** @type … @comparator … */` annotation — is stripped; what remains is one `if allof/anyof (…) { … }`.
- The generated `sieve-builder-*` scripts come back in the same list and dwarf everything else.
  Filter them out by name before parsing.
- Parse rather than trust: assert that every filter matched your grammar and report the ones that did
  not, instead of silently skipping them.

### Forwarding interacts with none of this

- Auto-forwarding is envelope-based: it forwards everything delivered to the address regardless of headers, and runs independently of filters. Archiving or trashing a message in Proton does **not** stop it being forwarded — which is what makes the archive-everything strategy safe.
- Forwarding is configured **per address**. An address with no rule forwards nothing, so audit the full address list before adding any catch-all archive rule, or mail to an unforwarded address is archived having never reached the destination.
- Enabling a forward to a destination without end-to-end encryption **disables E2EE for the source address** (zero-access encryption remains). Proton warns at the confirmation step. Get the user's sign-off — it is a security change, not a mail-routing one.
- Creating a rule requires the account password, then the _recipient_ clicks a confirmation link. An agent can do neither: hand both steps to the user.

### Checking where mail actually landed

Confirming what a filter did, without mutating anything:

- Proton search takes hash params and is scoped to the folder in the path: `/u/0/all-mail#from=<domain>`, `#to=<address>`, `#keyword=<text>`. Running the same query against `/u/0/trash` and `/u/0/archive` shows which folder a sender's mail is really landing in — that comparison is what separates "the trash rule fired" from "a later filter overrode it".
- In All Mail a row carries a location tag for Archive/Inbox/Sent but **not** for Trash, so an untagged row reads as inbox mail when it isn't. Trust the folder-scoped search, not the tag.
- Prefer search to opening messages: opening one marks it read. If you must open an unread message to read its headers, restore it with "Mark as unread" afterwards.
- **One message's placement proves nothing** — the user may have moved it by hand. Look for a before/after split across many messages from one sender, or settle the semantics against Proton's docs. An inference drawn from a single message led to a wrong conclusion about filter ordering in one session.
- To confirm a message actually reached the destination account, query the Gmail MCP (`search_threads`) rather than reading the Gmail UI.
- Proton groups same-subject messages into one conversation regardless of age, so a thread can span years and a new message can look like an old one. In the conversation view each message is its own `<article>`; `querySelector('article')` returns the first, not the one you opened — read them all and match on the date.

### Automating the Proton settings UI

- **Modals do not open from a `computer` ref click.** Dispatch `pointerdown/mousedown/pointerup/mouseup/click` MouseEvents from `javascript_tool` instead. Inside an open modal the reverse holds: ref clicks work and JS dispatch on dropdown options silently does nothing. Native `.click()` works on toggle labels but not on dropdown triggers.
- **Dropdown options often need a second click** — the first opens/re-opens the list without selecting. Always read the control back to confirm the value took.
- Never scroll between the `find` and the click it feeds, and verify which record a modal actually opened before touching it (see **Browser automation** on stale refs).
- Several closed `.modal-two` nodes linger in the DOM. Select the live one with `[...document.querySelectorAll('.modal-two')].filter(d => !d.classList.contains('modal-two--out')).pop()`.
- **Reordering filters** has no menu item — drag handles only — but dnd-kit's keyboard sensor works: focus `td[aria-roledescription="draggable"]`, Space to lift, ArrowUp/ArrowDown, Space to drop. Three gotchas: the drag attributes attach only _after_ a real scroll interaction on the page; moves must be chunked (`repeat: 10` with a ~1s wait between — one `repeat: 100` call does nothing); and the drag overlay leaves a phantom duplicate row that captures focus, so reload between drags. Reordering persists server-side. Moving a filter from the end of a ~200-row list to the top took about twenty chunks.
- Row ⋮ menu: Apply to existing messages / Edit Sieve / Delete. If it will not open, its items are already in the DOM — click by aria-label (`Edit Sieve filter "<name>"`).
- Deleting or disabling a superseded filter: the row toggle is reversible and is the safer choice over Delete when a rule may need backing out.
