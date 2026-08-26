/** Render functions for Gmail's XML filter import format. */

/** Escapes a value for use in an XML attribute. */
const escapeXml = value => String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&apos;', '"': '&quot;' }[char]))

const Property = (name, value) => `    <apps:property name='${name}' value='${escapeXml(value)}'/>`

/** True if a fileinto destination means "move to archive" rather than a label. */
const isArchive = dest => dest.toLowerCase() === 'archive'

/** Renders a single Gmail filter entry from one condition and at most one label. */
const Entry = ({ archive, from, label, subject }) => ['  <entry>', "    <category term='filter'></category>", '    <title>Mail Filter</title>', '    <content></content>', from && Property('from', from), subject && Property('subject', subject), label && Property('label', label), archive && Property('shouldArchive', 'true'), Property('sizeOperator', 's_sl'), Property('sizeUnit', 's_smb'), '  </entry>'].filter(x => x).join('\n')

/** Expands a filter into one entry per condition, and one entry per label since Gmail applies at most one label per filter. */
const Entries = ({ actions, conditions }) => {
  const destinations = actions.flatMap(action => action.fileinto)
  const archive = destinations.some(isArchive)
  const labels = destinations.filter(dest => !isArchive(dest))

  return conditions.flatMap(condition => {
    const { from, subject } = typeof condition === 'string' ? { from: condition } : condition
    return (labels.length > 0 ? labels : [null]).map(label => Entry({ archive, from, label, subject }))
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
