Operational knowledge for future agent sessions working on this project and automating the user's Gmail filters and labels. Gleaned from live sessions (2026-08); verify details that may have drifted before relying on them.

**Privacy rule: this repo is public.** Never put the account address, filter counts, label names/IDs, or any content from `filters.js` into committed files (docs, tests, commit messages included). Account-specific details belong in **AGENTS.local.md** — gitignored, at the repo root of the main checkout; like `filters.js`, it does not appear in worktrees — but you may edit it from one, under the mutex below.

## AGENTS.local.md (account-specific notes)

Editing it from a worktree is expected, not off-limits — it holds everything the privacy rule keeps out of this repo. It lives at the main checkout root, never the worktree root:

```bash
MAIN="$(dirname "$(git rev-parse --git-common-dir)")"
```

**Always hold the mutex.** A dozen-plus worktrees are typically live at once (`git worktree list`), each possibly running its own agent session; an unlocked read-modify-write silently drops whatever another session wrote in between. `flock` is not installed on macOS, so use `mkdir`, which is atomic on every POSIX filesystem:

```bash
MAIN="$(dirname "$(git rev-parse --git-common-dir)")"
LOCK="$MAIN/.git/AGENTS.local.md.lock"

# Acquire; reclaim a lock older than 10 min as orphaned.
until mkdir "$LOCK" 2>/dev/null; do
  [ -n "$(find "$LOCK" -maxdepth 0 -mmin +10 2>/dev/null)" ] && rmdir "$LOCK" 2>/dev/null
  sleep 1
done
trap 'rmdir "$LOCK" 2>/dev/null' EXIT

# Read, modify and write "$MAIN/AGENTS.local.md" here — all inside the lock.
```

- **One Bash call.** Shell state does not persist between tool calls, so acquire, edit and release must be a single invocation or the `trap` fires early and frees the lock mid-edit.
- **Re-read inside the lock.** Never write back content read before acquiring it.
- The lock lives under `.git/`, which is shared by every worktree and never committed.
- **`$MAIN` is for `AGENTS.local.md` only.** `AGENTS.md` is committed, so it _does_ appear in worktrees — edit the worktree's copy. Reusing the `$MAIN` path for it out of habit writes the change into whatever branch the main checkout has out (usually `master`), where it sits unstaged and easy to miss. Recovering means saving the diff, `git restore`-ing the main checkout, and reapplying in the worktree.

## Git

- Before pushing to a PR branch, check whether the PR is already merged (`gh pr view <n> --json state`). Pushes to a merged PR's branch land nowhere; cherry-pick the commits onto a fresh branch off master instead.

## Project

- `email-filter-builder` generates email filters from `filters.js` (gitignored, personal, lives at the repo root of the main checkout).
- `node bin.js filters.js` writes `out/*.sieve` (ProtonMail, 50k-char chunks) and `out/gmail.xml` (Gmail import file).
- `node sync.js filters.js` diffs the spec against the account's live Gmail filters over the API and reconciles them — dry run by default, `--apply` to write. This is the supported way to change Gmail filters; the XML import is a one-shot that duplicates on re-import. Needs a one-time OAuth setup (see README.md); `.gmail-credentials.json` and `.gmail-token.json` are gitignored.
- `gmail.js` exports `Specs`, the shared conditions-to-filters expansion (OR-merging, 600-char chunking, one label per filter). Both the XML renderer and `sync.js` go through it, so the two formats cannot drift. Change merging semantics there, not in either consumer.
- Mapping rules are documented in README.md. Key invariants: conditions sharing the same actions are OR-merged into `hasTheWord` queries chunked at 600 chars (`maxQueryLength` option); `archive` → shouldArchive; `trash` → shouldTrash; one label per Gmail filter (multi-label entries expand); sieve globs become Gmail token search terms — dangling fragments ≤3 chars are dropped, longer ones kept.
- Before importing after renderer changes, audit the generated queries against the real filters.js. A glob-translation bug once collapsed a `*@foo*.com`-style pattern to `from:(com)` — a trash filter that would have matched nearly all mail. Never let a `from` term reduce to a bare TLD; tests cover the known shapes.

# Shortwave

Shortwave (app.shortwave.com) is a Gmail client. Gmail remains the backend for mail, user labels, and Gmail filters — Gmail filters run server-side before Shortwave sees a message, and Shortwave honors them.

## Label namespaces (three things can share one name)

| Kind                     | Lives in                      | Picker appearance                                | Notes                                                                                                                                                                              |
| ------------------------ | ----------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gmail user label         | Gmail, syncs everywhere       | plain tag icon; URL `/labels/gmail%2FLabel_<id>` | The only kind Gmail filters can apply                                                                                                                                              |
| Shortwave built-in label | Shortwave only                | own icon (cart, plane, …); URL `/labels/<name>`  | Travel, Calendar, Newsletters, Purchases, Finance, Social, Promotions, Forums, Updates — auto-applied by Shortwave's classifier, invisible to Gmail, not removable from the picker |
| Gmail system category    | Gmail UI only (`#category/…`) | not shown                                        | ML-assigned; not writable by apps; filters' Categorize-as covers only the five inbox tabs                                                                                          |

Near-identical names across namespaces are easy to misread in the "Label as" picker.

## Built-in labels have no off switch

- Settings → Labels renders the nine built-in labels with an ⓘ info icon per row and no toggle, hide, or delete control. Nothing in Labels, Inbox setup, or Appearance stops the classifier from applying them.
- A built-in label is a _label only_ — it does not create a bundle or an inbox split by itself. Bundles (Inbox setup → Label bundles) and splits are separately opt-in, so "hide its bundle" is not an available workaround.
- The stated override is a filter, per the section header: built-in labels "are automatically added to new emails. You can override this behavior by defining filters." An AI filter can target a built-in label (observed on an existing filter's action chip); the Create AI filter picker list was not confirmed.
- To keep a built-in label out of the inbox without removing it: Settings → Filters → **Label skip inbox**. The label stays applied and stays in the sidebar and picker.
- Verified 2026-09 against Updates; the row UI is identical for all nine.

## Rules and filters

- "Always Apply" / auto-apply rules (Settings → Filters → Label auto-apply rules) are stored in **Shortwave's backend** — never as Gmail filters, even for plain sender→label rules targeting Gmail labels. They don't count toward Gmail's 1,000-filter cap.
- Effect vs rule: applying a Gmail label syncs to Gmail (visible in all clients); the rule itself is Shortwave-only and dies with the Shortwave account.
- **No export** for auto-apply rules — the rule dialog offers only add/remove sender. To export, open each rule's gear and transcribe its sender list.
- Shortwave cannot manage Gmail filters: it shows a cached count (Settings → Filters → "Gmail filters", refresh link) and links out to Gmail settings for editing.
- AI filters and the quick-start filters (Needs Action, Cold Outreach, FYI, Travel, Finance, Purchases) are Shortwave-side natural-language classifiers, off unless added.

## Division of labor (this project)

Keep all deterministic sender/subject→label routing in `filters.js` → Gmail filters (portable, versioned, client-independent). Use Shortwave's layer only for what Gmail cannot express: AI classification, bundles, delivery schedules, splits. Avoid "Always Apply".

## Automating the Shortwave web app

- SPA; settings at `/settings/labels`, `/settings/filters`, `/settings/inbox`. A "We're still importing your email" interstitial may appear — click Refresh.
- Rule-row gear icons are hover-revealed and absent from the accessibility tree: locate them by geometry in JS (element at the same row height, right of the row) and dispatch `mouseover/mousedown/mouseup/click` MouseEvents.
- The rule dialog is titled "Auto-apply rules for \<Label\>" with ALWAYS APPLY / ALWAYS REMOVE sender lists.
- Coordinate clicks are unreliable here as in Gmail — the screenshot frame and the page viewport report different sizes (1028×1176 vs 919×1051 in one session), so screenshot coordinates land ~15% off. Use refs from find/read_page, or dispatch events from JS.
- "Create AI filter" (Settings → Filters) did not open its dialog from either a ref click or a coordinate click — no modal rendered either way. Unresolved; budget extra time if a session needs that flow.

# Gmail

## Gmail account

- Target account and current filter/label specifics: see **AGENTS.local.md**. Verify the account in the browser tab title before acting.
- Gmail caps filters at 1,000 per account; check the current count before large imports.
- Gmail applies **all** matching filters, and they are unordered — overlapping rules stack their actions (trash + label both apply; trashed mail is hidden from label views). ProtonMail also applies all matching filters, but they _are_ ordered and conflicting actions resolve differently — see **ProtonMail → Filter order**.
- A Gmail MCP server is connected (list_labels, delete_label, update_label, label/unlabel thread/message, search_threads, drafts, etc.). It exposes **no filter APIs** — for filters, use `node sync.js` (this repo, `users.settings.filters` over OAuth) rather than the settings UI.
  - `search_threads` label queries take label **IDs** (e.g. `label:Label_42`), not display names; get IDs from `list_labels`.
  - `delete_label` is the clean way to remove a label; confirm it is empty first with `search_threads` (`in:anywhere`). The Gmail sidebar may keep rendering a deleted label until the page reloads.
  - **It drops credentials in the repo root.** First use writes `.gmail-credentials.json` and `.gmail-token.json` (live OAuth access + refresh tokens) next to `package.json`. Both are gitignored — keep it that way, and never `git add -A` blind in this public repo.
- Three label-like namespaces can share a name (e.g. "Purchases"): Gmail **user labels** (the only kind this project's filters apply), Gmail **system categories** (`#category/...`, ML-assigned only — filters cannot target them beyond the five inbox tabs), and **Shortwave built-in labels** (cart-icon entries in Shortwave's picker; Shortwave-side only, invisible to Gmail, not removable from the picker).
- Shortwave's "Always apply"/auto-apply rules and AI filters live in Shortwave's backend — they do **not** create Gmail filters and don't count toward the 1,000 cap. Gmail filters run server-side before Shortwave sees mail, and Shortwave honors them.

## Automating Gmail settings (hard-won)

**Import flow — safe and fully automatable (no native dialogs):**

1. `https://mail.google.com/mail/u/0/#settings/filters` → "Import filters" link → upload with `file_upload` on the file input ref (never click "Choose File" — it opens a native picker) → "Open file".
2. In the review list Gmail **unchecks** rows it warns about (label+delete combos). Click the import section's "Select: All" link — the All/None pair immediately preceding the "Create filters" button (there are three All/None pairs on the page).
3. Leave "Apply new filters to existing email" **unchecked** unless retroactive application is explicitly wanted.
4. "Create filters" runs an in-page progress overlay at ~1–2 filters/sec (a ~100-filter import takes a couple of minutes). Filters identical to existing ones are silently skipped (the "Failed or skipped" counter).
5. Re-importing the full file **duplicates** every non-identical-but-overlapping filter — Gmail only dedupes exact matches (criteria and actions). To update existing filters, edit them or delete the old ones first; don't blind re-import.

**Filter EDIT — automatable:** row "edit" link → criteria overlay → Continue → actions screen. The label picker is a div listbox (`role=listbox`/`role=option`), not a `<select>`: open it by clicking the listbox ref, then select by dispatching `mouseover/mousedown/mouseup/click` MouseEvents on the option with the **exact** target text (beware near-identical names), verify the listbox text via DOM read, then "Update filter".

**Filter DELETE — not safely automatable _in the browser_.** Use `node sync.js --apply` instead: the API deletes filters outright, with no dialog. The rest of this subsection applies only if a session is forced into the settings UI. The per-row delete links and the bulk Delete button call native `window.confirm()`:

- No automation path can click a native dialog. While one is pending, computer-tool actions (screenshot/click) fail with "Cannot access a chrome-extension:// URL of different extension", while DOM tools (read_page/find/get_page_text/javascript) keep working. Recover by closing the wedged tab and creating a fresh one.
- Overriding `window.confirm` from javascript_tool does **not** work — the tool runs in an isolated world; the page still sees the native function.
- **Danger:** a pending dialog can be auto-_accepted_ when its tab is destroyed — a deletion that appeared cancelled can land minutes later. Never leave a delete dialog pending, and recount filters afterward rather than assuming a cancelled delete stayed cancelled.
- Deletions should be done by the user (tick checkboxes → Delete → one OK confirms the whole batch), or with the user present to click OK.

**Gmail settings DOM notes:**

- Old-school HTML in the top document (no iframes). Filter rows are `tr` elements containing "Do this:" plus an edit link; edit/delete controls are `span.sA[role="link"]`. The settings page preloads other tabs' content — label-management rows are also in the DOM, so always constrain row selectors with "Do this:".
- Element refs go stale after any click that re-renders the list. Re-find before each click, one mutation per call, and verify state after — JS DOM reads are the most reliable verification.
- Coordinate clicks are unreliable (viewport vs screenshot scale mismatch). Use refs from find/read_page, or dispatch events from JS.

# ProtonMail

The source side of the migration. Proton runs the generated `out/*.sieve` scripts plus any
hand-made filters; account specifics live in **AGENTS.local.md**.

## Filter order — last conflicting action wins

Proton applies **all** matching filters, in the listed order, and per Proton's own docs: "When
multiple filters apply to a message, all non-conflicting actions will be applied. If there are
actions that conflict, the last action will be applied to the message."
([How to use email filters](https://proton.me/support/email-inbox-filters))

Two filters that both `fileinto` a folder **conflict**; the message lands in the _later_ filter's
folder. Labels and stars are non-conflicting and accumulate from every match.

This has a sharp consequence for this project:

- **A catch-all "move to Archive" filter must be ordered _before_ the generated sieve scripts.**
  Placed after them it silently overrides every `trash` rule the builder emits — junk that should
  be trashed is archived instead, with no error anywhere. Same for any hand-made folder-moving
  filter that overlaps the generated rules.
- The same hazard exists _within_ a generated script: a later `fileinto "archive"` block beats an
  earlier `fileinto "trash"` block for any message matching both. Today's entries overlap on sender
  globs but are kept disjoint by their subject conditions — re-check after editing `filters.js` if
  a sender appears in both a trash entry and an archive entry.
- The generated scripts contain no `stop`, so nothing short-circuits; every later filter still runs.

## What the Proton UI filter builder can express

Worth knowing before assuming a rule has to live in `filters.js` — the builder only supports `from`
and `subject` and only emits `fileinto`, so anything below has to be a hand-made filter:

- **Conditions:** the subject / the sender / the recipient / the attachment. Operators: contains,
  is exactly, begins with, ends with, matches, plus a negation of each.
- **Actions:** label as (any number), move to (exactly one folder), mark as read and/or starred,
  send auto-reply.
- Conditions are combined with ALL or ANY. One condition row accepts **multiple values**, OR'd
  inside the comparator — so with a negated comparator a single row means "matches none of these",
  which is the compact way to write a multi-address exclusion.
- Proton prepends a spam guard to every UI-built filter, so Spam is never touched.
- **Filters can be applied retroactively**, contrary to the usual assumption: a checkbox at filter
  creation, and "Apply to existing messages" in the row's ⋮ menu afterwards.
- **"Edit Sieve" works on UI-built filters** and is the only way to read the sieve they generate.
  Use it to verify a filter before trusting it.

## Forwarding interacts with none of this

- Auto-forwarding is envelope-based: it forwards everything delivered to the address regardless of
  headers, and runs independently of filters. Archiving or trashing a message in Proton does **not**
  stop it being forwarded — which is what makes the archive-everything strategy safe.
- Forwarding is configured **per address**. An address with no rule forwards nothing, so audit the
  full address list before adding any catch-all archive rule, or mail to an unforwarded address is
  archived having never reached the destination.
- Enabling a forward to a destination without end-to-end encryption **disables E2EE for the source
  address** (zero-access encryption remains). Proton warns at the confirmation step. Get the user's
  sign-off — it is a security change, not a mail-routing one.
- Creating a rule requires the account password, then the _recipient_ clicks a confirmation link.
  An agent can do neither: hand both steps to the user.

## Checking where mail actually landed

Confirming what a filter did, without mutating anything:

- Proton search takes hash params and is scoped to the folder in the path: `/u/0/all-mail#from=<domain>`, `#to=<address>`, `#keyword=<text>`. Running the same query against `/u/0/trash` and `/u/0/archive` shows which folder a sender's mail is really landing in — that comparison is what separates "the trash rule fired" from "a later filter overrode it".
- In All Mail a row carries a location tag for Archive/Inbox/Sent but **not** for Trash, so an untagged row reads as inbox mail when it isn't. Trust the folder-scoped search, not the tag.
- Prefer search to opening messages: opening one marks it read. If you must open an unread message to read its headers, restore it with "Mark as unread" afterwards.
- **One message's placement proves nothing** — the user may have moved it by hand. Look for a before/after split across many messages from one sender, or settle the semantics against Proton's docs. An inference drawn from a single message led to a wrong conclusion about filter ordering in one session.
- To confirm a message actually reached the destination account, query the Gmail MCP (`search_threads`) rather than reading the Gmail UI.
- Proton groups same-subject messages into one conversation regardless of age, so a thread can span years and a new message can look like an old one. In the conversation view each message is its own `<article>`; `querySelector('article')` returns the first, not the one you opened — read them all and match on the date.

## Automating the Proton settings UI (hard-won)

- **Modals do not open from a `computer` ref click.** Dispatch
  `pointerdown/mousedown/pointerup/mouseup/click` MouseEvents from `javascript_tool` instead.
  Inside an open modal the reverse holds: ref clicks work and JS dispatch on dropdown options
  silently does nothing. Native `.click()` works on toggle labels but not on dropdown triggers.
- **Dropdown options often need a second click** — the first opens/re-opens the list without
  selecting. Always read the control back to confirm the value took.
- **Refs go stale after any scroll or re-render.** A stale ref opened the wrong filter's Edit dialog
  twice in one session. Re-run `find` immediately before each click and never scroll in between;
  verify which record a modal actually opened before touching it.
- Several closed `.modal-two` nodes linger in the DOM. Select the live one with
  `[...document.querySelectorAll('.modal-two')].filter(d => !d.classList.contains('modal-two--out')).pop()`.
- Screenshot and viewport dimensions frequently disagree, so coordinate clicks land off-target.
  Use refs or JS, same as in Gmail and Shortwave.
- `javascript_tool` and `computer` can both wedge with "Cannot access a chrome-extension:// URL of
  different extension" while `find`/`read_page` keep working — here with no native dialog pending,
  unlike the Gmail case below. Recovery is the same: close the tab and open a fresh one.
- **Reordering filters** has no menu item — drag handles only — but dnd-kit's keyboard sensor works:
  focus `td[aria-roledescription="draggable"]`, Space to lift, ArrowUp/ArrowDown, Space to drop.
  Three gotchas: the drag attributes attach only _after_ a real scroll interaction on the page;
  moves must be chunked (`repeat: 10` with a ~1s wait between — one `repeat: 100` call does
  nothing); and the drag overlay leaves a phantom duplicate row that captures focus, so reload
  between drags. Reordering persists server-side. Moving a filter from the end of a ~200-row list
  to the top took about twenty chunks.
- Row ⋮ menu: Apply to existing messages / Edit Sieve / Delete. If it will not open, its items are
  already in the DOM — click by aria-label (`Edit Sieve filter "<name>"`).
- Deleting or disabling a superseded filter: the row toggle is reversible and is the safer choice
  over Delete when a rule may need backing out.
