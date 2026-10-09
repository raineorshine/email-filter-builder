# Gmail: OAuth app and settings UI

The Google Cloud project behind `sync.js`, and the Gmail settings UI as a fallback to it. Account and filter behaviour is in `AGENTS.md` → Gmail.

## OAuth app (Google Cloud console)

`sync.js` needs a Google Cloud project with the Gmail API enabled and a Desktop OAuth client. Project and client specifics are in `AGENTS.local.md`. What is worth knowing before touching it:

- **Three scopes, and the obvious one is not enough.** `gmail.settings.basic` covers the filter endpoints but _not_ `users.labels`, which the action mapping needs to turn a `fileinto` destination into a label id (and to create a missing label), so `gmail.labels` is required too. `userinfo.email` is there only so the sync can print which account it is about to write to.
- **`gmail.settings.basic` also reads the send-as addresses.** `src/gmail-api.js` has no method for it, but `GET users/me/settings/sendAs` with the stored token returns each address's verification status, `treatAsAlias` and SMTP relay — enough to tell whether a wrong From is Gmail's doing or a client's.
- **Publishing status governs token lifetime.** An External app left in _Testing_ has its refresh token expired by Google every 7 days, so nearly every run reauthorizes. _In production_ makes it durable. Publishing requires a reachable home page and privacy policy URL plus the domain under Authorized domains — that is the only reason `site/` exists.
- **Publishing does not make the app verified.** The "Google hasn't verified this app → Advanced → Go to …" interstitial and the 100-user cap persist, because Gmail's filter scopes are restricted; clearing those needs a full verification review, which is not worth it for a single-user tool. Expect the interstitial on every fresh authorization.
- **Creating a project may demand a billing account** — the console refuses without one even though Gmail API usage is free. Attaching one is the user's decision, not an agent's.
- **The client secret is shown once, at creation.** Agent tooling is blocked from scripting anything that handles it, so the user downloads the JSON and places `.gmail-credentials.json` themselves. Do not close the creation dialog before that file exists, or the client has to be recreated.
- **Do not borrow an unrelated existing project** just because its consent screen is already configured. It pollutes someone else's app with a client and an enabled API, and the consent screen users see carries that project's branding.
- **The console needs dispatched MouseEvents.** Ref clicks silently no-op on its buttons (Enable, Create, Save) far more often than they work. Its dropdowns are `cfc-select` custom elements with `[role="option"]` lists, not `<select>`, so `form_input` does not drive them — click the select, then dispatch on the option. See [browser-automation.md](browser-automation.md).

## Settings UI (fallback — prefer `sync.js`)

Everything below applies only when a session is forced into `https://mail.google.com/mail/u/0/#settings/filters`.

**XML import — automatable, but re-imports duplicate:**

1. "Import filters" link → upload with `file_upload` on the file input ref (never click "Choose File" — it opens a native picker) → "Open file".
2. In the review list Gmail **unchecks** rows it warns about (label+delete combos). Click the import section's "Select: All" link — the All/None pair immediately preceding the "Create filters" button (there are three All/None pairs on the page).
3. Leave "Apply new filters to existing email" **unchecked** unless retroactive application is explicitly wanted.
4. "Create filters" runs an in-page progress overlay at ~1–2 filters/sec (a ~100-filter import takes a couple of minutes). Filters identical to existing ones are silently skipped (the "Failed or skipped" counter).
5. Re-importing the full file **duplicates** every non-identical-but-overlapping filter — Gmail only dedupes exact matches (criteria and actions). To update existing filters, edit them or delete the old ones first; don't blind re-import.

**Filter edit — automatable:** row "edit" link → criteria overlay → Continue → actions screen. The label picker is a div listbox (`role=listbox`/`role=option`), not a `<select>`: open it by clicking the listbox ref, then select by dispatching MouseEvents on the option with the **exact** target text (beware near-identical names), verify the listbox text via DOM read, then "Update filter".

**Filter delete — not safely automatable in the browser.** The per-row delete links and the bulk Delete button call native `window.confirm()` (see [browser-automation.md](browser-automation.md)); the API deletes outright, with no dialog.

- While a dialog is pending, `computer` actions fail with the chrome-extension error and DOM tools keep working; close the wedged tab and create a fresh one.
- **Danger:** a pending dialog can be auto-_accepted_ when its tab is destroyed — a deletion that appeared cancelled can land minutes later. Never leave a delete dialog pending, and recount filters afterward rather than assuming a cancelled delete stayed cancelled.
- Deletions should be done by the user (tick checkboxes → Delete → one OK confirms the whole batch), or with the user present to click OK.

**DOM notes:** old-school HTML in the top document (no iframes). Filter rows are `tr` elements containing "Do this:" plus an edit link; edit/delete controls are `span.sA[role="link"]`. The settings page preloads other tabs' content — label-management rows are also in the DOM, so always constrain row selectors with "Do this:".
