# ProtonMail

Proton runs the generated `out/*.sieve` scripts plus any hand-made filters and forwards to Gmail; account specifics live in `AGENTS.local.md`.

## Filter order — last conflicting action wins

Proton applies **all** matching filters, in the listed order, and per Proton's own docs: "When multiple filters apply to a message, all non-conflicting actions will be applied. If there are actions that conflict, the last action will be applied to the message." ([How to use email filters](https://proton.me/support/email-inbox-filters))

Two filters that both `fileinto` a folder **conflict**; the message lands in the _later_ filter's folder. Labels and stars are non-conflicting and accumulate from every match.

This has a sharp consequence for this project:

- **A catch-all "move to Archive" filter must be ordered _before_ the generated sieve scripts.** Placed after them it silently overrides every `trash` rule the builder emits — junk that should be trashed is archived instead, with no error anywhere. Same for any hand-made folder-moving filter that overlaps the generated rules.
- The same hazard exists _within_ a generated script: a later `fileinto "archive"` block beats an earlier `fileinto "trash"` block for any message matching both. Today's entries overlap on sender globs but are kept disjoint by their subject conditions — re-check after editing `filters.js` if a sender appears in both a trash entry and an archive entry.
- The generated scripts contain no `stop`, so nothing short-circuits; every later filter still runs.

## What the Proton UI filter builder can express

Worth knowing before assuming a rule has to live in `filters.js` — this repo's builder supports only sender/subject/mailing-list conditions and `fileinto` actions, so anything below has to be a hand-made Proton filter:

- **Conditions:** the subject / the sender / the recipient / the attachment. Operators: contains, is exactly, begins with, ends with, matches, plus a negation of each.
- **Actions:** label as (any number), move to (exactly one folder), mark as read and/or starred, send auto-reply.
- Conditions are combined with ALL or ANY. One condition row accepts **multiple values**, OR'd inside the comparator — so with a negated comparator a single row means "matches none of these", which is the compact way to write a multi-address exclusion.
- Proton prepends a spam guard to every UI-built filter, so Spam is never touched.
- **Filters can be applied retroactively**, contrary to the usual assumption: a checkbox at filter creation, and "Apply to existing messages" in the row's ⋮ menu afterwards.
- **"Edit Sieve" works on UI-built filters** and is how to read the sieve one generates. Use it to verify a single filter before trusting it — but to read many, use the API below rather than opening each row.

## Reading every filter at once, over the API

Opening rows one at a time does not scale past a handful, and the row name is only a naming
convention — the sieve is what actually runs. Fetch the lot from page context on any logged-in
Proton tab:

```js
const uid = JSON.parse(localStorage.getItem('ps-0')).UID
await fetch('/api/mail/v4/filters', {
  credentials: 'include',
  headers: { 'x-pm-uid': uid, 'x-pm-appversion': 'web-account@<version from the sidebar footer>' },
})
```

- Auth is the `AUTH-*` cookie (HttpOnly, so `credentials: 'include'` does the work) plus the `x-pm-uid`
  header, whose value is in `localStorage['ps-0']`. Nothing needs the password.
- Each filter returns `Sieve` (the source) and `Tree` (Proton's parsed AST). Parsing `Sieve` is
  straightforward once the boilerplate — the `require` lines, the generated spam guard, and the
  `/** @type … @comparator … */` annotation — is stripped; what remains is one `if allof/anyof (…) { … }`.
- The generated `sieve-builder-*` scripts come back in the same list and dwarf everything else.
  Filter them out by name before parsing.
- Parse rather than trust: assert that every filter matched your grammar and report the ones that did
  not, instead of silently skipping them.

## Forwarding interacts with none of this

- Auto-forwarding is envelope-based: it forwards everything delivered to the address regardless of headers, and runs independently of filters. Archiving or trashing a message in Proton does **not** stop it being forwarded — which is what makes the archive-everything strategy safe.
- Forwarding is configured **per address**. An address with no rule forwards nothing, so audit the full address list before adding any catch-all archive rule, or mail to an unforwarded address is archived having never reached the destination.
- Enabling a forward to a destination without end-to-end encryption **disables E2EE for the source address** (zero-access encryption remains). Proton warns at the confirmation step. Get the user's sign-off — it is a security change, not a mail-routing one.
- Creating a rule requires the account password, then the _recipient_ clicks a confirmation link. An agent can do neither: hand both steps to the user.

## Checking where mail actually landed

Confirming what a filter did, without mutating anything:

- Proton search takes hash params and is scoped to the folder in the path: `/u/0/all-mail#from=<domain>`, `#to=<address>`, `#keyword=<text>`. Running the same query against `/u/0/trash` and `/u/0/archive` shows which folder a sender's mail is really landing in — that comparison is what separates "the trash rule fired" from "a later filter overrode it".
- In All Mail a row carries a location tag for Archive/Inbox/Sent but **not** for Trash, so an untagged row reads as inbox mail when it isn't. Trust the folder-scoped search, not the tag.
- Prefer search to opening messages: opening one marks it read. If you must open an unread message to read its headers, restore it with "Mark as unread" afterwards.
- **One message's placement proves nothing** — the user may have moved it by hand. Look for a before/after split across many messages from one sender, or settle the semantics against Proton's docs. An inference drawn from a single message led to a wrong conclusion about filter ordering in one session.
- To confirm a message actually reached the destination account, query the Gmail MCP (`search_threads`) rather than reading the Gmail UI.
- Proton groups same-subject messages into one conversation regardless of age, so a thread can span years and a new message can look like an old one. In the conversation view each message is its own `<article>`; `querySelector('article')` returns the first, not the one you opened — read them all and match on the date.

## Automating the Proton settings UI

- **Modals do not open from a `computer` ref click.** Dispatch `pointerdown/mousedown/pointerup/mouseup/click` MouseEvents from `javascript_tool` instead. Inside an open modal the reverse holds: ref clicks work and JS dispatch on dropdown options silently does nothing. Native `.click()` works on toggle labels but not on dropdown triggers.
- **Dropdown options often need a second click** — the first opens/re-opens the list without selecting. Always read the control back to confirm the value took.
- Never scroll between the `find` and the click it feeds, and verify which record a modal actually opened before touching it (see [browser-automation.md](browser-automation.md) on stale refs).
- Several closed `.modal-two` nodes linger in the DOM. Select the live one with `[...document.querySelectorAll('.modal-two')].filter(d => !d.classList.contains('modal-two--out')).pop()`.
- **Reordering filters** has no menu item — drag handles only — but dnd-kit's keyboard sensor works: focus `td[aria-roledescription="draggable"]`, Space to lift, ArrowUp/ArrowDown, Space to drop. Three gotchas: the drag attributes attach only _after_ a real scroll interaction on the page; moves must be chunked (`repeat: 10` with a ~1s wait between — one `repeat: 100` call does nothing); and the drag overlay leaves a phantom duplicate row that captures focus, so reload between drags. Reordering persists server-side. Moving a filter from the end of a ~200-row list to the top took about twenty chunks.
- Row ⋮ menu: Apply to existing messages / Edit Sieve / Delete. If it will not open, its items are already in the DOM — click by aria-label (`Edit Sieve filter "<name>"`).
- Deleting or disabling a superseded filter: the row toggle is reversible and is the safer choice over Delete when a rule may need backing out.
