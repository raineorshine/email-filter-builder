const { sieve } = require('./index')

test('from + subject', () => {
  const filters = [
    {
      conditions: [{ comment: 'Grubhub Receipt', from: 'noreply@grubhub.com', subject: 'Here is your Grubhub receipt' }],
      actions: [
        {
          fileinto: ['archive', 'Receipts'],
        },
      ],
    },
  ]

  expect(sieve(filters)).toBe(`require ["include", "environment", "variables", "relational", "comparator-i;ascii-numeric", "spamtest", "fileinto", "imap4flags"];
if allof (environment :matches "vnd.proton.spam-threshold" "*", spamtest :value "ge" :comparator "i;ascii-numeric" "$\{1}") {return;}
if allof (header :contains "Subject" "Here is your Grubhub receipt", address :all :matches "From" "noreply@grubhub.com"){fileinto "archive";fileinto "Receipts";}`)
})

test('multiple', () => {
  const filters = [
    {
      conditions: [
        { comment: 'Grubhub Receipt', from: 'noreply@grubhub.com', subject: 'Here is your Grubhub receipt' },
        { comment: 'Lyft Receipt', from: 'noreply@lyft.com', subject: 'Here is your Lyft receipt' },
      ],
      actions: [
        {
          fileinto: ['archive', 'Receipts'],
        },
      ],
    },
  ]

  expect(sieve(filters)).toBe(`require ["include", "environment", "variables", "relational", "comparator-i;ascii-numeric", "spamtest", "fileinto", "imap4flags"];
if allof (environment :matches "vnd.proton.spam-threshold" "*", spamtest :value "ge" :comparator "i;ascii-numeric" "$\{1}") {return;}
if anyof (
  allof (header :contains "Subject" "Here is your Grubhub receipt", address :all :matches "From" "noreply@grubhub.com"),
  allof (header :contains "Subject" "Here is your Lyft receipt", address :all :matches "From" "noreply@lyft.com")
) {
  fileinto "archive";
  fileinto "Receipts";
}`)
})

test('from', () => {
  const filters = [
    {
      conditions: [{ comment: 'Lyft', from: 'noreply@lyft.com' }],
      actions: [
        {
          fileinto: ['archive'],
        },
      ],
    },
  ]

  expect(sieve(filters)).toBe(`require ["include", "environment", "variables", "relational", "comparator-i;ascii-numeric", "spamtest", "fileinto", "imap4flags"];
if allof (environment :matches "vnd.proton.spam-threshold" "*", spamtest :value "ge" :comparator "i;ascii-numeric" "$\{1}") {return;}
if allof (address :all :matches "From" "noreply@lyft.com"){fileinto "archive";}`)
})

test('subject', () => {
  const filters = [
    {
      conditions: [{ comment: 'Hello', subject: 'Hi' }],
      actions: [
        {
          fileinto: ['archive'],
        },
      ],
    },
  ]

  expect(sieve(filters)).toBe(`require ["include", "environment", "variables", "relational", "comparator-i;ascii-numeric", "spamtest", "fileinto", "imap4flags"];
if allof (environment :matches "vnd.proton.spam-threshold" "*", spamtest :value "ge" :comparator "i;ascii-numeric" "$\{1}") {return;}
if allof (header :contains "Subject" "Hi"){fileinto "archive";}`)
})

test('list', () => {
  const filters = [
    {
      conditions: [{ comment: 'Dev list', list: 'dev.example.com' }],
      actions: [
        {
          fileinto: ['Lists'],
        },
      ],
    },
  ]

  expect(sieve(filters)).toBe(`require ["include", "environment", "variables", "relational", "comparator-i;ascii-numeric", "spamtest", "fileinto", "imap4flags"];
if allof (environment :matches "vnd.proton.spam-threshold" "*", spamtest :value "ge" :comparator "i;ascii-numeric" "$\{1}") {return;}
if allof (header :contains "List-Id" "dev.example.com"){fileinto "Lists";}`)
})

test('list + from + subject', () => {
  const filters = [
    {
      conditions: [{ comment: 'Dev digest', from: 'news@example.com', list: 'dev.example.com', subject: 'Weekly' }],
      actions: [
        {
          fileinto: ['Lists'],
        },
      ],
    },
  ]

  expect(sieve(filters)).toBe(`require ["include", "environment", "variables", "relational", "comparator-i;ascii-numeric", "spamtest", "fileinto", "imap4flags"];
if allof (environment :matches "vnd.proton.spam-threshold" "*", spamtest :value "ge" :comparator "i;ascii-numeric" "$\{1}") {return;}
if allof (header :contains "Subject" "Weekly", address :all :matches "From" "news@example.com", header :contains "List-Id" "dev.example.com"){fileinto "Lists";}`)
})

test('list in a multi-condition rule', () => {
  const filters = [
    {
      conditions: [{ comment: 'Dev list', list: 'dev.example.com' }, 'news@example.com'],
      actions: [
        {
          fileinto: ['Lists'],
        },
      ],
    },
  ]

  expect(sieve(filters)).toBe(`require ["include", "environment", "variables", "relational", "comparator-i;ascii-numeric", "spamtest", "fileinto", "imap4flags"];
if allof (environment :matches "vnd.proton.spam-threshold" "*", spamtest :value "ge" :comparator "i;ascii-numeric" "$\{1}") {return;}
if anyof (
  allof (header :contains "List-Id" "dev.example.com"),
  allof (address :all :matches "From" "news@example.com")
) {
  fileinto "Lists";
}`)
})

describe('quotes and backslashes are escaped in sieve strings', () => {
  const rule = (condition, fileinto = ['Lists']) => sieve.MultiRule({ actions: [{ fileinto }], conditions: [condition] })

  test('subject', () => expect(rule({ subject: String.raw`Your "Premium" plan, saved to C:\Plans` })).toBe(String.raw`if allof (header :contains "Subject" "Your \"Premium\" plan, saved to C:\\Plans"){fileinto "Lists";}`))
  test('from glob', () => expect(rule(String.raw`"jane\doe"@*.example.com`)).toBe(String.raw`if allof (address :all :matches "From" "\"jane\\doe\"@*.example.com"){fileinto "Lists";}`))
  test('list id', () => expect(rule({ list: String.raw`"Dev\Ops" <dev.example.com>` })).toBe(String.raw`if allof (header :contains "List-Id" "\"Dev\\Ops\" <dev.example.com>"){fileinto "Lists";}`))
  test('label name', () => expect(rule('news@example.com', [String.raw`Plans\"Premium"`])).toBe(String.raw`if allof (address :all :matches "From" "news@example.com"){fileinto "Plans\\\"Premium\"";}`))

  test('every string in the script decodes back to the value in the spec', () => {
    const condition = { from: String.raw`"jane\doe"@*.example.com`, list: String.raw`"Dev\Ops" <dev.example.com>`, subject: String.raw`Your "Premium" plan, saved to C:\Plans` }
    const label = String.raw`Plans\"Premium"`
    const script = sieve.MultiRule({ actions: [{ fileinto: ['archive', label] }], conditions: [condition, 'news@example.com'] })
    // RFC 5228 §2.4.2: a quoted string ends at the first unescaped quote, and a backslash escapes the character after it.
    const strings = [...script.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map(([, text]) => text.replace(/\\(.)/g, '$1'))
    expect(strings).toEqual(['Subject', condition.subject, 'From', condition.from, 'List-Id', condition.list, 'From', 'news@example.com', 'archive', label])
  })
})

test('allow naked email condition', () => {
  const filters = [
    {
      conditions: ['noreply@lyft.com'],
      actions: [
        {
          fileinto: ['archive'],
        },
      ],
    },
  ]

  expect(sieve(filters)).toBe(`require ["include", "environment", "variables", "relational", "comparator-i;ascii-numeric", "spamtest", "fileinto", "imap4flags"];
if allof (environment :matches "vnd.proton.spam-threshold" "*", spamtest :value "ge" :comparator "i;ascii-numeric" "$\{1}") {return;}
if allof (address :all :matches "From" "noreply@lyft.com"){fileinto "archive";}`)
})
