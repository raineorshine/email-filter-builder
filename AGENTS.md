Operational knowledge for future agent sessions working on this project and automating the user's Gmail filters and labels. Gleaned from live sessions (2026-08); verify details that may have drifted before relying on them.

**Privacy rule: this repo is public.** Never put the account address, filter counts, label names/IDs, or any content from `filters.js` into committed files (docs, tests, commit messages included). Account-specific details belong in **AGENTS.local.md** — gitignored, at the repo root of the main checkout; like `filters.js`, it does not appear in worktrees.

## Git

- Before pushing to a PR branch, check whether the PR is already merged (`gh pr view <n> --json state`). Pushes to a merged PR's branch land nowhere; cherry-pick the commits onto a fresh branch off master instead.
- Many worktrees run against this repo at once, and AGENTS.md is the file they all want to edit. A task started with `spawn_task` gets its own worktree and branch, so editing the same file in the spawning session too guarantees a cross-branch conflict — and `ListAgents` gives no reliable way to tell which peer session owns a given spawned task. Hand a file to the task or keep it, not both.

## Project

- `email-filter-builder` generates email filters from `filters.js` (gitignored, personal, lives at the repo root of the main checkout).
- `node bin.js filters.js` writes `out/*.sieve` (ProtonMail, 50k-char chunks) and `out/gmail.xml` (Gmail import file).
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

## Label visibility and picker order

- Shortwave has **no label-visibility concept at all**. Settings → Labels → the per-label gear opens an "Edit label" dialog containing only a name field and a colour swatch; the sole other row control is delete. No hide, no pin, no archive. Gmail's own `labelListVisibility` is ignored, so hiding a label in Gmail's sidebar changes nothing here.
- The "Label as" picker is a search box over a flat list of every custom label, printing full nested paths (`Parent/Child/Grandchild`). Nesting groups labels together but never collapses them.
- **Sorting is by raw code point, case-sensitive** — not locale collation. `SMS` sorts before `Self` (`M` U+004D < `e` U+0065), and a `♥`-prefixed label (U+2665) sorts after every letter. The name is therefore the *only* lever on a label's position: any character above `z` (U+007A) sinks it to the bottom, while punctuation below `A` (`*`, U+002A) pins it to the top. A `z`-prefix works but reads badly; U+00B7 middle dot is unobtrusive and sorts just as late.
- Picker search matches any substring, including a nested child segment, so a sort-prefix costs nothing in findability — the old bare name still surfaces the label.
- Retire an unused label by **renaming** it under such a prefixed parent rather than deleting it. A Gmail rename is metadata-only: the label ID is unchanged, so every historical message keeps the label and no filter that targets it by ID breaks. Renaming the parent first stops the children auto-creating a duplicate parent and colliding.

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
- Label rows (Settings → Labels) reveal two hover buttons: gear (edit) first, trash (delete) **last**. Clicking blind by index is how you open a delete confirmation by accident — target the gear explicitly.
- Unlike the rule rows, label-row buttons did **not** respond to dispatched MouseEvents; a real click on a `find` ref worked. Try the ref first here.
- Shortwave's delete-label confirmation is an **in-page dialog**, not a native `window.confirm` — safe to open, read and cancel, with none of the auto-accept danger of Gmail's filter deletes.

# Gmail

## Gmail account

- Target account and current filter/label specifics: see **AGENTS.local.md**. Verify the account in the browser tab title before acting.
- Gmail caps filters at 1,000 per account; check the current count before large imports.
- Gmail applies **all** matching filters — no first-match ordering like ProtonMail sieve. Overlapping rules stack their actions (trash + label both apply; trashed mail is hidden from label views).
- A Gmail MCP server is connected (list_labels, delete_label, update_label, label/unlabel thread/message, search_threads, drafts, etc.). It exposes **no filter APIs** — filters can only be managed through the Gmail settings UI.
  - `search_threads` label queries take label **IDs** (e.g. `label:Label_42`), not display names; get IDs from `list_labels`.
  - `delete_label` is the clean way to remove a label; confirm it is empty first with `search_threads` (`in:anywhere`). The Gmail sidebar may keep rendering a deleted label until the page reloads.
  - `search_threads` returns a `resultCountEstimate` that is a fixed placeholder (`201` for every query, empty or not). It is not a count — never report or branch on it.
  - Before concluding a label is empty, **verify the query itself** by running the same form against a label known to hold mail. A malformed query returns exactly what an empty label returns, and mistaking one for the other reads as data loss — this is the check that distinguishes a broken `label:` syntax from a genuinely empty label.
  - Deleting a label unlabels its messages; no mail is removed. Whether `delete_label` on a parent cascades to `Parent/Child` labels is **untested** — delete children explicitly first so the question never arises.
  - Label counts are **not** evidence a label is empty, and the fault is **Gmail's, not the connector's** — Gmail's own Settings → Labels page prints the same figures, zeros included. `messagesTotal` and `threadsTotal` read a stored per-label counter and fail as a pair: it resets to 0 after an `update_label` rename (rebuilding to correct values within minutes), and it can sit stuck at 0 indefinitely on labels holding thousands of threads. The unread counters are stored separately and stayed accurate throughout, so `messagesTotal: 0` beside a nonzero `messagesUnread` — arithmetically impossible — is the signature of the fault. Prove emptiness by querying (`search_threads` with `in:anywhere`), never by reading the count; this matters most right before `delete_label`.
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

**Filter DELETE — not safely automatable.** The per-row delete links and the bulk Delete button call native `window.confirm()`:

- No automation path can click a native dialog. While one is pending, computer-tool actions (screenshot/click) fail with "Cannot access a chrome-extension:// URL of different extension", while DOM tools (read_page/find/get_page_text/javascript) keep working. Recover by closing the wedged tab and creating a fresh one.
- Overriding `window.confirm` from javascript_tool does **not** work — the tool runs in an isolated world; the page still sees the native function.
- **Danger:** a pending dialog can be auto-_accepted_ when its tab is destroyed — a deletion that appeared cancelled can land minutes later. Never leave a delete dialog pending, and recount filters afterward rather than assuming a cancelled delete stayed cancelled.
- Deletions should be done by the user (tick checkboxes → Delete → one OK confirms the whole batch), or with the user present to click OK.

**Gmail settings DOM notes:**

- Old-school HTML in the top document (no iframes). Filter rows are `tr` elements containing "Do this:" plus an edit link; edit/delete controls are `span.sA[role="link"]`. The settings page preloads other tabs' content — label-management rows are also in the DOM, so always constrain row selectors with "Do this:".
- Element refs go stale after any click that re-renders the list. Re-find before each click, one mutation per call, and verify state after — JS DOM reads are the most reliable verification.
- Coordinate clicks are unreliable (viewport vs screenshot scale mismatch). Use refs from find/read_page, or dispatch events from JS.

**Counting threads in a label (the `list_labels` totals are unusable):**

Gmail's own UI is the only reliable source, and it also tells you *which* labels are affected. A healthy label prints its exact total on page one (`1–50 of 178`); a label whose stored counter is dead shows `1–50 of many`, because Gmail has no number to print and will not count until you force it by paging to the last page (`451–462 of 462`). **`of many` is the free diagnostic** — it means the counter is untrustworthy for that label.

Settings → Labels lists every label with its conversation count in a single page read, which is the cheapest way to compare many labels at once — but it reads the same stored counter, so it reproduces the zeros rather than resolving them.

- Jump pages by assigning `location.hash = '#label/<name>/p<N>'` from inside the SPA — it re-renders. A full `navigate` to the same URL clamps back to page 1, so binary-search N from JS instead; an empty counter means past the last page. Encode `/` in nested names as `%2F`.
- Read the counter from the **visible** `.ar5` element. Several stale hidden copies exist and never update — reading one of those makes paging look like a no-op and sends you chasing the wrong bug.
- JS `.click()` on the Older button is inert; dispatch `mouseover/mousedown/mouseup/click`, as with the filter-row controls.
- Don't locate the counter by scanning every `span`/`div` for `innerText` — forcing layout across Gmail's DOM is slow enough to blow the 45s `Runtime.evaluate` timeout. `.ar5` is cheap.
- The result is **threads, not messages**, excludes Trash and Spam, and counts nested labels independently — a parent's total does not include its children.

# Browser tooling

- `browser_batch` rejects fully-qualified `mcp__claude-in-chrome__*` tool names in its `actions` list; the batch aborts on the first item. Issue those calls individually.
- Coordinate clicks land on the wrong element in both Gmail and Shortwave (viewport vs screenshot scale mismatch) — a `hover` may land correctly while a `left_click` at the same point does not. Always click by ref from `find`/`read_page`.
- `javascript_tool` aborts at a 45s `Runtime.evaluate` timeout and discards everything the call had already done, even work that succeeded. Give any in-page loop its own ~25-30s deadline, return where it got to, and make it resumable by reading current state on entry — that is what makes long pagination tractable.
- Read status text from the **visible** element only (filter on `offsetParent`). These SPAs keep stale hidden copies that never update; a selector matching one returns a frozen value, which makes working clicks look inert and sends you debugging the wrong layer.

# Shell

- zsh, not bash. Interpolating a variable into a bracketed pattern inside double quotes (`grep "[^']*$name" filters.js`) makes zsh attempt arithmetic expansion and abort the line — it prints a `bad math expression` error and every later command in the pipeline silently reports nothing. Use `grep -F "$name"`, or single-quote the pattern. Worth knowing because sweeping `filters.js` for label names is a routine step here, and the failure looks like "no matches".
