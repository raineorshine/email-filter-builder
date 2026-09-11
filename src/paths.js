/** Default locations of the personal files — the filter spec and the Gmail OAuth credentials and token. They live in a per-user config directory rather than a git checkout, so every worktree and clone shares one copy. */

const os = require('os')
const path = require('path')

/** The config directory: EMAIL_FILTER_BUILDER_DIR, else $XDG_CONFIG_HOME/email-filter-builder, else ~/.config/email-filter-builder. */
const configDir = (env = process.env) => env.EMAIL_FILTER_BUILDER_DIR || path.join(env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'email-filter-builder')

/** The filter spec: an explicit path wins (resolved against the cwd), then FILTERS_FILE, then filters.js in the config directory. */
const filtersFile = (explicit, env = process.env) => path.resolve(explicit || env.FILTERS_FILE || path.join(configDir(env), 'filters.js'))

/** The OAuth Desktop client JSON: GMAIL_CREDENTIALS_FILE, else .gmail-credentials.json in the config directory. */
const credentialsFile = (env = process.env) => env.GMAIL_CREDENTIALS_FILE || path.join(configDir(env), '.gmail-credentials.json')

/** The cached OAuth token: GMAIL_TOKEN_FILE, else .gmail-token.json in the config directory. */
const tokenFile = (env = process.env) => env.GMAIL_TOKEN_FILE || path.join(configDir(env), '.gmail-token.json')

module.exports = { configDir, credentialsFile, filtersFile, tokenFile }
