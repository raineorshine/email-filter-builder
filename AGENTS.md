Operational knowledge for future agent sessions working on this project and automating the user's Gmail filters and labels. Gleaned from live sessions (2026-08); verify details that may have drifted before relying on them.

**Privacy rule: this repo is public.** Never put the account address, filter counts, label names/IDs, or any content from `filters.js` into committed files (docs, tests, commit messages included). Account-specific details belong in **AGENTS.local.md** — gitignored, at the repo root of the main checkout; like `filters.js`, it does not appear in worktrees.

## Git

- Before pushing to a PR branch, check whether the PR is already merged (`gh pr view <n> --json state`). Pushes to a merged PR's branch land nowhere; cherry-pick the commits onto a fresh branch off master instead.

## Project

- `email-filter-builder` generates email filters from `filters.js` (gitignored, personal, lives at the repo root of the main checkout).
- `node bin.js filters.js` writes `out/*.sieve` (ProtonMail, 50k-char chunks) and `out/gmail.xml` (Gmail import file).
- Mapping rules are documented in README.md. Key invariants: conditions sharing the same actions are OR-merged into `hasTheWord` queries chunked at 600 chars (`maxQueryLength` option); `archive` → shouldArchive; `trash` → shouldTrash; one label per Gmail filter (multi-label entries expand); sieve globs become Gmail token search terms — dangling fragments ≤3 chars are dropped, longer ones kept; a condition's `list` maps to Gmail `list:` and sieve `header :contains "List-Id"`.
- Action objects support **only** `fileinto`. Both renderers read nothing else, so an `addflag`/`removeflag` key in `filters.js` is silently ignored despite `imap4flags` being in the sieve require header. Adding flag support means touching `Action`/`MultiRule` in sieve.js and `Entries` in gmail.js.
- Every rule is emitted to **both** backends. A rule that is only meaningful on one (e.g. matching a header Gmail never sees) still produces a dead filter on the other, burning one of Gmail's 1,000 slots. There is no per-rule backend scope yet.
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

# ProtonMail

## Web app

- Mail at `mail.proton.me/u/0/<folder>`; settings at `account.proton.me/u/0/mail/{filters,auto-reply,folders-labels}`. Forwarding rules live under **auto-reply**, not a `/forward` path.
- Folder-scoped search by URL is the fastest way to establish which folder a message is in: `/u/0/trash#keyword=…`, `/u/0/spam#keyword=…`, `/u/0/all-mail#keyword=…`. Deep-linking a `#keyword` on a cold load can fail — load the app first, then navigate with the hash.
- Subjects and sender metadata are searchable server-side (Proton does not end-to-end encrypt them). Body search needs the local encrypted index, which may be off.
- Generated sieve chunks are deployed as one Proton sieve filter per chunk (Settings → Filters → "Add sieve filter"), alongside any hand-made UI filters. Confirm every `fileinto` destination exists as a Proton folder/label before pasting a regenerated script.

## Automating the Proton web app (hard-won)

- **Rate limiting is the main obstacle.** The API returns HTTP 429 `Code 2028` with `Retry-After` ~300s, and **every request made while throttled extends the window** — polling never converges. Stop all requests for the full Retry-After. Reloading the SPA is expensive (many API calls per load); navigate within the loaded app instead.
- Hand-rolling authenticated API calls from `javascript_tool` (injecting the session UID header) is blocked by the permission classifier. Drive the UI.
- The Proton Mail **desktop app is on the user's computer-use auto-deny list**, so there is no fallback when the web app is throttled.
- **Conversation view is a click hazard.** Clicking a collapsed row expands the conversation's _latest_ message, not the clicked one, and the message toolbar sits directly above the first row — clicks near the top of the list hit Archive/Trash instead. Use `find` refs rather than coordinates, and confirm the folder chip via `get_page_text` (it prints "Inbox"/"Archive") after any click that might have moved something.

## Forwarding to Gmail: silent mail loss

Proton auto-forward re-sends the message from Proton's servers, which can break the original DKIM signature. For senders publishing DMARC `p=reject`, Gmail then **hard-rejects at SMTP**:

```
550-5.7.26 Unauthenticated email from <domain> is not accepted due to
550-5.7.26 domain's DMARC policy.
```

- Rejected mail is **absent from Gmail entirely** — not in Spam, not in Trash. `in:anywhere` finds nothing.
- **Policy alone does not predict it.** Plenty of `p=reject` senders forward through fine; what decides it is whether DKIM survives the re-send. Do not conclude "not DMARC" from the fact that some `p=reject` senders arrive — that inference was made and had to be retracted.
- The only local evidence is a `MAILER-DAEMON@proton.me` "Undelivered Mail Returned to Sender" bounce. **Two kinds exist, distinguished by the bounce's `To:`** — forwarding failures are addressed to the forwarding envelope (`<local>=<domain>+<dest-local>=<dest-domain>@forward.protonmail.ch`), ordinary outbound-send failures to the user's own address. Search All Mail for `undelivered`.
- Bounces are far fewer than lost messages, so **absence of a bounce does not prove delivery**.
- Practical consequence: anything access-critical (login magic links, 2FA codes, password resets) should not depend on this forward. Register such accounts against the Gmail address directly.

# Gmail

## Gmail account

- Target account and current filter/label specifics: see **AGENTS.local.md**. Verify the account in the browser tab title before acting.
- Gmail caps filters at 1,000 per account; check the current count before large imports.
- Gmail applies **all** matching filters — no first-match ordering like ProtonMail sieve. Overlapping rules stack their actions (trash + label both apply; trashed mail is hidden from label views).
- A Gmail MCP server is connected (list_labels, delete_label, update_label, label/unlabel thread/message, search_threads, drafts, etc.). It exposes **no filter APIs** — filters can only be managed through the Gmail settings UI.
  - `search_threads` label queries take label **IDs** (e.g. `label:Label_42`), not display names; get IDs from `list_labels`.
  - **Gmail search is fuzzy and stemmed** — a phrase search can return unrelated threads and miss the one you want. To prove a message is _absent_, never trust a keyword search: list the whole window with `in:anywhere after:YYYY/MM/DD before:YYYY/MM/DD` (plus `includeTrash`) and read the results. `in:anywhere` does cover Spam and Trash, and `resultCountEstimate` is only an estimate.
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
- **Escape hatch:** the override _does_ work from the browser's own DevTools console, which runs in the page's main world — the user runs `window.confirm = () => true` there and Delete then proceeds silently. It persists until reload and auto-confirms everything on that page, so use a tab dedicated to deleting filters.
- **Real fix:** `users.settings.filters` (list/create/delete, scope `gmail.settings.basic`) has no UI and no dialog, and lets a sync diff desired-vs-actual instead of importing blind. The XML import path is inherently non-idempotent — re-running it can only add.

**Gmail settings DOM notes:**

- Old-school HTML in the top document (no iframes). Filter rows are `tr` elements containing "Do this:" plus an edit link; edit/delete controls are `span.sA[role="link"]`. The settings page preloads other tabs' content — label-management rows are also in the DOM, so always constrain row selectors with "Do this:".
- Element refs go stale after any click that re-renders the list. Re-find before each click, one mutation per call, and verify state after — JS DOM reads are the most reliable verification.
- Coordinate clicks are unreliable (viewport vs screenshot scale mismatch). Use refs from find/read_page, or dispatch events from JS.
