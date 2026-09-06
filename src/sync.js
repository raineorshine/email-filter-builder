#!/usr/bin/env node
/** Syncs the Gmail filter set to match a declarative filters spec, via the Gmail API. Dry run by default; --apply performs the deletes and creates. Re-runs are idempotent: filters that already match are left untouched. */

const path = require('path')
const readline = require('readline')
const GmailApi = require('./gmail-api')
const { Sync } = require('./gmail-sync')

const args = process.argv.slice(2)
const has = flag => args.includes(`--${flag}`)
const apply = has('apply')
const filename = args.find(arg => !arg.startsWith('--')) || 'filters.js'

/** Prompts on the terminal before the first destructive run. --yes skips it; without a terminal to ask, deleting is refused rather than assumed. */
const confirm = plan => {
  if (has('yes')) return true
  if (!process.stdin.isTTY) throw new Error('Deleting filters needs a terminal to confirm, or --yes.')
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    rl.question(`\nDelete ${plan.remove.length} filter(s) and create ${plan.create.length}? [y/N] `, answer => {
      rl.close()
      resolve(/^y(es)?$/i.test(answer.trim()))
    })
  })
}

const main = async () => {
  const filters = require(path.resolve(filename))
  const api = await GmailApi()

  console.info(`Account:  ${await api.email()}`)
  console.info(`Spec:     ${path.resolve(filename)} (${filters.length} entries)\n`)

  await Sync(api, filters, { apply, confirm, verbose: has('verbose') })
}

main().catch(e => {
  console.error(`\n${e.message}`)
  process.exitCode = 1
})
