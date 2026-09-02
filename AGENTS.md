Operational knowledge for future agent sessions working on this project and automating the user's Gmail filters and labels. Gleaned from live sessions (2026-08); verify details that may have drifted before relying on them.

**Privacy rule: this repo is public.** Never put the account address, filter counts, label names/IDs, or any content from `filters.js` into committed files (docs, tests, commit messages included). Account-specific details belong in **AGENTS.local.md** — gitignored, at the repo root of the main checkout; like `filters.js`, it does not appear in worktrees.

## Git

- Before pushing to a PR branch, check whether the PR is already merged (`gh pr view <n> --json state`). Pushes to a merged PR's branch land nowhere; cherry-pick the commits onto a fresh branch off master instead.

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

## Built-in labels have no off switch

- Settings → Labels renders the nine built-in labels with an ⓘ info icon per row and no toggle, hide, or delete control. Nothing in Labels, Inbox setup, or Appearance stops the classifier from applying them.
- A built-in label is a *label only* — it does not create a bundle or an inbox split by itself. Bundles (Inbox setup → Label bundles) and splits are separately opt-in, so "hide its bundle" is not an available workaround.
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
- Gmail applies **all** matching filters — no first-match ordering like ProtonMail sieve. Overlapping rules stack their actions (trash + label both apply; trashed mail is hidden from label views).
- A Gmail MCP server is connected (list_labels, delete_label, update_label, label/unlabel thread/message, search_threads, drafts, etc.). It exposes **no filter APIs** — filters can only be managed through the Gmail settings UI.
  - `search_threads` label queries take label **IDs** (e.g. `label:Label_42`), not display names; get IDs from `list_labels`.
  - `delete_label` is the clean way to remove a label; confirm it is empty first with `search_threads` (`in:anywhere`). The Gmail sidebar may keep rendering a deleted label until the page reloads.
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
