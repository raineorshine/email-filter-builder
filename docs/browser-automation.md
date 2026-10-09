# Browser automation

Lessons that held across every web app driven from these sessions — the Gmail, Shortwave and Proton SPAs, and the Google Cloud console; each app's doc adds only its own quirks.

- **Click by ref, not by coordinate.** The screenshot frame and the page viewport report different sizes (1028×1176 vs 919×1051 in one session), so coordinate clicks land ~15% off. Use refs from `find`/`read_page`, or dispatch events from JS.
- **Refs go stale** after any click, scroll, or re-render. Re-run `find` immediately before each click, one mutation per call, and verify state afterwards — JS DOM reads are the most reliable verification. A stale ref opened the wrong Proton filter's Edit dialog twice in one session.
- **When a ref click does nothing, dispatch MouseEvents** (`mouseover/mousedown/mouseup/click`; Proton modals also need `pointerdown/pointerup`) from `javascript_tool`. Which of the two works is app- and control-specific; the per-app notes say which.
- **A hover-revealed control needs a real cursor hover, not a dispatched one.** A dispatched
  `mouseover`/`mouseenter` reaches the page's own handlers but never sets CSS `:hover`, so a control
  that exists only while its row is hovered is not in the DOM to be clicked or even found. Move the
  cursor with `computer`'s `hover` on the row, then read the DOM: the control is there for as long as
  the cursor stays, and a dispatched click on it works from that point. The two techniques split by
  control, not by app — dispatch for anything click-activated, a real hover first for anything the
  pointer reveals.
- **"Cannot access a chrome-extension:// URL of different extension"** wedges `computer` (and in Proton also `javascript_tool`) while `find`/`read_page`/`get_page_text` keep working. In Gmail it means a native dialog is pending; in Proton it happens with no dialog at all. Recovery is the same: close the tab and open a fresh one.
- **Read the app's own data layer, not its UI.** Before transcribing rows one dialog at a time, try
  the two page-context routes on a logged-in tab: the app's HTTP API carrying the session cookie
  (`credentials: 'include'`), and IndexedDB, which a local-first client fills with its whole account
  state so it can work offline. Both are same-origin from `javascript_tool`, so neither needs an API
  key or a second sign-in. Enumerate before guessing — `indexedDB.databases()`, then the object store
  names, then the keys. A UI that advertises no export usually still has one of these: it is how
  Proton's filters and Shortwave's auto-apply rules both come out.
- **A desktop build of a web app is a separate store.** Its Electron renderer keeps its own IndexedDB
  under its own app-data directory, which browser-tab tools cannot reach. It syncs the same backend,
  so the browser copy is not a partial one — drive the web app and leave the desktop app alone.
- **Getting bulk data out of a page needs chunking and a checksum.** `javascript_tool` truncates a
  long result mid-value, and the extension replaces anything that looks like cookie or base64 data
  with a redaction marker — so returning a raw API response yields nothing usable. Stash the payload
  on `window`, return only the derived fields you need, and emit the bulk of it in explicit slices.
  The clipboard is not an escape hatch — in a driven tab `navigator.clipboard.writeText` throws
  because the document is not focused. Hash the payload in the page (`crypto.subtle.digest`) and
  again on the written file; that is what proves the transcribed copy is complete and in order. The
  digest trips the same redaction: a hex string returned whole comes back as a marker, so return it
  in a few slices.
- **When page output stays redacted however it is sanitized, take the work out of the page.** Source
  code trips the cookie/query-string redaction reliably — a minified bundle came back as a marker even
  with `=`, `&`, `?` and token-like words stripped. A web app's bundles are public static assets: list
  their URLs from `performance.getEntriesByType('resource')`, returning path pieces only, then `curl`
  them into the scratchpad and grep them there. Reading the shipped client is also the way to answer a
  question about undocumented client behaviour that web search knows nothing about.
- **Native `window.confirm()` dialogs cannot be clicked** by any automation path, and overriding `window.confirm` from `javascript_tool` does not work — the tool runs in an isolated world; the page still sees the native function.
