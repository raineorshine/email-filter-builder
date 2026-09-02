/** Authenticated Gmail REST client for the filter sync, plus the one-time OAuth loopback flow that obtains its token. No dependencies: Node's http server receives the redirect and fetch talks to Google. */

const crypto = require('crypto')
const fs = require('fs')
const http = require('http')
const path = require('path')
const { spawn } = require('child_process')

const BASE = 'https://gmail.googleapis.com/gmail/v1/users/me'

/** gmail.settings.basic covers the filters endpoints but not labels, which the action mapping needs to resolve a destination name to a label id (and to create a missing one). userinfo.email is requested so the sync can print which account it is about to write to. */
const SCOPES = ['https://www.googleapis.com/auth/gmail.settings.basic', 'https://www.googleapis.com/auth/gmail.labels', 'https://www.googleapis.com/auth/userinfo.email']

/** OAuth client credentials, from the Desktop client JSON downloaded from Google Cloud Console (either the wrapped `installed` shape or a bare one), overridable by env vars. */
const Credentials = credentialsFile => {
  const { GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET } = process.env
  if (GMAIL_CLIENT_ID && GMAIL_CLIENT_SECRET) return { clientId: GMAIL_CLIENT_ID, clientSecret: GMAIL_CLIENT_SECRET }
  if (!fs.existsSync(credentialsFile)) throw new Error(`No OAuth credentials. Create a Desktop OAuth client, save it to ${credentialsFile}, or set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET. See README.md.`)
  const json = JSON.parse(fs.readFileSync(credentialsFile, 'utf-8'))
  const { client_id: clientId, client_secret: clientSecret } = json.installed || json.web || json
  if (!clientId || !clientSecret) throw new Error(`${credentialsFile} has no client_id/client_secret`)
  return { clientId, clientSecret }
}

/** Opens a URL in the default browser. Best effort: the URL is printed either way, so an unopenable browser is not fatal. */
const openBrowser = url => {
  const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open'
  try {
    spawn(command, [url], { detached: true, stdio: 'ignore' }).unref()
  } catch {}
}

/** POSTs to Google's token endpoint and returns the parsed grant. */
const postToken = async params => {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    body: new URLSearchParams(params),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    method: 'POST',
  })
  const json = await res.json()
  if (!res.ok) throw new Error(`Token request failed: ${json.error_description || json.error || res.status}`)
  return json
}

/** Runs the one-time authorization: starts a loopback server on an ephemeral port, opens Google's consent screen, and exchanges the returned code (PKCE-protected) for a refresh token. */
const Authorize = async ({ clientId, clientSecret }) => {
  const verifier = crypto.randomBytes(32).toString('base64url')
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url')
  const state = crypto.randomBytes(16).toString('base64url')

  const server = http.createServer()
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const redirectUri = `http://127.0.0.1:${server.address().port}`

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
    access_type: 'offline',
    client_id: clientId,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    prompt: 'consent',
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES.join(' '),
    state,
  })}`

  console.info('Opening Google authorization in your browser. If it does not open, visit:')
  console.info(`  ${authUrl}\n`)
  openBrowser(authUrl)

  const code = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timed out waiting for authorization')), 5 * 60 * 1000)
    server.on('request', (req, res) => {
      const params = new URL(req.url, redirectUri).searchParams
      const error = params.get('error')
      const ok = !error && params.get('state') === state && params.get('code')
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end(`<body style="font: 16px system-ui; padding: 3rem">${ok ? 'Authorized. You can close this tab.' : `Authorization failed: ${error || 'state mismatch'}`}</body>`)
      clearTimeout(timeout)
      ok ? resolve(ok) : reject(new Error(`Authorization failed: ${error || 'state mismatch'}`))
    })
  }).finally(() => server.close())

  const grant = await postToken({ client_id: clientId, client_secret: clientSecret, code, code_verifier: verifier, grant_type: 'authorization_code', redirect_uri: redirectUri })
  if (!grant.refresh_token) throw new Error('Google returned no refresh token. Revoke the app at https://myaccount.google.com/permissions and retry.')
  return grant
}

/** Returns a valid access token, authorizing on first run and refreshing a cached token that has expired. The cached refresh token is written to tokenFile, which is gitignored. */
const AccessToken = async ({ credentialsFile, tokenFile }) => {
  const { clientId, clientSecret } = Credentials(credentialsFile)
  const cached = fs.existsSync(tokenFile) ? JSON.parse(fs.readFileSync(tokenFile, 'utf-8')) : null

  if (cached && cached.expiry > Date.now() + 60000) return cached.access_token

  const save = grant => {
    const token = { access_token: grant.access_token, expiry: Date.now() + grant.expires_in * 1000, refresh_token: grant.refresh_token || (cached && cached.refresh_token) }
    fs.writeFileSync(tokenFile, JSON.stringify(token, null, 2))
    fs.chmodSync(tokenFile, 0o600)
    return token.access_token
  }

  if (cached && cached.refresh_token) {
    try {
      return save(await postToken({ client_id: clientId, client_secret: clientSecret, grant_type: 'refresh_token', refresh_token: cached.refresh_token }))
    } catch (e) {
      console.warn(`Refresh failed (${e.message}); reauthorizing.`)
    }
  }

  return save(await Authorize({ clientId, clientSecret }))
}

/** Issues one authenticated request, retrying rate limits and transient server errors with exponential backoff. */
const request = async (accessToken, method, url, body, attempt = 0) => {
  const res = await fetch(url, {
    body: body && JSON.stringify(body),
    headers: { Authorization: `Bearer ${accessToken}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    method,
  })

  if ((res.status === 429 || res.status >= 500) && attempt < 5) {
    await new Promise(resolve => setTimeout(resolve, 2 ** attempt * 500))
    return request(accessToken, method, url, body, attempt + 1)
  }

  const text = await res.text()
  if (!res.ok) throw new Error(`${method} ${url} → ${res.status} ${text}`)
  return text ? JSON.parse(text) : null
}

/** Creates an authenticated client for the Gmail filter and label endpoints. The credentials and token default to the repo root, overridable via GMAIL_CREDENTIALS_FILE and GMAIL_TOKEN_FILE so a worktree can use the main checkout's gitignored files. */
const GmailApi = async ({ credentialsFile = process.env.GMAIL_CREDENTIALS_FILE || path.join(__dirname, '.gmail-credentials.json'), tokenFile = process.env.GMAIL_TOKEN_FILE || path.join(__dirname, '.gmail-token.json') } = {}) => {
  const accessToken = await AccessToken({ credentialsFile, tokenFile })
  const api = (method, resource, body) => request(accessToken, method, `${BASE}/${resource}`, body)

  return {
    createFilter: filter => api('POST', 'settings/filters', filter),
    createLabel: name => api('POST', 'labels', { labelListVisibility: 'labelShow', messageListVisibility: 'show', name }),
    deleteFilter: id => api('DELETE', `settings/filters/${id}`),
    email: async () => (await request(accessToken, 'GET', 'https://www.googleapis.com/oauth2/v3/userinfo')).email,
    listFilters: async () => (await api('GET', 'settings/filters')).filter || [],
    listLabels: async () => (await api('GET', 'labels')).labels || [],
  }
}

module.exports = GmailApi
module.exports.SCOPES = SCOPES
