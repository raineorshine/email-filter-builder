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
 */

const { execSync } = require('child_process')
const path = require('path')
const { Specs } = require(path.join(__dirname, '..', '..', '..', 'src', 'gmail'))

const arg = name => {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? null : process.argv[i + 1]
}

/** Absolute path of the main checkout, where the gitignored filters.js lives. */
const mainCheckout = () => path.dirname(execSync('git rev-parse --path-format=absolute --git-common-dir').toString().trim())

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

/** Splits a query on its top-level " OR " separators, ignoring the ones inside parentheses. */
const splitTerms = query => {
  const terms = []
  let depth = 0
  let start = 0
  for (let i = 0; i < query.length; i++) {
    if (query[i] === '(') depth++
    else if (query[i] === ')') depth--
    else if (depth === 0 && query.slice(i, i + 4) === ' OR ') {
      terms.push(query.slice(start, i))
      start = i + 4
    }
  }
  return [...terms, query.slice(start)].map(t => t.trim()).filter(x => x)
}

/** True if one rendered Gmail term matches the message. Criteria within a term are ANDed. */
const termMatches = (term, message) => {
  const criteria = [...term.matchAll(/(from|subject|list):\(([^)]*)\)/g)]
  if (criteria.length === 0) return false
  return criteria.every(([, field, value]) => {
    if (field === 'from') return value.split(/\s+/).every(word => tokenMatch(message.from, word))
    if (field === 'list') return message.list.toLowerCase().includes(value.toLowerCase())
    const phrase = value.match(/^"(.*)"$/)
    return phrase ? message.subject.toLowerCase().includes(phrase[1].toLowerCase()) : tokenMatch(message.subject, value)
  })
}

/** Describes why one spec condition matched, or null if it did not. */
const specReason = (condition, message) => {
  const { from, list, subject } = typeof condition === 'string' ? { from: condition } : condition
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

const message = { from: arg('from') || '', list: arg('list') || '', subject: arg('subject') || '' }
if (!message.from && !message.subject && !message.list) {
  console.error('Usage: node match.js --from <address> [--subject <text>] [--list <id>] [--filters <path>]')
  process.exit(1)
}

const filtersPath = path.resolve(arg('filters') || path.join(mainCheckout(), 'filters.js'))
const filters = require(filtersPath)

console.log(`Spec:    ${filtersPath} (${filters.length} entries)`)
console.log(`Message: from=${message.from || '—'} subject=${JSON.stringify(message.subject)} list=${message.list || '—'}\n`)

let matched = 0
filters.forEach((filter, i) => {
  const specHits = filter.conditions.map(condition => ({ condition, reason: specReason(condition, message) })).filter(hit => hit.reason)
  const gmailHits = Specs(filter, Number(arg('maxQueryLength')) || undefined)
    .filter(spec => splitTerms(spec.query).some(term => termMatches(term, message)))
    .map(spec => ({ label: spec.label, query: splitTerms(spec.query).find(term => termMatches(term, message)), spec }))

  if (specHits.length === 0 && gmailHits.length === 0) return
  matched++

  const destinations = filter.actions.flatMap(action => action.fileinto)
  console.log(`entry[${i}] → ${destinations.join(', ')}`)
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
