---
name: filter
description: 'Add or update a filters.js entry from a plain-language description ("archive the weekly digest from Acme", "label everything from my bank as Finance"). Infers the deterministic rule, states it back, checks it against the existing spec for duplicates and overlaps, edits filters.js, and syncs it to Gmail. Use when asked to add, create, change, widen or retarget a mail filter.'
---

# Filter (description → one deterministic rule in filters.js)

Input is a description of mail and what should happen to it. Output is a rule that is exactly
expressible in the spec, stated back to the user, landed in `filters.js` without duplicating
anything already there, and synced to the account.

Examples in this file are invented. The privacy rule in `AGENTS.md` applies to anything this skill
writes into committed files; `filters.js` itself is gitignored and is where real senders belong.

## Procedure

### 0. Prefix the session title with ⏳

Read the title (`mcp__ccd_session_mgmt__get_session` with `"self"`) and set it back with a `⏳ `
prefix, replacing any existing one. Later steps move it to 🔍, 💾 or 🚙. Never mention it. See
`AGENTS.md` → Repo → Session titles.

### 1. Pin down the message

A rule needs real header values, not the description's paraphrase of them.

- **Sender address**, not display name — "mail from Acme" says nothing about whether it comes from
  `news@acme.com` or `noreply@mail.acme-billing.com`.
- **Subject** as sent, if the rule is about one kind of mail from a sender that sends several.
- **List-Id**, if it is mailing-list mail.

If the user gave a screenshot, read it as the `match` skill does (step 1 there). Otherwise, or if a
value is not legible, fetch examples with the Gmail MCP: `search_threads` for the sender or subject,
then `get_message` on a few hits and read `From`, `Subject`, `List-Id` off the headers. **Look at
several messages, not one** — the family's real variation decides the shape of the rule.

### 2. Infer the rule

Translate into the spec's vocabulary only (README → Spec): `from` (sieve glob), `subject`
(contiguous substring), `list` (List-Id substring); criteria in one condition AND, conditions in one
entry OR. Actions are `fileinto` destinations: a label name, `archive` (skip inbox), `trash`.

Choose the narrowest rule that still covers the whole family:

- **`from` shape.** Exact address for a person, or for a consumer domain (`gmail.com`, `outlook.com`).
  `*@domain` for a company whose every sender should be treated alike. `*@*.domain` only when mail
  genuinely arrives from rotating subdomains. Rotating local parts (`no-reply-<hash>@`) need a glob.
- **Never** let a `from` reduce to a bare TLD or a token so short Gmail matches half the mailbox.
  Short dangling glob fragments are dropped by the Gmail renderer (`AGENTS.md` → What the code does),
  so `*s@acme.com` means `acme.com` in Gmail.
- **`subject`** only when the sender also sends mail that must not match. It should match a kind
  of mail, not the message in hand, so it keeps the template's fixed wording and drops everything
  filled in per message: dates and times, amounts and counts, order, ticket and tracking numbers,
  and names — of people (the user's own included), documents, products. Strip these even when
  every sample agrees on one; samples from one week, or all from one colleague, share values the
  next message will not. Keep a value only when the description singles it out ("the digest for
  the Berlin team").
- **Stripping splits the subject into pieces**, and `subject` takes one contiguous fragment: the
  longest piece, trimmed to whole words, that every real subject in the family contains and the
  sender's other mail does not. `Your March 2026 usage report` gives `usage report`;
  `Alice commented on your post` gives `commented on your post`. A family that varies mid-phrase
  needs one condition per variant.
- **Test the fragment on the account**: `search_threads` for `from:<sender> subject:"<fragment>"`
  should find this kind of mail across different dates and names, and none of the sender's other
  mail.
- **Label names** must already exist on the account unless the user is asking for a new one. Compare
  against labels used elsewhere in `filters.js` and `list_labels`; near-identical names are a typo,
  not a new label (`Receipt` vs `Receipts`).

Anything the spec cannot express — a recipient condition, "unless it mentions X", mark-as-read,
removing a label — is not a `filters.js` rule. Say so, and say where it would have to live (a
hand-made Proton filter, a Shortwave AI filter), rather than approximating it.

### 3. State the rule back

Draft the rule now; present it once step 4 has classified it, and before step 5 edits anything. Give
the user the rule as a table, one row per condition, followed by a one-sentence plain-language
reading of it. The table has at most six columns — Change, Sender, Subject, List-Id, Actions,
Replaces — and **drops List-Id when no row has one**, as here:

| Change | Sender         | Subject         | Actions              | Replaces        |
| ------ | -------------- | --------------- | -------------------- | --------------- |
| widen  | `*@acme.com`   | `Weekly digest` | Newsletters, archive | `news@acme.com` |
| add    | `*@*.acme.com` | `Weekly digest` | Newsletters, archive | —               |

> Mail from Acme whose subject contains "Weekly digest" gets the Newsletters label and skips the inbox.

- **Change** — `add`, `widen`, `update`, `remove`, or `duplicate` (the row already exists; nothing
  is written), per the classification in step 4.
- **Sender / Subject / List-Id** — the exact values written to the spec, in backticks, `—` when the
  condition has no such criterion (List-Id is dropped instead when every row would be `—`). A glob is shown as the glob, not paraphrased.
- **Actions** — the entry's labels, then its inbox effect: `archive`, `trash`, or nothing when the
  mail stays in the inbox.
- **Replaces** — for `widen`/`update`, the condition(s) this row supersedes; `—` otherwise.

A condition's `comment` goes in the plain-language sentence, not a column. A `duplicate` row names
the existing entry's actions, not the requested ones, so a mismatch is visible.

Name any inference the description did not force — a glob widened from one address, a subject
fragment chosen from several samples, a date or name stripped from a subject, a label picked from
near matches. If the description left a real choice open (which label, archive or not, whole sender
or one kind of mail), ask instead of guessing, and set 🚙 first. Otherwise proceed; the statement is
there so the user can object.

### 4. Check for duplicates and overlaps

Resolve `CONFIG` (`AGENTS.md` → Files outside git) and **re-read `$CONFIG/filters.js` now** — it
is shared across worktrees and may have changed since the session started.

Run every sample message from step 1 through the matcher:

```bash
node .claude/skills/match/match.js --from <address> --subject "<subject>" [--list <list-id>]
```

That covers the forward direction — existing entries that already match the mail. It does not cover
the reverse: existing narrower conditions the new rule would subsume. For that, grep the spec for
the sender's distinctive domain label (`acme`, not `com`) and read every hit.

Then classify:

| Finding                                                                  | Action                                                                                                            |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| An entry already matches with the same actions                           | **Duplicate.** Change nothing; tell the user which entry already does it.                                         |
| Nothing related                                                          | **Add.** Append the condition to the entry with the same actions, or add a new entry if none.                     |
| An entry matches with different actions, and the user asked for a change | **Update.** Edit that condition (move it to the other entry, or change its entry's actions if it is alone there). |
| The new rule would subsume narrower conditions with the same actions     | **Widen.** Replace them with the new condition rather than adding beside them.                                    |
| Near miss (`stale sender`, `sibling domain`)                             | **Update** the stale condition to the sender's new address rather than adding a second one.                       |
| Partial overlap with different actions                                   | Judgment — see below.                                                                                             |

**Partial overlap** is when some of the mail is already handled differently: the new rule is
`*@acme.com → archive` and an existing condition sends `billing@acme.com` to `Finance`. Gmail applies
every matching filter and they stack (label + archive both happen; trash hides mail from label
views); Proton's last conflicting `fileinto` wins. Work out what the overlapping mail would actually
get after the change:

- If the stacked result is plainly what the user wants (a label plus skip-inbox), proceed and say so.
- If it is plainly not (trash overlapping a label the user reads), narrow the new rule — a `subject`,
  or exact addresses instead of a glob — and say so.
- If it could go either way, ask, naming the specific mail affected and the two outcomes. Set 🚙.

Moving a condition between entries also matters when an entry's actions are shared by other
conditions: never change an entry's actions to fix one sender — move that sender out.

### 5. Edit filters.js

Edit `$CONFIG/filters.js` in place (it produces no git diff). Match the file's existing style:
`comment` on a condition where the sender alone does not say what the mail is. Then verify by
loading, not reading:

```bash
node -e 'const f=require(process.argv[1]); console.log(f.length, f.reduce((n,e)=>n+e.conditions.length,0))' "$CONFIG/filters.js"
```

The condition count should move by exactly what step 4 decided. Re-run the matcher on the samples:
the intended entry — and only the intended entries — should now match.

### 6. Sync

Follow `AGENTS.md` → Gmail → Account and filters, which authorizes applying a clean plan without
asking. Set 🔍, then dry-run: `node src/sync.js --verbose` (the spec and credentials default to
the config directory).

Audit the plan: every deleted term reappears in a created query under the same label (re-chunking),
the new terms appear under the intended label, `Labels to create` holds nothing unexpected, no bare
TLD. If the plan carries changes this edit does not explain, that is pending drift or another
session's edit — stop and report it rather than applying it along with yours.

A clean plan: set 💾, `node src/sync.js --apply --yes`, then set 🚙 or leave 💾 per
the session-title rules.

### 7. Report

- The rule table from step 3, updated to what was actually written — its **Change** column says what
  happened to the spec.
- Any overlap and how it resolves for the overlapping mail.
- `💾 Synced to gmail` when the apply ran.

Do not mention mail already in the inbox or offer to apply the filter retroactively.
