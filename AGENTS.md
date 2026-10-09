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
- **An action other than a label is a reserved `fileinto` keyword** — `archive`, `trash`, `neverspam`, matched case-insensitively — so no label can be named after one. A new one touches every consumer of the destinations: `Specs` and `Entry` in `src/gmail.js`, `Action` and `DescribeAction` in `src/gmail-sync.js`, `Fileinto` in `src/sieve.js` (which writes any unknown destination as a Proton folder), the gmail line in `match.js`, the Actions column in `render-filter`, the destination list in `filter`, README Gmail → Mapping and the invariants below. `git grep -n trash -- src .claude` lists them.
- `site/` is the small public web page the Gmail OAuth consent screen links to (home page plus privacy policy), deployed separately from the CLI. It exists because Google will not let an app leave Testing status without a reachable home page and privacy policy URL. The contact address is injected from `CONTACT_EMAIL` (a gitignored `.env` locally, a service variable in production) rather than committed, since this repo is public — without it the contact falls back to the GitHub issue tracker. Hosting specifics are in AGENTS.local.md.
- A `subject` is a substring in sieve and a quoted phrase in Gmail, so it must appear contiguously in the real subject. A family that varies mid-phrase needs one condition per variant — a stop word alone splits it, the way "Invoice is Ready" shares no contiguous fragment with "Invoice Ready" past the first word. Prefer the longest fragment of fixed wording shared by the whole family — never a per-message date, name or number, even one every sample happens to share (`filter` skill, step 2) — and check it against the real subjects rather than one sample. The fragment can never contain a double quote: Gmail search has no escape for one, so the renderer refuses the value (in a `from` or `list` too) and the whole render or sync stops — take the fragment on one side of the quote.
- Mapping rules are documented in README.md (Gmail → Mapping). Key invariants: conditions sharing the same actions are OR-merged into `hasTheWord` queries chunked at 600 chars (`maxQueryLength` option); `archive` → skip the inbox (`shouldArchive` in XML, `removeLabelIds: [INBOX]` over the API); `trash` → delete (`shouldTrash` / `addLabelIds: [TRASH]`); `neverspam` → never send to Spam (`shouldNeverSpam` / `removeLabelIds: [SPAM]`; nothing in sieve, where Proton's spam guard runs first); one label per Gmail filter (multi-label entries expand); sieve globs become Gmail token search terms — dangling fragments ≤3 chars are dropped, longer ones kept; every sieve string escapes `"` and `\`, while a Gmail value is quoted where it would read as query syntax (`Quote` in `src/gmail.js`: whitespace, `(){}`, a leading `-` or `+`, a `+` outside an address, a bare `AND`/`OR`/`AROUND`) and refused if it holds a double quote.
- After renderer changes, audit the planned queries against the real `filters.js` before applying — `node src/sync.js --verbose` is a dry run that prints them. A glob-translation bug once collapsed a `*@foo*.com`-style pattern to `from:(com)` — a trash filter that would have matched nearly all mail. Never let a `from` term reduce to a bare TLD; tests cover the known shapes. The dry run covers only the Gmail side, and it mixes a change's effect with whatever drift is already pending. To audit the sieve side at all — nothing diffs it against Proton — and to see exactly what a renderer change does to every value, render the real spec through the committed renderers and the working tree's and compare the outputs; that needs no account. Neither renderer requires anything, so `git show HEAD:src/sieve.js` (or `gmail.js`) saved to a scratch file loads standalone.
- Google documents Gmail's search operators but not their lexical rules — which characters act as operators, what can be escaped. gmailctl (`mbrt/gmailctl`) is the best record: `NeedsQuoting` in `internal/engine/filter/convert.go` lists what it quotes (whitespace, `{}()`, a `+` outside an address), and its issue #66 is the source for Gmail having no escape for a double quote.
- `README.md` is generated from `README-template.md` by `npm run build` — edit the template, never the output.

### Skills

- **`ship`** (`.claude/skills/ship/SKILL.md`) — gates, squashes and fast-forwards a worktree branch onto `master`, then invokes `learn` and archives the session: a landed change is when its lessons are still in context and nothing is pending. `learn` itself ends in a ship, so the skill skips that step when `learn` is the caller. See **Git**. Most sessions here have nothing of their own to land: the spec lives outside git, so one that edited `filters.js` and synced leaves an empty branch and a clean tree. That is the normal outcome, not a sign the work was lost or left uncommitted — there is nothing to gate, squash or merge until `learn` has written something, and its own ship is what gates and lands it. Say the branch was empty rather than hunting for a file to commit.
- **`sync`** (`.claude/skills/sync/SKILL.md`) — the dry run and the apply as one operation, and the owner of `🔍 ` and `💾 `. `filter` and `archive` sync through it rather than calling `sync.js`, so the prefixes go on wherever a sync happens; the lock `--apply` takes does not cover the dry run, so the plan is stale the moment another session applies.
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

The prefix glossary arrives in every session from the `emotive` plugin, and nothing here repeats it.
These are the rows this repo can state exactly.

- `📦 ` means `npm run build && npm test && npm run format` passed, in that order — the build
  regenerates `README.md` from `README-template.md` so the committed README matches the code, jest
  runs once, and prettier runs last so its reformatting lands in the commit.
  `.github/workflows/test.yml` runs the same test after the push, so a failure skipped here surfaces
  there anyway.
- `🚀 ` ships to `master`, squashed and fast-forwarded with no PR; `.claude/skills/ship` is that
  procedure and sets the prefix itself, once the push lands. `📦 ` holds until then.
- `🚙 ` is what this repo waits on the user for: a decision, a password, or the confirmation click
  in front of a destructive sync.
- `🔒 ` and `🔓 ` are inert here — `--apply` takes its own lock and refuses rather than queuing, so
  there is no queue to announce.

**`💾 ` and `🔍 ` are the pair that matters to other sessions.** `src/sync.js` is a dry run by
default and `--apply` deletes and creates real Gmail filters, so the two prefixes bracket one
operation: `🔍 ` while the printed plan is being read, `💾 ` across the apply, set by
`.claude/skills/sync`, which owns both. Nothing locks the account itself between them — the apply
takes a lock, the dry run does not — so the plan is stale the moment another session applies. Check
the sidebar for another `💾 ` before applying, and re-run the dry run if the apply does not follow
it immediately. A filter that changed without your having changed it is another session, not a bug.
Driving Gmail, Proton or Shortwave in the browser is `💾 ` too.

**`filters.js` is shared but is not `💾 ` work.** It symlinks to
`~/.config/email-filter-builder/filters.js` (**Files outside git**), so every worktree edits the one
spec file and an edit in any of them is an edit in all — a rule that appears without your having
added it is another session, not a bug. Editing it still carries no prefix: `💾 ` warns that the
_account_ is being changed, and a spec edit changes nothing until a sync applies it. Two sessions
editing the spec is a merge problem, which git and a re-read solve; two sessions applying is a race,
which is what the prefix is for.

**Ask which session this is before renaming one.** `mcp__ccd_session_mgmt__get_session` with
`"self"` is the only answer, and it changes under a fork — a forked session carries the transcript
and the id read earlier in it, so reusing that id retitles the parent, often the one still mid-sync
and the one the sidebar most needs to be true.

A cloud session never reaches `🔍 `, `💾 ` or `🚀 `. `filters.js` and the OAuth credentials sit
outside the repo (**Files outside git**), so a fresh clone has no spec to diff and no way to reach
the account; and `ship` pushes straight to `master`, where the cloud harness wants a branch and a
pull request. It ends at `🚙 `, waiting on a session on the user's machine.

## Mail setup

- **Gmail** is the destination account and the backend for mail, user labels, and Gmail filters. Gmail filters run server-side before any client sees a message.
- **Shortwave** (app.shortwave.com) is the Gmail client in use. It honors Gmail filters and adds its own layer — AI filters, auto-apply rules, bundles, splits — stored in Shortwave's backend and invisible to Gmail.
- **ProtonMail** is the source side of the migration: it runs the generated `out/*.sieve` scripts plus hand-made filters and auto-forwards to Gmail.
- **Division of labor:** keep all deterministic sender/subject→label routing in `filters.js` → Gmail filters (portable, versioned, client-independent). Use Shortwave's layer only for what Gmail cannot express: AI classification, bundles, delivery schedules, splits. Avoid "Always Apply".
- Both providers apply **all** matching filters, but Gmail's are unordered and stack their actions, while Proton's run in list order and the last conflicting action wins — see **Gmail** below and [docs/protonmail.md](docs/protonmail.md).

### Label namespaces (three things can share one name)

| Kind                     | Lives in                      | In Shortwave's picker                            | Notes                                                                                                                                                                              |
| ------------------------ | ----------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gmail user label         | Gmail, syncs everywhere       | plain tag icon; URL `/labels/gmail%2FLabel_<id>` | The only kind Gmail filters can apply                                                                                                                                              |
| Shortwave built-in label | Shortwave only                | own icon (cart, plane, …); URL `/labels/<name>`  | Travel, Calendar, Newsletters, Purchases, Finance, Social, Promotions, Forums, Updates — auto-applied by Shortwave's classifier, invisible to Gmail, not removable from the picker |
| Gmail system category    | Gmail UI only (`#category/…`) | not shown                                        | ML-assigned; not writable by apps; filters' Categorize-as covers only the five inbox tabs                                                                                          |

Near-identical names across namespaces are easy to misread in the "Label as" picker.

## Topic docs

Per-app and per-mechanism detail lives under `docs/`. Read the one for an app before driving it or reasoning about its behaviour.

- [docs/browser-automation.md](docs/browser-automation.md) — what held across every web app driven from these sessions: refs over coordinates, dispatched events, hover-revealed controls, reading the data layer, getting bulk data out of a page.
- [docs/gmail-console.md](docs/gmail-console.md) — the OAuth app's Google Cloud project and scopes, and the Gmail settings UI as a fallback to `sync.js`.
- [docs/shortwave.md](docs/shortwave.md) — built-in labels, auto-apply rules and their IndexedDB export, send-as aliases and reply-from, driving the web app.
- [docs/protonmail.md](docs/protonmail.md) — filter order, what the UI filter builder can express, reading filters over the API, forwarding, checking where mail landed, driving the settings UI.

## Gmail

### Account and filters

- Target account and current filter/label specifics: see **AGENTS.local.md**. Verify the account before acting — the browser tab title, or the `Account:` line `sync.js` prints.
- Gmail caps filters at 1,000 per account; check the current count before large changes.
- Gmail applies **all** matching filters, and they are unordered — overlapping rules stack their actions (trash + label both apply; trashed mail is hidden from label views).
- Change filters with `node sync.js` (`users.settings.filters` over OAuth), not the settings UI; the UI notes in [docs/gmail-console.md](docs/gmail-console.md) are a fallback.
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
