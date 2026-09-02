const { gmail } = require('./index')

const updated = '2024-01-01T00:00:00Z'

/** Extracts the hasTheWord query of each entry in the rendered XML. */
const queries = output => [...output.matchAll(/name='hasTheWord' value='([^']*)'/g)].map(match => match[1])

test('from + subject with archive and label', () => {
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

  expect(gmail(filters, { updated })).toBe(`<?xml version='1.0' encoding='UTF-8'?>
<feed xmlns='http://www.w3.org/2005/Atom' xmlns:apps='http://schemas.google.com/apps/2006'>
  <title>Mail Filters</title>
  <id>tag:mail.google.com,2008:filters:1</id>
  <updated>2024-01-01T00:00:00Z</updated>
  <entry>
    <category term='filter'></category>
    <title>Mail Filter</title>
    <content></content>
    <apps:property name='hasTheWord' value='(from:(noreply@grubhub.com) subject:(&quot;Here is your Grubhub receipt&quot;))'/>
    <apps:property name='label' value='Receipts'/>
    <apps:property name='shouldArchive' value='true'/>
    <apps:property name='sizeOperator' value='s_sl'/>
    <apps:property name='sizeUnit' value='s_smb'/>
  </entry>
</feed>
`)
})

test('conditions with the same actions are merged into one filter with OR', () => {
  const filters = [
    {
      conditions: [{ comment: 'Grubhub Receipt', from: 'noreply@grubhub.com', subject: 'Grubhub' }, { comment: 'Lyft Receipt', from: 'noreply@lyft.com', subject: 'Lyft' }, 'noreply@uber.com'],
      actions: [
        {
          fileinto: ['archive', 'Receipts'],
        },
      ],
    },
  ]

  const output = gmail(filters, { updated })
  expect(queries(output)).toEqual(['(from:(noreply@grubhub.com) subject:(Grubhub)) OR (from:(noreply@lyft.com) subject:(Lyft)) OR from:(noreply@uber.com)'])
  expect(output.match(/<entry>/g)).toHaveLength(1)
  expect(output).toContain(`<apps:property name='label' value='Receipts'/>`)
  expect(output).toContain(`<apps:property name='shouldArchive' value='true'/>`)
})

test('long queries are chunked across multiple filters', () => {
  const filters = [
    {
      conditions: ['noreply@grubhub.com', 'noreply@lyft.com', 'noreply@uber.com'],
      actions: [{ fileinto: ['Receipts'] }],
    },
  ]

  const output = gmail(filters, { maxQueryLength: 55, updated })
  expect(queries(output)).toEqual(['from:(noreply@grubhub.com) OR from:(noreply@lyft.com)', 'from:(noreply@uber.com)'])
  expect(output.match(/name='label' value='Receipts'/g)).toHaveLength(2)
})

test('a single term longer than maxQueryLength still gets its own filter', () => {
  const filters = [
    {
      conditions: ['a-very-long-address@a-very-long-domain-name.example.com'],
      actions: [{ fileinto: ['X'] }],
    },
  ]

  expect(queries(gmail(filters, { maxQueryLength: 10, updated }))).toEqual(['from:(a-very-long-address@a-very-long-domain-name.example.com)'])
})

test('multiple labels expand to one entry per label with the same merged query', () => {
  const filters = [
    {
      conditions: ['noreply@grubhub.com', 'noreply@lyft.com'],
      actions: [
        {
          fileinto: ['archive', 'Receipts', 'Food'],
        },
      ],
    },
  ]

  const output = gmail(filters, { updated })
  expect(queries(output)).toEqual(['from:(noreply@grubhub.com) OR from:(noreply@lyft.com)', 'from:(noreply@grubhub.com) OR from:(noreply@lyft.com)'])
  expect(output).toContain(`<apps:property name='label' value='Receipts'/>`)
  expect(output).toContain(`<apps:property name='label' value='Food'/>`)
  expect(output.match(/name='shouldArchive'/g)).toHaveLength(2)
})

test('archive only', () => {
  const filters = [
    {
      conditions: [{ subject: 'Hi' }],
      actions: [
        {
          fileinto: ['archive'],
        },
      ],
    },
  ]

  const output = gmail(filters, { updated })
  expect(queries(output)).toEqual(['subject:(Hi)'])
  expect(output).toContain(`<apps:property name='shouldArchive' value='true'/>`)
  expect(output).not.toContain(`name='label'`)
})

test('trash maps to shouldTrash, not a label', () => {
  const filters = [
    {
      conditions: [{ from: 'spam@example.com' }],
      actions: [
        {
          fileinto: ['trash'],
        },
      ],
    },
  ]

  const output = gmail(filters, { updated })
  expect(output).toContain(`<apps:property name='shouldTrash' value='true'/>`)
  expect(output).not.toContain(`name='label'`)
})

test('trash combines with labels', () => {
  const filters = [
    {
      conditions: [{ from: 'noreply@example.com' }],
      actions: [
        {
          fileinto: ['Events', 'trash'],
        },
      ],
    },
  ]

  const output = gmail(filters, { updated })
  expect(output).toContain(`<apps:property name='label' value='Events'/>`)
  expect(output).toContain(`<apps:property name='shouldTrash' value='true'/>`)
})

describe('from globs are translated to Gmail search terms', () => {
  const from = pattern => queries(gmail([{ conditions: [pattern], actions: [{ fileinto: ['X'] }] }], { updated }))[0]

  test('exact address passes through', () => expect(from('no-reply@alerts-example.com')).toBe('from:(no-reply@alerts-example.com)'))
  test('*@domain', () => expect(from('*@gallery-example.com')).toBe('from:(gallery-example.com)'))
  test('*@*.domain', () => expect(from('*@*.rentals-example.com')).toBe('from:(rentals-example.com)'))
  test('local part and wildcard domain are ANDed', () => expect(from('MyRewardsPlus@*.airline-example.com')).toBe('from:(MyRewardsPlus airline-example.com)'))
  test('glob boundary on a token separator keeps whole tokens', () => expect(from('no.*@art.shop-example.com')).toBe('from:(no art.shop-example.com)'))
  test('short dangling token fragment is dropped', () => expect(from('*s@email.artist-example.com')).toBe('from:(email.artist-example.com)'))
  test('short trailing fragment before wildcard is dropped', () => expect(from('cloudplatform-no*@cloud-example.com')).toBe('from:(cloudplatform cloud-example.com)'))
  test('long dangling fragment is kept so the term stays specific', () => expect(from('*@*memberrewards-example.com')).toBe('from:(memberrewards-example.com)'))
  test('long fragment before wildcard is kept so the term stays specific', () => expect(from('*@promoalerts*.com')).toBe('from:(promoalerts com)'))
  test('trailing wildcard', () => expect(from('jane.doe@sdk-example.*')).toBe('from:(jane.doe@sdk-example)'))
})

test('multi-word subject is quoted as a phrase', () => {
  const filters = [
    {
      conditions: [{ subject: `Where's My Package?` }],
      actions: [{ fileinto: ['Art'] }],
    },
  ]

  expect(gmail(filters, { updated })).toContain(`<apps:property name='hasTheWord' value='subject:(&quot;Where&apos;s My Package?&quot;)'/>`)
})

test('escapes XML special characters', () => {
  const filters = [
    {
      conditions: [{ from: 'a&b@example.com', subject: `<ready> & 'waiting'` }],
      actions: [
        {
          fileinto: ['A&B'],
        },
      ],
    },
  ]

  const output = gmail(filters, { updated })
  expect(output).toContain(`<apps:property name='hasTheWord' value='(from:(a&amp;b@example.com) subject:(&quot;&lt;ready&gt; &amp; &apos;waiting&apos;&quot;))'/>`)
  expect(output).toContain(`<apps:property name='label' value='A&amp;B'/>`)
})

test('updated defaults to the current time', () => {
  const filters = [
    {
      conditions: ['noreply@lyft.com'],
      actions: [{ fileinto: ['Rides'] }],
    },
  ]

  expect(gmail(filters)).toMatch(/<updated>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z<\/updated>/)
})

test('list maps to the list: operator', () => {
  const filters = [
    {
      conditions: [{ comment: 'Blockchain Community', list: 'abc123.456.list-id.mcsv.net' }],
      actions: [{ fileinto: ['Blockchain Community'] }],
    },
  ]

  const output = gmail(filters, { updated })
  expect(queries(output)).toEqual(['list:(abc123.456.list-id.mcsv.net)'])
  expect(output).toContain(`<apps:property name='label' value='Blockchain Community'/>`)
})

test('list is ANDed with from and subject inside one parenthesized term', () => {
  const filters = [
    {
      conditions: [{ from: 'news@example.com', subject: 'Weekly Digest', list: 'abc123.list-id.example.com' }],
      actions: [{ fileinto: ['archive'] }],
    },
  ]

  expect(queries(gmail(filters, { updated }))).toEqual(['(from:(news@example.com) subject:(&quot;Weekly Digest&quot;) list:(abc123.list-id.example.com))'])
})
