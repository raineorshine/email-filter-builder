---
name: match
description: 'Given a screenshot of an email (Shortwave, Gmail or Proton), work out which filters.js entries matched it and why, and explain any label the spec does not account for. Use when asked why a message got a label, folder, archive or trash, or why an expected filter did not fire.'
---

# Match (screenshot → which filters fired, and why)

Input is a screenshot of one message. Output is a per-entry verdict: which `filters.js` entries
match, on which condition, with which actions — plus an account of every label visible in the
screenshot, including the ones no filter explains.

## Procedure

### 1. Read the message off the screenshot

Needed: **from address**, **subject**, and — if the message is a mailing list — the **List-Id**.

- The sender's **address**, not the display name. Clients show `Allstate` where the filter matches
  `*@email.allstate.com`. Shortwave and Gmail show the address under the sender name once the
  message is open; a collapsed row usually does not.
- The subject as sent, not the client's truncation with `…`.
- Note every label chip on the message, and whether the message is in Inbox, Archive or Trash.

**If the address or full subject is not legible, fetch it — do not guess.** `search_threads` on the
subject returns each hit's sender address and full subject; a `List-Id` needs `get_message` with
`RAW`, the only format that carries headers. Say which fields came from the screenshot and which
from the API.

### 2. Run the matcher

```bash
node .claude/skills/match/match.js --from <address> --subject "<subject>" [--list <list-id>]
```

It reads the real spec from the config directory (`filters.js`, outside the repo — see `AGENTS.md`
→ Repo → Files outside git); `--filters <path>` or `FILTERS_FILE` overrides. It prints two verdicts per matching entry, because
two engines run the same spec:

- **`spec`** — sieve semantics, what ProtonMail runs: `from` is a case-insensitive glob over the
  whole address, `subject` and `list` are case-insensitive substrings, criteria within one condition
  are ANDed, conditions within an entry are ORed.
- **`gmail`** — the rendered Gmail query, what actually labeled the mail in Gmail or Shortwave. The
  queries come from `Specs` in `src/gmail.js`, the same function `sync.js` writes with, so they
  cannot drift. Term matching is **approximate**: Gmail matches whole tokens, and the renderer drops
  short dangling glob fragments, so a Gmail filter can match mail its sieve glob would not.

A `spec`/`gmail` disagreement is the interesting result, not a bug in the matcher — report it. A
`gmail` match with no `spec` match means the live filter is broader than the pattern intends.

Entries that fire nothing are then re-checked for **near misses** — conditions written for mail like
this whose `from` no longer reaches it. This is how a rule goes dead when a sender changes domain:
it matches nothing, reports nothing, and the mail reads as merely unfiltered rather than misfiltered.
Two shapes are reported, and a stale rule usually shows both:

- `stale sender` — every other criterion matches and only the sender does not, so the condition was
  written for exactly this mail. A one-word subject fragment does not count; it recurs too widely.
- `sibling domain` — the sender shares a distinctive domain label with the message but does not
  match, e.g. `*@acme.co` against `support@mail.acme.com`.

A near miss is a finding, not a footnote: the entry names the labels and actions the message was
meant to get, so it says what the mail _should_ have done.

### 3. Account for every label on screen

Three different things can wear the same name (`AGENTS.md` → Mail setup → Label namespaces), and
only one of them comes from this repo:

| Chip                      | Source                                                                                                          | How to tell                                |
| ------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Gmail user label          | a `fileinto` in `filters.js`, applied by the Gmail filter                                                       | the matcher named it                       |
| Shortwave built-in        | Shortwave's classifier — Travel, Calendar, Newsletters, Purchases, Finance, Social, Promotions, Forums, Updates | one of those nine names, no matching entry |
| Shortwave auto-apply rule | Shortwave's backend, invisible to Gmail                                                                         | a Gmail label name with no matching entry  |
| Gmail category            | Gmail's own ML                                                                                                  | Gmail UI only, never a Shortwave chip      |

So a screenshot showing `Home`, `Purchases`, `Updates` where only `Home` matches is fully explained:
the other two are built-ins, not missing filters. **Never propose a spec change for a built-in** —
there is no off switch for them; the lever is Settings → Filters → Label skip inbox.

### 4. When the verdict contradicts the screenshot

The spec is not proof of what is on the account — the account may have drift, or hand-made filters
`filters.js` knows nothing about.

- **Entry matches but the label is absent:** the filter may never have been synced, or the mail
  predates it (Gmail filters are not retroactive). Confirm with a dry run —
  `node src/sync.js --verbose` — and check whether that entry's query is in the
  create list. Set the session title's 🔍 prefix before any live-account check.
- **Nothing matches and the mail looks unfiltered:** read the near misses first. A stale `from` is
  the likeliest cause, and it is invisible in the plan a dry run prints — a dead rule is still in
  sync, because the spec and the account agree on a filter that matches nothing.
- **Label present but nothing matches:** a hand-made Gmail filter, a Shortwave rule, or a Proton
  filter. Hand-made Gmail rules populate the API's `from`/`subject` fields rather than `query` — a
  dry run shows them as deletes. Shortwave rules live in Settings → Filters; the UI has no export,
  but the rule set is readable from IndexedDB (`AGENTS.md` → Shortwave → Rules and filters).
- **In Proton, the folder is wrong:** filter order decides it — all matching filters run in list
  order and the last conflicting `fileinto` wins (`AGENTS.md` → ProtonMail → Filter order).

### 5. Report

Per matching entry: the destination actions, the condition that matched, and the matched query.
Then one line per unexplained label naming its actual source. Do not change `filters.js` or touch an
account — this skill diagnoses. If a fix is warranted, say what it would be and let the user ask.
