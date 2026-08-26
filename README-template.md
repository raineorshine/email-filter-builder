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

- Each condition becomes its own filter, since Gmail has no meaningful limit on the number of filters (unlike ProtonMail).
- A `fileinto` destination of `archive` maps to "Skip the Inbox (Archive it)"; every other destination maps to a label (created automatically on import if it does not exist).
- Gmail applies at most one label per filter, so a filter with multiple labels is expanded into one imported filter per label.
- Labels are applied by Gmail to incoming mail server-side, so they appear in any Gmail client, including Shortwave.
