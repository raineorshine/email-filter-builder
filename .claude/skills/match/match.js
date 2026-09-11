#!/usr/bin/env node
/**
 * Reports which entries in a filter spec match one message, and why.
 *
 * Usage: node .claude/skills/match/match.js --from <address> [--subject <text>] [--list <id>] [--filters <path>]
 *
 * Two verdicts are printed per matching entry, because two different engines run the same spec:
 *   - spec  — sieve semantics (what ProtonMail runs): `from` is a case-insensitive glob over the
 *             whole address, `subject`/`list` are case-insensitive substrings, criteria within a
 *             condition are ANDed, conditions within an entry are ORed.
 *   - gmail — the rendered Gmail query (what actually labeled the mail), matched approximately:
 *             Gmail matches whole tokens, and the renderer drops short dangling glob fragments, so
 *             a Gmail filter can match mail the sieve glob would not.
 * Queries come from src/gmail.js `Specs`, so this cannot drift from what sync.js writes.
 *
 * Entries that fire nothing are then re-examined for near misses — conditions aimed at this message
 * whose `from` no longer reaches it. A rule goes dead this way when a sender changes domain: it
 * matches nothing and reports nothing, so the mail looks simply unfiltered rather than misfiltered.
 */

const path = require('path')
const { Specs } = require(path.join(__dirname, '..', '..', '..', 'src', 'gmail'))
const { filtersFile } = require(path.join(__dirname, '..', '..', '..', 'src', 'paths'))

const arg = name => {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? null : process.argv[i + 1]
}

/** Converts a sieve :matches glob into a case-insensitive anchored regex. */
const globToRegExp = glob =>
  new RegExp(
    `^${glob
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.')}$`,
    'i',
  )

/** True if term appears in text on token boundaries, which is how Gmail matches search terms. */
const tokenMatch = (text, term) => new RegExp(`(^|[^a-z0-9])${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z0-9])`, 'i').test(text)

/** Splits a query on its top-level " OR " separators, ignoring the ones inside parentheses or a quoted phrase. A phrase can hold any character but a double quote, which the renderer refuses. */
const splitTerms = query => {
  const terms = []
  let depth = 0
  let quoted = false
  let start = 0
  for (let i = 0; i < query.length; i++) {
    if (query[i] === '"') quoted = !quoted
    else if (quoted) continue
    else if (query[i] === '(') depth++
    else if (query[i] === ')') depth--
    else if (depth === 0 && query.slice(i, i + 4) === ' OR ') {
      terms.push(query.slice(start, i))
      start = i + 4
    }
  }
  return [...terms, query.slice(start)].map(t => t.trim()).filter(x => x)
}

/** The words and quoted phrases of one criterion's value, quotes removed: `"dev+ops" example.com` is a phrase and a word. */
const words = value => [...value.matchAll(/"([^"]*)"|[^\s"]+/g)].map(([match, phrase]) => (phrase === undefined ? { text: match } : { phrase: true, text: phrase }))

/** True if one rendered Gmail term matches the message. Criteria within a term are ANDed, and so are the words of one criterion. */
const termMatches = (term, message) => {
  const criteria = [...term.matchAll(/(from|subject|list):\(((?:"[^"]*"|[^")])*)\)/g)]
  if (criteria.length === 0) return false
  return criteria.every(([, field, value]) =>
    words(value).every(({ phrase, text }) => {
      if (field === 'from') return tokenMatch(message.from, text)
      if (field === 'list') return message.list.toLowerCase().includes(text.toLowerCase())
      return phrase ? message.subject.toLowerCase().includes(text.toLowerCase()) : tokenMatch(message.subject, text)
    }),
  )
}

/** Normalizes a condition to its criteria, since a bare string condition is shorthand for a `from` glob. */
const criteriaOf = condition => (typeof condition === 'string' ? { from: condition } : condition)

/** The fileinto destinations of an entry, in order. */
const destinationsOf = filter => filter.actions.flatMap(action => action.fileinto || [])

/** Describes why one spec condition matched, or null if it did not. */
const specReason = (condition, message) => {
  const { from, list, subject } = criteriaOf(condition)
  const reasons = []
  if (from) {
    if (!globToRegExp(from).test(message.from)) return null
    reasons.push(`from ${JSON.stringify(from)} matches ${message.from}`)
  }
  if (subject) {
    if (!message.subject.toLowerCase().includes(subject.toLowerCase())) return null
    reasons.push(`subject contains ${JSON.stringify(subject)}`)
  }
  if (list) {
    if (!message.list.toLowerCase().includes(list.toLowerCase())) return null
    reasons.push(`List-Id contains ${JSON.stringify(list)}`)
  }
  return reasons.length > 0 ? reasons.join(' AND ') : null
}

/** Domain labels too common to identify a sender, so sharing one is no evidence of a sibling domain. */
const genericLabels = new Set(['app', 'co', 'com', 'e', 'email', 'info', 'io', 'mail', 'net', 'org', 'send', 'smtp', 'us', 'uk', 'www'])

/** The distinctive domain labels of an address or glob — "acme" for both "*@acme.co" and "support@mail.acme.com". */
const distinctiveLabels = address =>
  new Set(
    address
      .slice(address.lastIndexOf('@') + 1)
      .split('.')
      .map(label => label.replace(/\*/g, '').toLowerCase())
      .filter(label => label.length > 1 && !genericLabels.has(label)),
  )

/**
 * Why one condition of an entry that fired nothing still looks aimed at this message, or null if the
 * condition is simply about other mail. Both shapes mean the same thing — a `from` that no longer
 * reaches a sender the entry was written for:
 *   - stale sender   every other criterion matches and only the sender does not, so the condition
 *                    was written for exactly this mail and the address has since moved. At least one
 *                    matching criterion must be distinctive — a one-word subject fragment like
 *                    "Payment" recurs across unrelated senders and is no evidence of intent.
 *   - sibling domain the sender shares a distinctive domain label with the message but does not
 *                    match, e.g. "*@acme.co" against support@mail.acme.com.
 */
const nearMiss = (condition, message) => {
  const { from, list, subject } = criteriaOf(condition)
  if (!from || !message.from || globToRegExp(from).test(message.from)) return null
  const others = [subject && { distinctive: /\s/.test(subject.trim()), ok: message.subject.toLowerCase().includes(subject.toLowerCase()), reason: `subject contains ${JSON.stringify(subject)}` }, list && { distinctive: true, ok: message.list.toLowerCase().includes(list.toLowerCase()), reason: `List-Id contains ${JSON.stringify(list)}` }].filter(x => x)
  if (others.length > 0 && others.every(other => other.ok) && others.some(other => other.distinctive)) {
    return `stale sender    from ${JSON.stringify(from)} does not match ${message.from}, but ${others.map(other => other.reason).join(' AND ')}`
  }
  const shared = [...distinctiveLabels(from)].filter(label => distinctiveLabels(message.from).has(label))
  return shared.length > 0 ? `sibling domain  from ${JSON.stringify(from)} shares ${JSON.stringify(shared.join(' '))} with ${message.from} but does not match` : null
}

const message = { from: arg('from') || '', list: arg('list') || '', subject: arg('subject') || '' }
if (!message.from && !message.subject && !message.list) {
  console.error('Usage: node match.js --from <address> [--subject <text>] [--list <id>] [--filters <path>]')
  process.exit(1)
}

const filtersPath = filtersFile(arg('filters'))
const filters = require(filtersPath)

console.log(`Spec:    ${filtersPath} (${filters.length} entries)`)
console.log(`Message: from=${message.from || '—'} subject=${JSON.stringify(message.subject)} list=${message.list || '—'}\n`)

let matched = 0
const nearMisses = []
filters.forEach((filter, i) => {
  const specHits = filter.conditions.map(condition => ({ condition, reason: specReason(condition, message) })).filter(hit => hit.reason)
  const gmailHits = Specs(filter, Number(arg('maxQueryLength')) || undefined)
    .filter(spec => splitTerms(spec.query).some(term => termMatches(term, message)))
    .map(spec => ({ label: spec.label, query: splitTerms(spec.query).find(term => termMatches(term, message)), spec }))

  if (specHits.length === 0 && gmailHits.length === 0) {
    const reasons = [...new Set(filter.conditions.map(condition => nearMiss(condition, message)).filter(x => x))]
    if (reasons.length > 0) nearMisses.push({ i, destinations: destinationsOf(filter), reasons })
    return
  }
  matched++

  console.log(`entry[${i}] → ${destinationsOf(filter).join(', ')}`)
  specHits.forEach(hit => console.log(`  spec   ${hit.reason}${hit.condition.comment ? `  (${hit.condition.comment})` : ''}`))
  if (specHits.length === 0) console.log('  spec   NO MATCH — the live Gmail filter is broader than the sieve glob')
  const seen = new Set()
  gmailHits.forEach(hit => {
    const line = `  gmail  ${hit.query}${hit.spec.label ? ` → label ${hit.spec.label}` : ''}${hit.spec.archive ? ' + archive' : ''}${hit.spec.trash ? ' + trash' : ''}`
    if (seen.has(line)) return
    seen.add(line)
    console.log(line)
  })
  if (gmailHits.length === 0) console.log('  gmail  NO MATCH — the spec matches but the rendered query does not (check the glob translation)')
  console.log()
})

console.log(matched === 0 ? 'No entry matches. Any labels on the message came from outside filters.js.' : `${matched} matching ${matched === 1 ? 'entry' : 'entries'}.`)

if (nearMisses.length > 0) {
  console.log(`\n${nearMisses.length} near ${nearMisses.length === 1 ? 'miss' : 'misses'} — fired nothing, but written for mail like this. Check each for a sender that has moved domain:`)
  nearMisses.forEach(({ i, destinations, reasons }) => {
    console.log(`\nentry[${i}] → ${destinations.join(', ')}`)
    reasons.forEach(reason => console.log(`  ${reason}`))
  })
}
