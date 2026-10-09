# Shortwave

## Built-in labels have no off switch

- Settings → Labels renders the nine built-in labels with an ⓘ info icon per row and no toggle, hide, or delete control. Nothing in Labels, Inbox setup, or Appearance stops the classifier from applying them.
- A built-in label is a _label only_ — it does not create a bundle or an inbox split by itself. Bundles (Inbox setup → Label bundles) and splits are separately opt-in, so "hide its bundle" is not an available workaround.
- The stated override is a filter, per the section header: built-in labels "are automatically added to new emails. You can override this behavior by defining filters." An AI filter can target a built-in label (observed on an existing filter's action chip); the Create AI filter picker list was not confirmed.
- To keep a built-in label out of the inbox without removing it: Settings → Filters → **Label skip inbox**. The label stays applied and stays in the sidebar and picker.
- Verified 2026-09 against Updates; the row UI is identical for all nine.

## Rules and filters

- "Always Apply" / auto-apply rules (Settings → Filters → Label auto-apply rules) are stored in **Shortwave's backend** — never as Gmail filters, even for plain sender→label rules targeting Gmail labels. They don't count toward Gmail's 1,000-filter cap.
- Effect vs rule: applying a Gmail label syncs to Gmail (visible in all clients); the rule itself is Shortwave-only and dies with the Shortwave account.
- **The UI has no export** for auto-apply rules — the rule dialog offers only add/remove sender — but
  the whole rule set is in IndexedDB, so do not transcribe gear dialogs one at a time. On any
  logged-in tab, open the `shortwave-db-acct-<id>` database, read object store `settings` key
  `all_settings`, and take `.rules`. Each entry is
  `{ id: { criteria: { senderEmailAddress } }, settings: { userLabelsToAdd, userLabelsToRemove, sharedLabelsToAdd, sharedLabelsToRemove, threadFlagsToAdd, threadFlagsToRemove, inboxVolume, autoTrashMessage } }`.
  Resolve the `{labelId: "gmail/Label_N"}` references against object store `gmail_labels` (`{id, name, color}`).
  `all_settings` also holds `bundling`, `notifications` and `deliverySchedules` by the same route.
  It also holds `userProfile` (`sendAliases`, `receiveAliases`, `defaultSendFrom`) and `userSettings` (`defaultReplyFrom`, `'RECEIVED'` or `'DEFAULT'`, and the signature settings); object store `messages` holds each message's `from`, `toRecipients`, `ccRecipients` and `hiddenRecipients`, found by filtering `getAll()` on `subject`.
  `autoTrashMessage` and `inboxVolume` are string enums (`'ON'`/`'OFF'`, `'INHERIT'`), so a
  truthiness test on either reports every rule as set.
- **A rule keys on exactly one sender address and nothing else.** `criteria` has no subject or
  list field, so a Shortwave rule can never be narrower than "all mail from this address" — which is
  why they accumulate one per sender and why they translate cleanly into `filters.js` `from` entries.
- **`threadFlagsToAdd` drives a built-in label, not a Gmail one.** Its values are upper-case
  built-in identifiers rather than label ids — Shortwave's own labels, which wear the same names as
  Gmail user labels in the picker (`AGENTS.md` → Label namespaces) and have no Gmail equivalent. There is no
  mechanical translation into a `filters.js` entry — the two are different namespaces, and the same
  name in each is a coincidence, not a mapping. What is available is substitution: naming a Gmail
  user label to stand in for the built-in, which changes which chip the mail wears and is therefore
  the user's call, not a conversion an agent performs quietly. `userLabelsToRemove` is not portable
  at all: Gmail filters add labels, they cannot remove them.
- **Retiring a rule is port, sync, verify, then delete — in that order.** A rule whose effect no
  Gmail filter reproduces is not a permanent keep; it is a keep until the spec covers it. Add the
  condition, apply the sync, confirm with `match.js` that the sender now gets the same outcome, and
  only then remove the rule. Deleting first opens a window where nothing handles that mail, and a
  list of "rules that must survive" drawn up before any porting goes stale the moment one is ported
  — which is how two sessions can each be right about a rule and still disagree.
- **A rule that removes a label may be removing nothing.** Before treating its deletion as a
  regression, find what actually applies that label: `match.js` on the sender, and a
  `from:<sender> label:<name>` search in Gmail against a bare `label:<name>` control, so an empty
  result is distinguishable from a malformed query. A removal rule can outlive whatever used to
  apply the label, leaving it with no effect to reproduce.
- Shortwave cannot manage Gmail filters: it shows a cached count (Settings → Filters → "Gmail filters", refresh link) and links out to Gmail settings for editing.
- AI filters and the quick-start filters (Needs Action, Cold Outreach, FYI, Travel, Finance, Purchases) are Shortwave-side natural-language classifiers, off unless added.

## Send-as aliases and reply-from

- **Shortwave keeps its own copy of Gmail's send-as list and does not refresh it on its own.** An address added under Gmail's Send mail as can still be missing from Shortwave long afterwards: Settings → Compose → Aliases reads "No aliases found", and "Default to sending replies from: Address the message was sent to" then sends from the Gmail address without a warning. Click **click to refresh** under Aliases and reload the page — the list stayed empty until the reload — and reload the desktop app as well, which keeps its own store.
- **The stored profile is not what the page is running on.** `userProfile.sendAliases` in IndexedDB listed the alias while the loaded page still showed none, so neither store proves the fix. Confirm a reply-from change by opening a reply draft on a message addressed to the alias, reading its From, and discarding the draft.
- **How reply-from picks an address** (read from Shortwave's shipped client code): it scans the replied-to message's from, to, cc and hidden recipients; the account's own address wins outright, otherwise the first one that is a send or receive alias. Under "Address the message was sent to" it sends from that alias, falling back to the default address. So a reply to one's own message sent from the Gmail address stays on Gmail — the thread's bottom **Reply all** answers the latest message — and the other side's answer to it arrives addressed to Gmail too. One wrong From keeps a thread on the wrong address until From is changed by hand once.

## Automating the Shortwave web app

- SPA; settings at `/settings/labels`, `/settings/filters`, `/settings/inbox`. A "We're still importing your email" interstitial may appear — click Refresh.
- Rule-row gear icons are hover-revealed and absent from the accessibility tree: locate them by geometry in JS (element at the same row height, right of the row) and dispatch MouseEvents.
- The rules list is grouped by label, one row per label with a sender count, so a built-in label and
  a Gmail user label of the same name show as two identical-looking rows. Tell them apart by the icon
  and by position — the built-ins sort above the alphabetical run of user labels — and open the dialog
  to read the sender before removing anything.
- The rule dialog is titled "Auto-apply rules for \<Label\>" with ALWAYS APPLY / ALWAYS REMOVE sender lists.
- **Escape closes the whole settings panel, not the open dialog** — it navigates back to the inbox and re-renders the rule list, so using it to close between rules leaves a loop reading stale rows and firing gear clicks on the wrong ones. Close with the dialog's own control: the first `<button>` inside the overlay.
- **A long address is ellipsis-truncated in the row text** (`alerts@..ation.example.com`), so matching a row on the full address silently finds nothing while short addresses match fine. Split the shown value on `..` and test the target with `startsWith`/`endsWith`.
- **The address sits in a different element per sender** — an `<h4>` beside the display name, a `<p>` when the sender has none. Take the row's deepest leaf whose text looks like an address rather than selecting a tag.
- **Auto-trash rules are not auto-apply rules.** They live in a separate "Blocked senders" section with its own row structure and never appear under Label auto-apply rules, so a deletion pass that walks only the label rows misses them.
- **Emptying a label group removes its row**, and a rule carrying two labels survives removal from one — it disappears only when its last label goes. So the rule count falls more slowly than the senders removed; count rules, not rows, to tell a failed removal from a partial one.
- **The per-sender remove button in the rule dialog** is hover-revealed and, unlike the row gear, does
  **not** appear from a dispatched hover: hover the sender row with `computer` first, then click the
  button that materialises (see [browser-automation.md](browser-automation.md)). Removal is immediate — no confirmation step,
  no undo — and the next sender shifts up into the removed one's position, so repeating the same
  hover-and-click empties a list without re-reading the geometry.
- **The reply composer hides its From line and has two trash icons.** From is absent from the accessibility tree until the recipient row under the message is clicked to expand it. The trash icon in the composer's header trashes the whole thread; discarding the draft is the small trash icon beside the body (tooltip "Discard draft", ⌘⇧D) — hover to read the tooltip before clicking either.
- "Create AI filter" (Settings → Filters) did not open its dialog from either a ref click or a coordinate click — no modal rendered either way. Unresolved; budget extra time if a session needs that flow.
