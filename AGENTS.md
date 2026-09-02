# AGENTS.md

Operational knowledge for future agent sessions working on this project and automating the user's Gmail filters and labels. Gleaned from live sessions (2026-08, 2026-09); verify details that may have drifted before relying on them.

**Privacy rule: this repo is public.** Never put the account address, filter counts, label names/IDs, or any content from `filters.js` into committed files (docs, tests, commit messages included). Account-specific details belong in **AGENTS.local.md** — gitignored, at the repo root of the main checkout; like `filters.js`, it does not appear in worktrees.

## Skills

- `shortwave` ([.claude/skills/shortwave/SKILL.md](.claude/skills/shortwave/SKILL.md)) — Shortwave's label/filter model vs Gmail, what syncs and what doesn't, settings URLs, UI automation gotchas. Load before any Shortwave work.

## Communication

- Report outcomes tersely: what was found, what was done — "1 instance: AGENTS.md. Removed and amended." Skip process narration and thoroughness reassurances; verify silently and state conclusions.
- Keep caveats and side observations to one line each.

## Git

- Before pushing to a PR branch, check whether the PR is already merged (`gh pr view <n> --json state`). Pushes to a merged PR's branch land nowhere; cherry-pick the commits onto a fresh branch off master instead.

## Project

- `email-filter-builder` generates email filters from `filters.js` (gitignored, personal, lives at the repo root of the main checkout). A worktree session can read and edit it by absolute path; such edits produce no git diff.
- `node bin.js filters.js` writes `out/*.sieve` (ProtonMail, 50k-char chunks) and `out/gmail.xml` (Gmail import file).
- Mapping rules are documented in README.md. Key invariants: conditions sharing the same actions are OR-merged into `hasTheWord` queries chunked at 600 chars (`maxQueryLength` option); `archive` → shouldArchive; `trash` → shouldTrash; one label per Gmail filter (multi-label entries expand); sieve globs become Gmail token search terms — dangling fragments ≤3 chars are dropped, longer ones kept.
- Before importing after renderer changes, audit the generated queries against the real filters.js. A glob-translation bug once collapsed a `*@foo*.com`-style pattern to `from:(com)` — a trash filter that would have matched nearly all mail. Never let a `from` term reduce to a bare TLD; tests cover the known shapes.

## Gmail account

- Target account and current filter/label specifics: see **AGENTS.local.md**. Verify the account in the browser tab title before acting.
- Gmail caps filters at 1,000 per account; check the current count before large imports.
- Gmail applies **all** matching filters — no first-match ordering like ProtonMail sieve. Overlapping rules stack their actions (trash + label both apply; trashed mail is hidden from label views).
- A Gmail MCP server is connected (list_labels, delete_label, update_label, label/unlabel thread/message, search_threads, drafts, etc.). It exposes **no filter APIs** — filters can only be managed through the Gmail settings UI.
  - `search_threads` label queries: the tool doc says label **IDs** (`label:Label_42`) and that has worked, but on 2026-09-02 the ID form returned `{}` for a label `list_labels` showed as non-empty while the display name (`label:Name`, Gmail syntax — hyphenate spaces) returned every thread. If one form comes back empty, try the other before concluding the label is empty.
  - `delete_label` is the clean way to remove a label; confirm it is empty first with `search_threads` (`in:anywhere`) and that no filter still applies it (the settings list's "Do this:" text — delete those rows first). The Gmail sidebar may keep rendering a deleted label until the page reloads.
  - Filters reference labels by ID, so `update_label` (rename) re-points every filter that applies the label in one call — the cheapest way to follow a label rename in `filters.js` — but only if no other label already has the target name; check `list_labels` first. When the name is taken, replace the rows (delete + subset import, below) and move the old label's mail with `update_message_labels` (atomic add+remove per message; a single-message thread's message id equals its thread id).
- Three label-like namespaces can share a name (e.g. "Purchases"): Gmail **user labels** (the only kind this project's filters apply), Gmail **system categories** (`#category/...`, ML-assigned only — filters cannot target them beyond the five inbox tabs), and **Shortwave built-in labels** (cart-icon entries in Shortwave's picker; Shortwave-side only, invisible to Gmail, not removable from the picker).
- Shortwave's "Always apply"/auto-apply rules and AI filters live in Shortwave's backend — they do **not** create Gmail filters and don't count toward the 1,000 cap. Gmail filters run server-side before Shortwave sees mail, and Shortwave honors them.

## Automating Gmail settings (hard-won)

**Import flow — safe and fully automatable (no native dialogs):**

1. `https://mail.google.com/mail/u/0/#settings/filters` → "Import filters" link → upload with `file_upload` on the file input ref (never click "Choose File" — it opens a native picker) → "Open file".
2. In the review list Gmail **unchecks** rows it warns about (label+delete combos). Click the import section's "Select: All" link — the All/None pair immediately preceding the "Create filters" button (there are three All/None pairs on the page).
3. Leave "Apply new filters to existing email" **unchecked** unless retroactive application is explicitly wanted.
4. "Create filters" runs an in-page progress overlay at ~1–2 filters/sec (a ~100-filter import takes a couple of minutes). Filters identical to existing ones are silently skipped (the "Failed or skipped" counter).
5. Re-importing the full file **duplicates** every non-identical-but-overlapping filter — Gmail only dedupes exact matches (criteria and actions). To update existing filters, edit them or delete the old ones first; don't blind re-import.
6. To replace only some rows, build a subset XML: keep `out/gmail.xml`'s feed header/footer and only the affected `<entry>` blocks (filter on `name='label' value='…'`), delete those rows in the UI, then import the subset — untouched rows never enter the dedupe question. `file_upload` accepts a path under the working directory (a gitignored `out/` inside a worktree worked) and runs inside `browser_batch`. Imported rows are appended at the end of the list.
7. The delete/create progress overlays show counts ("Filters being deleted: N", "Filters being created: N") — a second check that the selection was the intended size.

**Filter EDIT — automatable:** row "edit" link → criteria overlay → Continue → actions screen. The label picker is a div listbox (`role=listbox`/`role=option`), not a `<select>`: open it by clicking the listbox ref, then select by dispatching `mouseover/mousedown/mouseup/click` MouseEvents on the option with the **exact** target text (beware near-identical names), verify the listbox text via DOM read, then "Update filter". (2026-09-02: `javascript_tool` is now blocked on mail.google.com — see the DOM notes — so the MouseEvent/DOM-read steps need a click-only substitute, untested; for a label change across many rows, delete + subset import was the workable path.)

**Filter DELETE — bulk path automatable (2026-09-02):** tick the rows' checkboxes → bulk "Delete" button → Gmail's own in-page "Confirm filter deletion — Really delete selected filters?" alertdialog; `find` locates its OK button and `left_click` by ref confirms it. A multi-row batch deleted cleanly this way with no native dialog. The per-row "delete" links were not re-tested; a 2026-08 session saw native `window.confirm()` on both paths, so if a native dialog does appear:

- No automation path can click it (overriding `window.confirm` from javascript_tool never worked — isolated world — and JS is now blocked anyway). While one is pending, computer-tool actions (screenshot/click) fail with "Cannot access a chrome-extension:// URL of different extension", while DOM tools (read_page/find/get_page_text) keep working. Recover by closing the wedged tab and creating a fresh one.
- **Danger:** a pending dialog can be auto-*accepted* when its tab is destroyed — a deletion that appeared cancelled can land minutes later. Never leave a delete dialog pending, and recount filters afterward rather than assuming a cancelled delete stayed cancelled.
- Fall back to the user ticking checkboxes → Delete → one OK for the batch, or being present to click OK.

Selecting the rows is the risky part: verify every tick visually before pressing Delete (see the DOM notes), then `get_page_text` the list and diff it against the expected set.

**Gmail settings DOM notes:**

- Old-school HTML in the top document (no iframes). Filter rows are `tr` elements containing "Do this:" plus an edit link; edit/delete controls are `span.sA[role="link"]`. The settings page preloads other tabs' content — label-management rows are also in the DOM, so always constrain row selectors with "Do this:".
- `javascript_tool` is **blocked** on mail.google.com as of 2026-09-02 (`[BLOCKED: Cookie/query string data]`, whatever the code) — no DOM reads, no synthetic events. Verification is `get_page_text` (the whole list, ~70 KB) plus `zoom`/screenshots.
- `read_page` returns only the rows in the viewport; `find` covers the whole page, but its descriptions are model-generated: it mis-mapped two refs onto the wrong rows and describes every checkbox as "checked" (it is reading `value="on"`). The accessibility tree exposes no checkbox state at all — only a screenshot/zoom shows a tick. Query `find` with both the Matches text and the exact "Do this:" label, since twin rows share their Matches.
- Refs are assigned in DOM order, 6 per filter row (checkbox = base, edit = base+3, delete = base+4), so arithmetic from a visually verified row cross-checks a `find` result. They renumber after a reload (+1 observed) and go stale after any click that re-renders the list.
- Reliable per-row tick: `scroll_to` ref → `wait 1` → `left_click` ref → `wait 1` → `zoom` on the centre band ([250,420,740,720] in screenshot coordinates — `scroll_to` centres the element) and read the row text beside the tick. Clicking a ref straight after `scroll_to` races and can land on a neighbouring row; coordinate clicks from screenshots did not register at all (viewport vs screenshot scale mismatch).
- Navigating to the same `#settings/filters` URL does not reload the SPA (ticks persist); `key cmd+r` does — the cheapest way to clear an uncertain selection.