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
const filters = [
  {
    conditions: [
      {
        comment: 'Grubhub Receipt',
        from: 'noreply@grubhub.com',
        subject: 'Here is your Grubhub Receipt',
      },
    ],
    actions: [
      {
        fileinto: ['archive', 'Receipts'],
      },
    ],
  },
]

module.exports = filters
```

**Sieve output:**

```hs
require ["include", "environment", "variables", "relational", "comparator-i;ascii-numeric", "spamtest", "fileinto", "imap4flags"];
if allof (environment :matches "vnd.proton.spam-threshold" "*", spamtest :value "ge" :comparator "i;ascii-numeric" "${1}") {return;}
if allof (header :contains "Subject" "Here is your Grubhub Receipt", address :all :matches "From" "noreply@grubhub.com"){fileinto "archive";fileinto "Receipts";}
```

**Gmail output:**

```xml
<?xml version='1.0' encoding='UTF-8'?>
<feed xmlns='http://www.w3.org/2005/Atom' xmlns:apps='http://schemas.google.com/apps/2006'>
  <title>Mail Filters</title>
  <id>tag:mail.google.com,2008:filters:1</id>
  <updated>2024-01-01T00:00:00Z</updated>
  <entry>
    <category term='filter'></category>
    <title>Mail Filter</title>
    <content></content>
    <apps:property name='from' value='noreply@grubhub.com'/>
    <apps:property name='subject' value='&quot;Here is your Grubhub Receipt&quot;'/>
    <apps:property name='label' value='Receipts'/>
    <apps:property name='shouldArchive' value='true'/>
    <apps:property name='sizeOperator' value='s_sl'/>
    <apps:property name='sizeUnit' value='s_smb'/>
  </entry>
</feed>
```

## Sieve (ProtonMail)

- Sieve spec: https://www.rfc-editor.org/info/rfc5228
- ProtonMail spec: https://proton.me/support/sieve-advanced-custom-filters
  - Note: ProtonMail does not support the [body](https://datatracker.ietf.org/doc/html/rfc5173) extension.
  - Limited to 50k characters, so many filters are combined into one `anyof` rule and the output is split into 50k chunks.

## Gmail

Import `out/gmail.xml` in Gmail: **Settings → See all settings → Filters and Blocked Addresses → Import filters**.

- Each condition becomes its own filter, since Gmail's limit of 1,000 filters is far less restrictive than ProtonMail's 50k-character sieve limit.
- A `fileinto` destination of `archive` maps to "Skip the Inbox (Archive it)", `trash` maps to "Delete it", and every other destination maps to a label (created automatically on import if it does not exist).
- Gmail applies at most one label per filter, so a filter with multiple labels is expanded into one imported filter per label.
- Sieve `:matches` globs in `from` are translated to Gmail's token-based search: `*@example.com` and `*@*.example.com` become `example.com`, and patterns like `billing.*@example.com` become `billing example.com` (terms are ANDed). A token fragment left dangling by a wildcard (the `s` of `*s@example.com`) cannot be expressed in Gmail search and is dropped, which errs on the side of matching more broadly.
- Multi-word subjects are quoted so Gmail matches the exact phrase, mirroring sieve's `:contains`.
- Labels are applied by Gmail to incoming mail server-side, so they appear in any Gmail client, including Shortwave.
