const fs = require('fs')
const { gmail, sieve } = require('./index')
const sampleFilters = require('./filters.sample.js')

const readmeTemplate = fs.readFileSync('README-template.md', 'utf-8')
const sampleFiltersText = fs.readFileSync('filters.sample.js', 'utf-8')

const readme = readmeTemplate
  .replace('${filters}', () => sampleFiltersText.trim())
  .replace('${sieveOutput}', () => sieve(sampleFilters).trim())
  .replace('${gmailOutput}', () => gmail(sampleFilters, { updated: '2024-01-01T00:00:00Z' }).trim())

fs.writeFileSync('README.md', readme)
