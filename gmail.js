/** Render functions for Gmail's XML filter import format. */

/** Escapes a value for use in an XML attribute. */
const escapeXml = value => String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&apos;', '"': '&quot;' }[char]))

const Property = (name, value) => `    <apps:property name='${name}' value='${escapeXml(value)}'/>`

/** True if a fileinto destination means "move to archive" rather than a label. */
const isArchive = dest => dest.toLowerCase() === 'archive'

/** True if a fileinto destination means "move to trash" rather than a label. */
const isTrash = dest => dest.toLowerCase() === 'trash'

/** Converts one glob piece (the text between wildcards) into Gmail search terms. Since Gmail matches whole tokens, a fragment left dangling by an adjacent wildcard (e.g. the "s" of "*s@example.com") cannot be matched and is dropped. */
const FromPiece = (piece, i, pieces) => {
  const left = i > 0 && /^[a-z0-9]/i.test(piece) ? piece.replace(/^[^.@_+-]*[.@_+-]?/, '') : piece
  const right = i < pieces.length - 1 && /[a-z0-9]$/i.test(left) ? left.replace(/[.@_+-]?[^.@_+-]*$/, '') : left
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

/** Renders a single Gmail filter entry from one condition and at most one label. */
const Entry = ({ archive, from, label, subject, trash }) => ['  <entry>', "    <category term='filter'></category>", '    <title>Mail Filter</title>', '    <content></content>', from && Property('from', From(from)), subject && Property('subject', Subject(subject)), label && Property('label', label), archive && Property('shouldArchive', 'true'), trash && Property('shouldTrash', 'true'), Property('sizeOperator', 's_sl'), Property('sizeUnit', 's_smb'), '  </entry>'].filter(x => x).join('\n')

/** Expands a filter into one entry per condition, and one entry per label since Gmail applies at most one label per filter. */
const Entries = ({ actions, conditions }) => {
  const destinations = actions.flatMap(action => action.fileinto)
  const archive = destinations.some(isArchive)
  const trash = destinations.some(isTrash)
  const labels = destinations.filter(dest => !isArchive(dest) && !isTrash(dest))

  return conditions.flatMap(condition => {
    const { from, subject } = typeof condition === 'string' ? { from: condition } : condition
    return (labels.length > 0 ? labels : [null]).map(label => Entry({ archive, from, label, subject, trash }))
  })
}

/** Generates a Gmail filter import file (Gmail → Settings → Filters and Blocked Addresses → Import filters). */
const Gmail = (filters, { updated = new Date().toISOString().replace(/\.\d+Z$/, 'Z') } = {}) => `<?xml version='1.0' encoding='UTF-8'?>
<feed xmlns='http://www.w3.org/2005/Atom' xmlns:apps='http://schemas.google.com/apps/2006'>
  <title>Mail Filters</title>
  <id>tag:mail.google.com,2008:filters:1</id>
  <updated>${updated}</updated>
${filters.flatMap(Entries).join('\n')}
</feed>
`

module.exports = Gmail
