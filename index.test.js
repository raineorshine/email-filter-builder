const { addFilter } = require('./index')

test('addFilter appends a new entry and returns a new array', () => {
  const filters = [
    {
      conditions: ['noreply@lyft.com'],
      actions: [{ fileinto: ['archive'] }],
    },
  ]

  const entry = {
    conditions: ['noreply@grubhub.com'],
    actions: [{ fileinto: ['archive', 'Receipts'] }],
  }

  const result = addFilter(filters, entry)

  expect(result).toEqual([...filters, entry])
  expect(result).toHaveLength(2)
})

test('addFilter does not mutate the input', () => {
  const filters = [
    {
      conditions: ['noreply@lyft.com'],
      actions: [{ fileinto: ['archive'] }],
    },
  ]

  const entry = {
    conditions: ['noreply@grubhub.com'],
    actions: [{ fileinto: ['archive'] }],
  }

  const result = addFilter(filters, entry)

  expect(filters).toHaveLength(1)
  expect(result).not.toBe(filters)
})
