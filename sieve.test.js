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

test('list', () => {
  const filters = [
    {
      conditions: [{ comment: 'Blockchain Community', list: 'abc123.456.list-id.mcsv.net' }],
      actions: [
        {
          fileinto: ['Blockchain Community'],
        },
      ],
    },
  ]

  expect(sieve(filters)).toBe(`require ["include", "environment", "variables", "relational", "comparator-i;ascii-numeric", "spamtest", "fileinto", "imap4flags"];
if allof (environment :matches "vnd.proton.spam-threshold" "*", spamtest :value "ge" :comparator "i;ascii-numeric" "$\{1}") {return;}
if allof (header :contains "List-Id" "abc123.456.list-id.mcsv.net"){fileinto "Blockchain Community";}`)
})

test('list combines with from and subject', () => {
  const filters = [
    {
      conditions: [{ comment: 'Digest', from: 'news@example.com', subject: 'Weekly Digest', list: 'abc123.list-id.example.com' }],
      actions: [
        {
          fileinto: ['archive'],
        },
      ],
    },
  ]

  expect(sieve(filters)).toBe(`require ["include", "environment", "variables", "relational", "comparator-i;ascii-numeric", "spamtest", "fileinto", "imap4flags"];
if allof (environment :matches "vnd.proton.spam-threshold" "*", spamtest :value "ge" :comparator "i;ascii-numeric" "$\{1}") {return;}
if allof (header :contains "Subject" "Weekly Digest", address :all :matches "From" "news@example.com", header :contains "List-Id" "abc123.list-id.example.com"){fileinto "archive";}`)
})
