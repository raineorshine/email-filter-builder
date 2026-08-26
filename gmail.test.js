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
    <apps:property name='subject' value='Here is your Grubhub receipt'/>
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
    <apps:property name='subject' value='Here is your Grubhub receipt'/>
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
    <apps:property name='subject' value='Here is your Lyft receipt'/>
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

test('escapes XML special characters', () => {
  const filters = [
    {
      conditions: [{ from: 'a&b@example.com', subject: `"Order" <ready> & 'waiting'` }],
      actions: [
        {
          fileinto: ['A&B'],
        },
      ],
    },
  ]

  expect(gmail(filters, { updated })).toContain(`<apps:property name='from' value='a&amp;b@example.com'/>`)
  expect(gmail(filters, { updated })).toContain(`<apps:property name='subject' value='&quot;Order&quot; &lt;ready&gt; &amp; &apos;waiting&apos;'/>`)
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
