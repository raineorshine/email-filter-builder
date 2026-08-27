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

Import `out/gmail.xml` in Gmail: **Settings → See all settings → Filters and Blocked Addresses → Import filters**.

- Conditions that share the same actions are OR-merged into as few filters as possible to stay well under Gmail's 1,000-filter cap. Merged criteria go in the filter's "Has the words" field using `from:`/`subject:` search operators.
- Each merged query is capped at 600 characters, since very long queries can silently misbehave; larger groups split across multiple filters. Tune with `gmail(filters, { maxQueryLength })`.
- A `fileinto` destination of `archive` maps to "Skip the Inbox (Archive it)", `trash` maps to "Delete it", and every other destination maps to a label (created automatically on import if it does not exist).
- Gmail applies at most one label per filter, so a filter with multiple labels is expanded into one imported filter per label.
- Sieve `:matches` globs in `from` are translated to Gmail's token-based search: `*@example.com` and `*@*.example.com` become `example.com`, and patterns like `billing.*@example.com` become `billing example.com` (terms are ANDed). A token fragment left dangling by a wildcard (the `s` of `*s@example.com`) cannot be expressed in Gmail search and is dropped, which errs on the side of matching more broadly.
- Multi-word subjects are quoted so Gmail matches the exact phrase, mirroring sieve's `:contains`.
- Labels are applied by Gmail to incoming mail server-side, so they appear in any Gmail client, including Shortwave.
