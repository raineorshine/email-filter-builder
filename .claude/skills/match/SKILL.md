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

**If the address or full subject is not legible, fetch it — do not guess.** Query the Gmail MCP
(`search_threads` on the subject, then `get_message`) and read `From`, `Subject` and `List-Id` off
the headers. Say which fields came from the screenshot and which from the API.

### 2. Run the matcher

```bash
node .claude/skills/match/match.js --from <address> --subject "<subject>" [--list <list-id>]
```

It reads the real spec from the main checkout (`filters.js`, gitignored — see `AGENTS.md` → Repo →
Files outside git); `--filters <path>` overrides. It prints two verdicts per matching entry, because
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
  `node src/sync.js "$MAIN/filters.js" --verbose` — and check whether that entry's query is in the
  create list. Set the session title's 🔍 prefix before any live-account check.
- **Label present but nothing matches:** a hand-made Gmail filter, a Shortwave rule, or a Proton
  filter. Hand-made Gmail rules populate the API's `from`/`subject` fields rather than `query` — a
  dry run shows them as deletes. Shortwave rules live in Settings → Filters and have no export.
- **In Proton, the folder is wrong:** filter order decides it — all matching filters run in list
  order and the last conflicting `fileinto` wins (`AGENTS.md` → ProtonMail → Filter order).

### 5. Report

Per matching entry: the destination actions, the condition that matched, and the matched query.
Then one line per unexplained label naming its actual source. Do not change `filters.js` or touch an
account — this skill diagnoses. If a fix is warranted, say what it would be and let the user ask.
