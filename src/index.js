const path = require('path')
const gmail = require('./gmail')
const sieve = require('./sieve')

/** Directory the generated filter files are written to, at the repo root rather than beside the source. */
const outDir = path.join(__dirname, '..', 'out')

/** Returns a new filters array with entry appended. Does not mutate the input. */
const addFilter = (filters, entry) => [...filters, entry]

module.exports = { addFilter, gmail, outDir, sieve }
