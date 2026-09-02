# email-filter-builder

Generates email filters from a simple, declarative JSON specification. Outputs both a [Sieve](https://www.rfc-editor.org/info/rfc5228) script (ProtonMail) and Gmail's XML import format.

Limited to the specific use case of matching by subject and sender, and filing into folders/labels.

## Usage

```sh
node bin.js filters.js
```

Writes to `./out`:

- `1.sieve`, `2.sieve`, … — Sieve scripts, split into 50k-character chunks to fit ProtonMail's filter size limit
- `gmail.xml` — Gmail filter import file

To push the same spec straight to Gmail instead of importing the XML by hand:

```sh
node sync.js filters.js          # dry run: prints the planned creates and deletes
node sync.js filters.js --apply  # applies them
```

**filters.js:**

```js
${filters}
```

**Sieve output:**

```hs
${sieveOutput}
```

**Gmail output:**

```xml
${gmailOutput}
```

## Sieve (ProtonMail)

- Sieve spec: https://www.rfc-editor.org/info/rfc5228
- ProtonMail spec: https://proton.me/support/sieve-advanced-custom-filters
  - Note: ProtonMail does not support the [body](https://datatracker.ietf.org/doc/html/rfc5173) extension.
  - Limited to 50k characters, so many filters are combined into one `anyof` rule and the output is split into 50k chunks.

## Gmail

Two ways to get the filters into Gmail. Both render the same criteria and actions from the same spec, so they stay in step.

### Sync (recommended)

`node sync.js` diffs the spec against the account's live filters through the Gmail API and reconciles them. It is idempotent: filters that already match are left alone, so a second run makes zero writes.

```sh
node sync.js filters.js          # dry run: prints the planned creates and deletes
node sync.js filters.js --apply  # applies them
```

- **Dry run by default.** Nothing is written without `--apply`, and `--apply` prompts before deleting unless `--yes` is passed. `--verbose` prints full queries instead of truncating them.
- **The spec is the source of truth.** Any live filter the spec does not describe is deleted, so hand-made filters must be migrated into `filters.js` first or they will be removed.
- **An unpublished OAuth app expires its refresh token every 7 days.** The sync detects the dead token and reauthorizes on its own, so this costs a browser click-through rather than a broken run.
- **Deletes run before creates.** An interrupted sync then leaves filters missing rather than duplicated, and re-running converges — Gmail applies _every_ matching filter, so duplicates would both stay live.
- The Gmail API has no filter update, so an edited rule is a delete plus a create.
- Labels the spec files into are created if they do not exist.

#### One-time OAuth setup

1. Create a project at [console.cloud.google.com](https://console.cloud.google.com) and enable the **Gmail API**.
2. Configure the OAuth consent screen as **External**, and add your own address under **Test users**.
3. Create an OAuth client of type **Desktop app** and download its JSON.
4. Save it as `.gmail-credentials.json` in the repo root (gitignored), or set `GMAIL_CLIENT_ID` and `GMAIL_CLIENT_SECRET`.

The first run opens a browser for consent and caches a refresh token in `.gmail-token.json` (gitignored, mode 600). Both paths can be overridden with `GMAIL_CREDENTIALS_FILE` and `GMAIL_TOKEN_FILE`, which is how a git worktree reuses the main checkout's gitignored files. Scopes requested: `gmail.settings.basic` for the filters, `gmail.labels` to resolve and create labels, and `userinfo.email` so the sync can print which account it is about to modify.

### XML import

Import `out/gmail.xml` in Gmail: **Settings → See all settings → Filters and Blocked Addresses → Import filters**. Gmail dedupes only on exact matches, so re-importing an edited spec leaves the old filters live beside the new ones — prefer the sync.

### Mapping

- Conditions that share the same actions are OR-merged into as few filters as possible to stay well under Gmail's 1,000-filter cap. Merged criteria go in the filter's "Has the words" field using `from:`/`subject:` search operators.
- Each merged query is capped at 600 characters, since very long queries can silently misbehave; larger groups split across multiple filters. Tune with `gmail(filters, { maxQueryLength })`.
- A `fileinto` destination of `archive` maps to "Skip the Inbox (Archive it)" (`removeLabelIds: [INBOX]` over the API), `trash` maps to "Delete it" (`addLabelIds: [TRASH]`), and every other destination maps to a label, created if it does not exist.
- Gmail applies at most one label per filter, so a filter with multiple labels is expanded into one imported filter per label.
- Sieve `:matches` globs in `from` are translated to Gmail's token-based search: `*@example.com` and `*@*.example.com` become `example.com`, and patterns like `billing.*@example.com` become `billing example.com` (terms are ANDed). A token fragment left dangling by a wildcard (the `s` of `*s@example.com`) cannot be expressed in Gmail search and is dropped, which errs on the side of matching more broadly.
- Multi-word subjects are quoted so Gmail matches the exact phrase, mirroring sieve's `:contains`.
- Labels are applied by Gmail to incoming mail server-side, so they appear in any Gmail client, including Shortwave.
