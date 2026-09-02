---
name: shortwave
description: Shortwave email client knowledge — how its labels and filters relate to Gmail, what syncs and what doesn't, settings URLs, and UI automation gotchas. Use when a task involves Shortwave, its auto-apply rules, or labels as seen from Shortwave.
---

# Shortwave

Shortwave (app.shortwave.com) is a Gmail client. Gmail remains the backend for mail, user labels, and Gmail filters — Gmail filters run server-side before Shortwave sees a message, and Shortwave honors them.

## Label namespaces (three things can share one name)

| Kind | Lives in | Picker appearance | Notes |
|---|---|---|---|
| Gmail user label | Gmail, syncs everywhere | plain tag icon; URL `/labels/gmail%2FLabel_<id>` | The only kind Gmail filters can apply |
| Shortwave built-in label | Shortwave only | own icon (cart, plane, …); URL `/labels/<name>` | Travel, Calendar, Newsletters, Purchases, Finance, Social, Promotions, Forums, Updates — auto-applied by Shortwave's classifier, invisible to Gmail, not removable from the picker |
| Gmail system category | Gmail UI only (`#category/…`) | not shown | ML-assigned; not writable by apps; filters' Categorize-as covers only the five inbox tabs |

Near-identical names across namespaces are easy to misread in the "Label as" picker.

## Rules and filters

- "Always Apply" / auto-apply rules (Settings → Filters → Label auto-apply rules) are stored in **Shortwave's backend** — never as Gmail filters, even for plain sender→label rules targeting Gmail labels. They don't count toward Gmail's 1,000-filter cap.
- Effect vs rule: applying a Gmail label syncs to Gmail (visible in all clients); the rule itself is Shortwave-only and dies with the Shortwave account.
- **No export** for auto-apply rules — the rule dialog offers only add/remove sender. To export, open each rule's gear and transcribe its sender list.
- Shortwave cannot manage Gmail filters: it shows a cached count (Settings → Filters → "Gmail filters", refresh link) and links out to Gmail settings for editing.
- AI filters and the quick-start filters (Needs Action, Cold Outreach, FYI, Travel, Finance, Purchases) are Shortwave-side natural-language classifiers, off unless added.

## Division of labor (this project)

Keep all deterministic sender/subject→label routing in `filters.js` → Gmail filters (portable, versioned, client-independent). Use Shortwave's layer only for what Gmail cannot express: AI classification, bundles, delivery schedules, splits. Avoid "Always Apply".

An AI filter may deliberately overlap a deterministic rule — both applying the same Gmail user label — for coverage. When configuring it, pick the Gmail label (plain tag icon, `gmail%2FLabel_<id>` URL), not the same-named built-in; the built-in categories are ignored but left to coexist.

## Automating the Shortwave web app

- SPA; settings at `/settings/labels`, `/settings/filters`, `/settings/inbox`. A "We're still importing your email" interstitial may appear — click Refresh.
- Rule-row gear icons are hover-revealed and absent from the accessibility tree: locate them by geometry in JS (element at the same row height, right of the row) and dispatch `mouseover/mousedown/mouseup/click` MouseEvents.
- The rule dialog is titled "Auto-apply rules for \<Label\>" with ALWAYS APPLY / ALWAYS REMOVE sender lists.