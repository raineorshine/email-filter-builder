/** Render functions for Sieve scripts (ProtonMail). */

const Header = `require ["include", "environment", "variables", "relational", "comparator-i;ascii-numeric", "spamtest", "fileinto", "imap4flags"];
if allof (environment :matches "vnd.proton.spam-threshold" "*", spamtest :value "ge" :comparator "i;ascii-numeric" "$\{1}") {return;}
`

const Action = ({ fileinto }) => fileinto.map(Fileinto).join('')

const Condition = ({ from, subject }) => [Subject(subject), From(from)].filter(x => x).join(', ')

const Fileinto = dest => `fileinto "${dest}";`

const From = from => from && `address :all :matches "From" "${from}"`

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
