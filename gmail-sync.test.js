const { DesiredFilters, Key, LabelNames, Plan, Sync } = require('./gmail-sync')

const labelIds = { Lists: 'Label_3', Food: 'Label_2', Purchases: 'Label_1' }

/** Builds a one-entry spec with the given conditions and fileinto destinations. */
const spec = (conditions, fileinto) => [{ actions: [{ fileinto }], conditions }]

describe('DesiredFilters', () => {
  test('from + subject with archive and label', () => {
    expect(DesiredFilters(spec([{ comment: 'Grubhub Receipt', from: 'noreply@grubhub.com', subject: 'Here is your Grubhub receipt' }], ['archive', 'Purchases']), labelIds)).toEqual([
      {
        action: { addLabelIds: ['Label_1'], removeLabelIds: ['INBOX'] },
        criteria: { query: '(from:(noreply@grubhub.com) subject:("Here is your Grubhub receipt"))' },
      },
    ])
  })

  test('archive maps to removing INBOX, with no label', () => {
    expect(DesiredFilters(spec([{ subject: 'Hi' }], ['archive']), labelIds)).toEqual([{ action: { removeLabelIds: ['INBOX'] }, criteria: { query: 'subject:(Hi)' } }])
  })

  test('trash maps to adding TRASH, not a label', () => {
    expect(DesiredFilters(spec(['spam@example.com'], ['trash']), labelIds)).toEqual([{ action: { addLabelIds: ['TRASH'] }, criteria: { query: 'from:(spam@example.com)' } }])
  })

  test('trash combines with a label', () => {
    expect(DesiredFilters(spec(['noreply@example.com'], ['Food', 'trash']), labelIds)[0].action).toEqual({ addLabelIds: ['TRASH', 'Label_2'] })
  })

  test('conditions sharing actions are OR-merged into one filter', () => {
    const filters = DesiredFilters(spec(['noreply@grubhub.com', 'noreply@lyft.com'], ['Purchases']), labelIds)
    expect(filters).toHaveLength(1)
    expect(filters[0].criteria.query).toBe('from:(noreply@grubhub.com) OR from:(noreply@lyft.com)')
  })

  test('multiple labels expand to one filter per label with the same query', () => {
    const filters = DesiredFilters(spec(['noreply@grubhub.com'], ['archive', 'Purchases', 'Food']), labelIds)
    expect(filters.map(filter => filter.action.addLabelIds)).toEqual([['Label_1'], ['Label_2']])
    expect(new Set(filters.map(filter => filter.criteria.query)).size).toBe(1)
  })

  test('long queries are chunked across multiple filters', () => {
    const filters = DesiredFilters(spec(['noreply@grubhub.com', 'noreply@lyft.com', 'noreply@uber.com'], ['Purchases']), labelIds, { maxQueryLength: 55 })
    expect(filters.map(filter => filter.criteria.query)).toEqual(['from:(noreply@grubhub.com) OR from:(noreply@lyft.com)', 'from:(noreply@uber.com)'])
  })

  test('a list condition goes in the query as Gmail list:', () => {
    expect(DesiredFilters(spec([{ list: 'abc.123.list-id.mcsv.net' }], ['Lists']), labelIds)[0].criteria).toEqual({ query: 'list:(abc.123.list-id.mcsv.net)' })
  })

  test('a list condition ANDs with from and subject', () => {
    expect(DesiredFilters(spec([{ from: 'news@example.com', list: 'abc.list-id.mcsv.net', subject: 'Weekly' }], ['Lists']), labelIds)[0].criteria.query).toBe('(from:(news@example.com) subject:(Weekly) list:(abc.list-id.mcsv.net))')
  })

  test('throws on a label with no Gmail id rather than creating an actionless filter', () => {
    expect(() => DesiredFilters(spec(['a@example.com'], ['Unknown']), labelIds)).toThrow('No Gmail label id for "Unknown"')
  })

  test('throws on a filter with no destinations', () => {
    expect(() => DesiredFilters(spec(['a@example.com'], []), labelIds)).toThrow('no actions')
  })
})

describe('LabelNames', () => {
  test('collects label destinations, deduped, excluding archive and trash', () => {
    const filters = [...spec(['a@example.com'], ['archive', 'Purchases']), ...spec(['b@example.com'], ['trash', 'Purchases', 'Food'])]
    expect(LabelNames(filters)).toEqual(['Purchases', 'Food'])
  })
})

describe('Plan', () => {
  const live = (id, query, action) => ({ action, criteria: { query }, id })

  test('an already-synced account plans zero writes', () => {
    const desired = DesiredFilters(spec(['a@example.com'], ['archive', 'Purchases']), labelIds)
    const existing = [live('1', 'from:(a@example.com)', { addLabelIds: ['Label_1'], removeLabelIds: ['INBOX'] })]
    expect(Plan(desired, existing)).toEqual({ create: [], keep: existing, remove: [] })
  })

  test('an edited condition is a delete plus a create, since the API has no update', () => {
    const desired = DesiredFilters(spec(['b@example.com'], ['Purchases']), labelIds)
    const existing = [live('1', 'from:(a@example.com)', { addLabelIds: ['Label_1'] })]
    const plan = Plan(desired, existing)
    expect(plan.remove).toEqual(existing)
    expect(plan.create).toEqual(desired)
    expect(plan.keep).toEqual([])
  })

  test('a changed action on the same query is a delete plus a create', () => {
    const desired = DesiredFilters(spec(['a@example.com'], ['Food']), labelIds)
    const existing = [live('1', 'from:(a@example.com)', { addLabelIds: ['Label_1'] })]
    expect(Plan(desired, existing).remove).toHaveLength(1)
    expect(Plan(desired, existing).create).toHaveLength(1)
  })

  test('a live filter the spec does not describe is deleted', () => {
    const existing = [live('1', 'from:(a@example.com)', { addLabelIds: ['Label_1'] }), live('2', 'list:(abc.list-id.mcsv.net)', { addLabelIds: ['Label_3'] })]
    const plan = Plan(DesiredFilters(spec(['a@example.com'], ['Purchases']), labelIds), existing)
    expect(plan.remove.map(filter => filter.id)).toEqual(['2'])
    expect(plan.keep.map(filter => filter.id)).toEqual(['1'])
  })

  test('duplicate live filters are deleted down to the desired count', () => {
    const desired = DesiredFilters(spec(['a@example.com'], ['Purchases']), labelIds)
    const existing = [live('1', 'from:(a@example.com)', { addLabelIds: ['Label_1'] }), live('2', 'from:(a@example.com)', { addLabelIds: ['Label_1'] })]
    const plan = Plan(desired, existing)
    expect(plan.keep.map(filter => filter.id)).toEqual(['1'])
    expect(plan.remove.map(filter => filter.id)).toEqual(['2'])
    expect(plan.create).toEqual([])
  })

  test('label order does not affect equality', () => {
    expect(Key({ action: { addLabelIds: ['TRASH', 'Label_2'] } })).toBe(Key({ action: { addLabelIds: ['Label_2', 'TRASH'] } }))
  })

  test("Gmail's spellings of an unset field do not read as a difference", () => {
    expect(Key({ action: { addLabelIds: ['Label_1'], removeLabelIds: [] }, criteria: { hasAttachment: false, query: 'x', sizeComparison: 'unspecified' } })).toBe(Key({ action: { addLabelIds: ['Label_1'] }, criteria: { query: 'x' } }))
  })

  test('fields the API returns but the spec never sets are ignored', () => {
    expect(Key({ action: { addLabelIds: ['Label_1'] }, criteria: { query: 'x' }, id: 'abc' })).toBe(Key({ action: { addLabelIds: ['Label_1'] }, criteria: { query: 'x' }, id: 'xyz' }))
  })

  test('hand-made criteria outside query are compared, not ignored', () => {
    const existing = [live('1', undefined, { addLabelIds: ['Label_1'] }), live('2', undefined, { addLabelIds: ['Label_1'] })]
    existing[0].criteria = { from: 'a@example.com' }
    existing[1].criteria = { from: 'b@example.com' }
    expect(Key(existing[0])).not.toBe(Key(existing[1]))
    expect(Plan([], existing).remove).toHaveLength(2)
  })
})

/** In-memory stand-in for the Gmail API that records its writes, so a sync can be asserted on without the network. */
const FakeApi = (filters = [], labels = []) => {
  const state = { created: [], deleted: [], filters: [...filters], labels: [...labels], writes: [] }
  return {
    createFilter: async filter => {
      state.created.push(filter)
      state.writes.push('create')
    },
    createLabel: async name => {
      const label = { id: `Label_${state.labels.length}`, name }
      state.labels.push(label)
      return label
    },
    deleteFilter: async id => {
      state.deleted.push(id)
      state.writes.push('delete')
    },
    listFilters: async () => state.filters,
    listLabels: async () => state.labels,
    state,
  }
}

describe('Sync', () => {
  const labels = [{ id: 'Label_1', name: 'Purchases' }]
  const options = { apply: true, log: () => {} }
  const stale = { action: { addLabelIds: ['Label_1'] }, criteria: { query: 'from:(old@example.com)' }, id: 'stale' }

  test('a dry run reports the plan but writes nothing', async () => {
    const api = FakeApi([stale], labels)
    const plan = await Sync(api, spec(['new@example.com'], ['Purchases']), { log: () => {} })
    expect(plan.remove).toHaveLength(1)
    expect(plan.create).toHaveLength(1)
    expect(api.state.writes).toEqual([])
  })

  test('an already-synced account writes nothing even with --apply', async () => {
    const api = FakeApi([{ action: { addLabelIds: ['Label_1'] }, criteria: { query: 'from:(a@example.com)' }, id: 'x' }], labels)
    await Sync(api, spec(['a@example.com'], ['Purchases']), options)
    expect(api.state.writes).toEqual([])
  })

  test('deletes run before creates, so an interrupted sync cannot leave duplicates', async () => {
    const api = FakeApi([stale], labels)
    await Sync(api, spec(['new@example.com'], ['Purchases']), options)
    expect(api.state.writes).toEqual(['delete', 'create'])
    expect(api.state.deleted).toEqual(['stale'])
    expect(api.state.created).toEqual([{ action: { addLabelIds: ['Label_1'] }, criteria: { query: 'from:(new@example.com)' } }])
  })

  test('a live filter the spec does not describe is deleted', async () => {
    const api = FakeApi([stale, { action: { addLabelIds: ['Label_1'] }, criteria: { from: 'handmade@example.com' }, id: 'handmade' }], labels)
    await Sync(api, spec(['old@example.com'], ['Purchases']), options)
    expect(api.state.deleted).toEqual(['handmade'])
  })

  test('a missing label is created and its new id used', async () => {
    const api = FakeApi([], labels)
    await Sync(api, spec(['a@example.com'], ['Newsletters']), options)
    expect(api.state.labels.map(label => label.name)).toEqual(['Purchases', 'Newsletters'])
    expect(api.state.created[0].action.addLabelIds).toEqual(['Label_1'])
  })

  test('a dry run does not create labels', async () => {
    const api = FakeApi([], labels)
    const plan = await Sync(api, spec(['a@example.com'], ['Newsletters']), { log: () => {} })
    expect(api.state.labels).toHaveLength(1)
    expect(plan.create[0].action.addLabelIds).toEqual(['new-label:Newsletters'])
  })

  test('declining the confirmation aborts before any write', async () => {
    const api = FakeApi([stale], labels)
    await Sync(api, spec(['new@example.com'], ['Purchases']), { ...options, confirm: async () => false })
    expect(api.state.writes).toEqual([])
  })

  test('creates with no deletes are not gated on the confirmation', async () => {
    const api = FakeApi([], labels)
    await Sync(api, spec(['a@example.com'], ['Purchases']), { ...options, confirm: async () => false })
    expect(api.state.writes).toEqual(['create'])
  })

  test('an empty spec refuses to wipe a non-empty account', async () => {
    const api = FakeApi([stale], labels)
    await expect(Sync(api, [], options)).rejects.toThrow('refusing to delete all 1 live filters')
    expect(api.state.writes).toEqual([])
  })
})
