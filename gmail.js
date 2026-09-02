/** Render functions for Gmail's XML filter import format. */

/** Max characters of merged search terms per filter. Gmail has no documented query length limit, but very long queries can silently fail to match, so queries are chunked conservatively across multiple filters. */
const DEFAULT_MAX_QUERY_LENGTH = 600

/** Escapes a value for use in an XML attribute. */
const escapeXml = value => String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&apos;', '"': '&quot;' }[char]))

const Property = (name, value) => `    <apps:property name='${name}' value='${escapeXml(value)}'/>`

/** True if a fileinto destination means "move to archive" rather than a label. */
const isArchive = dest => dest.toLowerCase() === 'archive'

/** True if a fileinto destination means "move to trash" rather than a label. */
const isTrash = dest => dest.toLowerCase() === 'trash'

/** Converts one glob piece (the text between wildcards) into Gmail search terms. Gmail matches whole tokens, so a short fragment left dangling by an adjacent wildcard (the "s" of "*s@example.com") is dropped as glob noise. A longer dangling fragment is kept: it is usually the distinctive part of the pattern, and while keeping it risks missing some variants, dropping it risks matching far too much (e.g. "*@promoalerts*.com" must not collapse to "com"). */
const FromPiece = (piece, i, pieces) => {
  const leftFragment = i > 0 ? (piece.match(/^[a-z0-9]+/i) || [''])[0] : ''
  const left = leftFragment && leftFragment.length <= 3 ? piece.slice(leftFragment.length) : piece
  const rightFragment = i < pieces.length - 1 ? (left.match(/[a-z0-9]+$/i) || [''])[0] : ''
  const right = rightFragment && rightFragment.length <= 3 ? left.slice(0, left.length - rightFragment.length) : left
  return right.replace(/^[.@_+-]+|[.@_+-]+$/g, '')
}

/** Converts a sieve :matches glob (e.g. "*@*.example.com") into an equivalent Gmail from expression. Gmail matches addresses by token sequence, so each glob piece becomes a search term and the terms are ANDed. Exact addresses pass through unchanged. */
const From = from =>
  from
    .split('*')
    .map(FromPiece)
    .filter(x => x)
    .join(' ')

/** Converts a sieve :contains subject into a Gmail subject expression. Multi-word subjects are quoted so Gmail matches the phrase rather than the words in any order. */
const Subject = subject => (/\s/.test(subject) ? `"${subject}"` : subject)

/** Renders a single condition as a Gmail search term. Criteria are ANDed, and a term with more than one is parenthesized so it survives OR-merging with other terms. */
const Term = condition => {
  const { from, list, subject } = typeof condition === 'string' ? { from: condition } : condition
  const fromQuery = from && From(from)
  const subjectQuery = subject && Subject(subject)
  const parts = [fromQuery && `from:(${fromQuery})`, subjectQuery && `subject:(${subjectQuery})`, list && `list:(${list})`].filter(x => x)
  return parts.length > 1 ? `(${parts.join(' ')})` : parts[0] || null
}

/** Greedily packs terms into OR queries of at most maxQueryLength characters. A single term longer than the limit still gets its own query, since a term cannot be split. */
const chunkTerms = (terms, maxQueryLength) => {
  const queries = []
  let current = ''
  for (const term of terms) {
    const next = current ? `${current} OR ${term}` : term
    if (current && next.length > maxQueryLength) {
      queries.push(current)
      current = term
    } else {
      current = next
    }
  }
  return current ? [...queries, current] : queries
}

/** Renders a single Gmail filter entry from a merged query and at most one label. */
const Entry = ({ archive, label, query, trash }) => ['  <entry>', "    <category term='filter'></category>", '    <title>Mail Filter</title>', '    <content></content>', Property('hasTheWord', query), label && Property('label', label), archive && Property('shouldArchive', 'true'), trash && Property('shouldTrash', 'true'), Property('sizeOperator', 's_sl'), Property('sizeUnit', 's_smb'), '  </entry>'].filter(x => x).join('\n')

/** Expands one filter into Gmail entries: conditions are OR-merged into as few queries as possible, then one entry is emitted per query per label since Gmail applies at most one label per filter. */
const Entries = ({ actions, conditions }, maxQueryLength) => {
  const destinations = actions.flatMap(action => action.fileinto)
  const archive = destinations.some(isArchive)
  const trash = destinations.some(isTrash)
  const labels = destinations.filter(dest => !isArchive(dest) && !isTrash(dest))

  const terms = conditions.map(Term).filter(x => x)
  const queries = chunkTerms(terms, maxQueryLength)

  return queries.flatMap(query => (labels.length > 0 ? labels : [null]).map(label => Entry({ archive, label, query, trash })))
}

/** Generates a Gmail filter import file (Gmail → Settings → Filters and Blocked Addresses → Import filters). */
const Gmail = (filters, { maxQueryLength = DEFAULT_MAX_QUERY_LENGTH, updated = new Date().toISOString().replace(/\.\d+Z$/, 'Z') } = {}) => `<?xml version='1.0' encoding='UTF-8'?>
<feed xmlns='http://www.w3.org/2005/Atom' xmlns:apps='http://schemas.google.com/apps/2006'>
  <title>Mail Filters</title>
  <id>tag:mail.google.com,2008:filters:1</id>
  <updated>${updated}</updated>
${filters.flatMap(filter => Entries(filter, maxQueryLength)).join('\n')}
</feed>
`

module.exports = Gmail
