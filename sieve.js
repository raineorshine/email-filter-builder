/** Render functions for Sieve scripts (ProtonMail). */

const Header = `require ["include", "environment", "variables", "relational", "comparator-i;ascii-numeric", "spamtest", "fileinto", "imap4flags"];
if allof (environment :matches "vnd.proton.spam-threshold" "*", spamtest :value "ge" :comparator "i;ascii-numeric" "$\{1}") {return;}
`

const Action = ({ fileinto }) => fileinto.map(Fileinto).join('')

const Condition = ({ from, list, subject }) => [Subject(subject), From(from), List(list)].filter(x => x).join(', ')

const Fileinto = dest => `fileinto "${dest}";`

const From = from => from && `address :all :matches "From" "${from}"`

/** Converts a mailing list id into a List-Id header test, mirroring Gmail's `list:` operator. Sieve has no dedicated list test, so the raw header is matched. */
const List = list => list && `header :contains "List-Id" "${list}"`

const Rule = ({ actions, condition }) => `if allof (${Condition(typeof condition === 'string' ? { from: condition } : condition)}){${actions.map(Action).join('')}}`

const MultiRule = ({ actions, conditions }) => {
  if (conditions.length === 1) {
    return Rule({
      actions,
      condition: conditions[0],
    })
  }

  const conditionBlocks = conditions.map(condition => `  allof (${Condition(typeof condition === 'string' ? { from: condition } : condition)})`).join(',\n')

  const actionBlocks = actions.map(action => action.fileinto.map(dest => `  ${Fileinto(dest)}`).join('\n')).join('\n')

  return `if anyof (\n${conditionBlocks}\n) {\n${actionBlocks}\n}`
}

const Sieve = filters => `${Header}${filters.map(MultiRule).join('\n')}`

const Subject = subject => subject && `header :contains "Subject" "${subject}"`

module.exports = Sieve
module.exports.Header = Header
module.exports.MultiRule = MultiRule
