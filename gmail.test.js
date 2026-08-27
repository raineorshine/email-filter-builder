const { gmail } = require('./index')

const updated = '2024-01-01T00:00:00Z'

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
    <apps:property name='from' value='noreply@grubhub.com'/>
    <apps:property name='subject' value='&quot;Here is your Grubhub receipt&quot;'/>
    <apps:property name='label' value='Receipts'/>
    <apps:property name='shouldArchive' value='true'/>
    <apps:property name='sizeOperator' value='s_sl'/>
    <apps:property name='sizeUnit' value='s_smb'/>
  </entry>
</feed>
`)
})

test('multiple conditions expand to one entry each', () => {
  const filters = [
    {
      conditions: [
        { comment: 'Grubhub Receipt', from: 'noreply@grubhub.com', subject: 'Grubhub' },
        { comment: 'Lyft Receipt', from: 'noreply@lyft.com', subject: 'Lyft' },
      ],
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
    <apps:property name='from' value='noreply@grubhub.com'/>
    <apps:property name='subject' value='Grubhub'/>
    <apps:property name='label' value='Receipts'/>
    <apps:property name='shouldArchive' value='true'/>
    <apps:property name='sizeOperator' value='s_sl'/>
    <apps:property name='sizeUnit' value='s_smb'/>
  </entry>
  <entry>
    <category term='filter'></category>
    <title>Mail Filter</title>
    <content></content>
    <apps:property name='from' value='noreply@lyft.com'/>
    <apps:property name='subject' value='Lyft'/>
    <apps:property name='label' value='Receipts'/>
    <apps:property name='shouldArchive' value='true'/>
    <apps:property name='sizeOperator' value='s_sl'/>
    <apps:property name='sizeUnit' value='s_smb'/>
  </entry>
</feed>
`)
})

test('multiple labels expand to one entry per label', () => {
  const filters = [
    {
      conditions: [{ from: 'noreply@grubhub.com' }],
      actions: [
        {
          fileinto: ['archive', 'Receipts', 'Food'],
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
    <apps:property name='from' value='noreply@grubhub.com'/>
    <apps:property name='label' value='Receipts'/>
    <apps:property name='shouldArchive' value='true'/>
    <apps:property name='sizeOperator' value='s_sl'/>
    <apps:property name='sizeUnit' value='s_smb'/>
  </entry>
  <entry>
    <category term='filter'></category>
    <title>Mail Filter</title>
    <content></content>
    <apps:property name='from' value='noreply@grubhub.com'/>
    <apps:property name='label' value='Food'/>
    <apps:property name='shouldArchive' value='true'/>
    <apps:property name='sizeOperator' value='s_sl'/>
    <apps:property name='sizeUnit' value='s_smb'/>
  </entry>
</feed>
`)
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

  expect(gmail(filters, { updated })).toBe(`<?xml version='1.0' encoding='UTF-8'?>
<feed xmlns='http://www.w3.org/2005/Atom' xmlns:apps='http://schemas.google.com/apps/2006'>
  <title>Mail Filters</title>
  <id>tag:mail.google.com,2008:filters:1</id>
  <updated>2024-01-01T00:00:00Z</updated>
  <entry>
    <category term='filter'></category>
    <title>Mail Filter</title>
    <content></content>
    <apps:property name='subject' value='Hi'/>
    <apps:property name='shouldArchive' value='true'/>
    <apps:property name='sizeOperator' value='s_sl'/>
    <apps:property name='sizeUnit' value='s_smb'/>
  </entry>
</feed>
`)
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

test('allow naked email condition', () => {
  const filters = [
    {
      conditions: ['noreply@lyft.com'],
      actions: [
        {
          fileinto: ['Rides'],
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
    <apps:property name='from' value='noreply@lyft.com'/>
    <apps:property name='label' value='Rides'/>
    <apps:property name='sizeOperator' value='s_sl'/>
    <apps:property name='sizeUnit' value='s_smb'/>
  </entry>
</feed>
`)
})

describe('from globs are translated to Gmail search terms', () => {
  const from = pattern => {
    const output = gmail([{ conditions: [pattern], actions: [{ fileinto: ['X'] }] }], { updated })
    return output.match(/name='from' value='([^']*)'/)[1]
  }

  test('exact address passes through', () => expect(from('no-reply@alerts-example.com')).toBe('no-reply@alerts-example.com'))
  test('*@domain', () => expect(from('*@gallery-example.com')).toBe('gallery-example.com'))
  test('*@*.domain', () => expect(from('*@*.rentals-example.com')).toBe('rentals-example.com'))
  test('local part and wildcard domain are ANDed', () => expect(from('MyRewardsPlus@*.airline-example.com')).toBe('MyRewardsPlus airline-example.com'))
  test('glob boundary on a token separator keeps whole tokens', () => expect(from('no.*@art.shop-example.com')).toBe('no art.shop-example.com'))
  test('dangling token fragment is dropped', () => expect(from('*s@email.artist-example.com')).toBe('email.artist-example.com'))
  test('trailing fragment before wildcard is dropped', () => expect(from('cloudplatform-no*@cloud-example.com')).toBe('cloudplatform cloud-example.com'))
  test('trailing wildcard', () => expect(from('jane.doe@sdk-example.*')).toBe('jane.doe@sdk-example'))
})

test('multi-word subject is quoted as a phrase', () => {
  const filters = [
    {
      conditions: [{ subject: `Where's My Package?` }],
      actions: [{ fileinto: ['Art'] }],
    },
  ]

  expect(gmail(filters, { updated })).toContain(`<apps:property name='subject' value='&quot;Where&apos;s My Package?&quot;'/>`)
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

  expect(gmail(filters, { updated })).toContain(`<apps:property name='from' value='a&amp;b@example.com'/>`)
  expect(gmail(filters, { updated })).toContain(`<apps:property name='subject' value='&quot;&lt;ready&gt; &amp; &apos;waiting&apos;&quot;'/>`)
  expect(gmail(filters, { updated })).toContain(`<apps:property name='label' value='A&amp;B'/>`)
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
