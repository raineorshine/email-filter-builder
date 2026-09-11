const os = require('os')
const path = require('path')
const { configDir, credentialsFile, filtersFile, tokenFile } = require('./paths')

const home = path.join(os.homedir(), '.config', 'email-filter-builder')

test('configDir defaults to ~/.config/email-filter-builder', () => {
  expect(configDir({})).toBe(home)
})

test('configDir honors XDG_CONFIG_HOME', () => {
  expect(configDir({ XDG_CONFIG_HOME: '/xdg' })).toBe('/xdg/email-filter-builder')
})

test('configDir honors EMAIL_FILTER_BUILDER_DIR over XDG_CONFIG_HOME', () => {
  expect(configDir({ EMAIL_FILTER_BUILDER_DIR: '/custom', XDG_CONFIG_HOME: '/xdg' })).toBe('/custom')
})

test('filtersFile defaults to filters.js in the config directory', () => {
  expect(filtersFile(undefined, {})).toBe(path.join(home, 'filters.js'))
  expect(filtersFile(null, { EMAIL_FILTER_BUILDER_DIR: '/custom' })).toBe('/custom/filters.js')
})

test('filtersFile prefers FILTERS_FILE over the config directory', () => {
  expect(filtersFile(undefined, { FILTERS_FILE: '/env/spec.js', EMAIL_FILTER_BUILDER_DIR: '/custom' })).toBe('/env/spec.js')
})

test('filtersFile prefers an explicit path over FILTERS_FILE', () => {
  expect(filtersFile('/explicit/spec.js', { FILTERS_FILE: '/env/spec.js' })).toBe('/explicit/spec.js')
})

test('filtersFile resolves a relative explicit path against the cwd', () => {
  expect(filtersFile('filters.sample.js', {})).toBe(path.resolve('filters.sample.js'))
})

test('credentialsFile and tokenFile default to the config directory', () => {
  expect(credentialsFile({})).toBe(path.join(home, '.gmail-credentials.json'))
  expect(tokenFile({})).toBe(path.join(home, '.gmail-token.json'))
})

test('credentialsFile and tokenFile honor their env overrides', () => {
  const env = { GMAIL_CREDENTIALS_FILE: '/c.json', GMAIL_TOKEN_FILE: '/t.json', EMAIL_FILTER_BUILDER_DIR: '/custom' }
  expect(credentialsFile(env)).toBe('/c.json')
  expect(tokenFile(env)).toBe('/t.json')
})
