/** Reconciles an account's Gmail filters with a declarative spec. Gmail's API has no filter update, so a change is a delete plus a create; filters that already match are left untouched, making a no-op sync do zero writes. */

const gmail = require('./gmail')

/** Gmail system label ids used by the action mapping. */
const INBOX = 'INBOX'
const TRASH = 'TRASH'

/** Criteria fields of the Gmail filters API. The merged OR-query goes in `query`; the rest are matched on so a hand-made filter using them diffs correctly instead of looking empty. */
const CRITERIA_FIELDS = ['excludeChats', 'from', 'hasAttachment', 'negatedQuery', 'query', 'size', 'sizeComparison', 'subject', 'to']

/** Action fields of the Gmail filters API. */
const ACTION_FIELDS = ['addLabelIds', 'forward', 'removeLabelIds']

/** Reduces one criteria or action value to a comparable form. Label id lists are order-insensitive, and every spelling Gmail uses for "unset" — omitted, empty, false, "unspecified" — collapses to null so an omitted default never reads as a difference. */
const normalize = value => (Array.isArray(value) ? (value.length > 0 ? [...value].sort() : null) : value === 'unspecified' ? null : value || null)

/** Canonical key for a filter, so a desired filter and a live one compare equal despite key order, label order, or omitted defaults. */
const Key = ({ action = {}, criteria = {} }) => JSON.stringify([CRITERIA_FIELDS.map(field => normalize(criteria[field])), ACTION_FIELDS.map(field => normalize(action[field]))])

/** Renders the action of a Gmail API filter. There is no archive or trash flag as in the XML format: `archive` removes INBOX and `trash` adds TRASH, alongside the filter's single user label. */
const Action = ({ archive, labelId, trash }) => {
  const addLabelIds = [trash && TRASH, labelId].filter(x => x)
  return {
    ...(addLabelIds.length > 0 ? { addLabelIds } : {}),
    ...(archive ? { removeLabelIds: [INBOX] } : {}),
  }
}

/** The label names a filter set needs, in first-use order. Callers resolve these to ids (creating any that are missing) before building the desired set. */
const LabelNames = (filters, { maxQueryLength } = {}) => [
  ...new Set(
    filters
      .flatMap(filter => gmail.Specs(filter, maxQueryLength))
      .map(spec => spec.label)
      .filter(x => x),
  ),
]

/** Builds the desired set of Gmail API filters from the declarative spec, using the same OR-merging and query chunking as the XML renderer. labelIds maps each fileinto destination to its Gmail label id. */
const DesiredFilters = (filters, labelIds = {}, { maxQueryLength } = {}) =>
  filters.flatMap(filter =>
    gmail.Specs(filter, maxQueryLength).map(({ archive, label, query, trash }) => {
      if (label && !labelIds[label]) throw new Error(`No Gmail label id for "${label}"`)
      const action = Action({ archive, labelId: label && labelIds[label], trash })
      if (Object.keys(action).length === 0) throw new Error(`Filter has no actions: ${query}`)
      return { action, criteria: { query } }
    }),
  )

/** Diffs the desired filters against the live ones on normalized (criteria, action) equality. Returns the live filters to delete, the desired filters to create, and the live filters already correct. Matching is a multiset, so a filter that exists twice but is wanted once is deleted once. */
const Plan = (desired, existing) => {
  const wanted = new Map()
  for (const filter of desired) {
    const key = Key(filter)
    wanted.set(key, [...(wanted.get(key) || []), filter])
  }

  const keep = []
  const remove = []
  for (const filter of existing) {
    const matches = wanted.get(Key(filter))
    if (matches && matches.length > 0) {
      matches.shift()
      keep.push(filter)
    } else {
      remove.push(filter)
    }
  }

  return { create: [...wanted.values()].flat(), keep, remove }
}

/** Renders a filter's action as a short human phrase. */
const DescribeAction = ({ addLabelIds = [], removeLabelIds = [] }, labelNames = {}) => [...addLabelIds.map(id => (id === TRASH ? 'trash' : `+${labelNames[id] || id}`)), ...removeLabelIds.map(id => (id === INBOX ? 'skip inbox' : `-${labelNames[id] || id}`))].join(', ') || 'no action'

/** Renders a filter as one reviewable line. Long queries are truncated unless verbose, since a full set runs to hundreds of characters each. */
const Describe = ({ action = {}, criteria = {} }, labelNames, verbose) => {
  const query =
    criteria.query ||
    Object.entries(criteria)
      .map(([key, value]) => `${key}:${value}`)
      .join(' ')
  return `[${DescribeAction(action, labelNames)}] ${!verbose && query.length > 120 ? `${query.slice(0, 119)}…` : query}`
}

/** Reconciles the account's filters with the spec, creating any labels the spec files into. Returns the plan. Writes nothing unless apply is true, and asks confirm() before the first delete. */
const Sync = async (api, filters, { apply = false, confirm = async () => true, log = console.info, verbose = false } = {}) => {
  const labels = await api.listLabels()
  const labelIds = Object.fromEntries(labels.map(label => [label.name, label.id]))
  const missing = LabelNames(filters).filter(name => !labelIds[name])

  if (missing.length > 0) {
    log(`Labels to create (${missing.length}):`)
    missing.forEach(name => log(`  ${name}`))
    log('')
  }

  // A label that does not exist yet cannot be referenced by any live filter, so in a dry run a placeholder id is enough: those filters can only ever come out as creates.
  for (const name of missing) {
    labelIds[name] = apply ? (await api.createLabel(name)).id : `new-label:${name}`
    if (apply) log(`Created label ${name}`)
  }
  if (apply && missing.length > 0) log('')

  const labelNames = Object.fromEntries(Object.entries(labelIds).map(([name, id]) => [id, name]))
  const existing = await api.listFilters()
  const desired = DesiredFilters(filters, labelIds)
  const plan = Plan(desired, existing)
  const describe = filter => Describe(filter, labelNames, verbose)

  if (desired.length === 0 && existing.length > 0) throw new Error(`The spec produced no filters; refusing to delete all ${existing.length} live filters.`)

  for (const [heading, group] of [
    ['Delete', plan.remove],
    ['Create', plan.create],
  ]) {
    if (group.length === 0) continue
    log(`${heading} (${group.length}):`)
    group.forEach(filter => log(`  ${describe(filter)}`))
    log('')
  }

  log(`${existing.length} live, ${desired.length} desired: ${plan.keep.length} unchanged, ${plan.remove.length} to delete, ${plan.create.length} to create.`)

  if (plan.remove.length === 0 && plan.create.length === 0) {
    log('Already in sync. Nothing to do.')
    return plan
  }

  if (!apply) {
    log('\nDry run. Re-run with --apply to make these changes.')
    return plan
  }

  if (plan.remove.length > 0 && !(await confirm(plan))) {
    log('Aborted. No changes made.')
    return plan
  }

  // Delete before creating. An interrupted sync then leaves filters missing rather than duplicated, and a re-run converges; duplicates would both stay live, since Gmail applies every matching filter.
  log('')
  for (const [i, filter] of plan.remove.entries()) {
    await api.deleteFilter(filter.id)
    log(`Deleted ${i + 1}/${plan.remove.length}  ${describe(filter)}`)
  }

  for (const [i, filter] of plan.create.entries()) {
    await api.createFilter(filter)
    log(`Created ${i + 1}/${plan.create.length}  ${describe(filter)}`)
  }

  log(`\nDone. ${plan.remove.length} deleted, ${plan.create.length} created.`)
  return plan
}

module.exports = { Action, DescribeAction, DesiredFilters, Key, LabelNames, Plan, Sync }
