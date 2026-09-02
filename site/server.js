/** Serves the public home page and privacy policy for the OAuth consent screen. The contact address is injected from the environment rather than committed, since this repo is public. */

const fs = require('fs')
const http = require('http')
const path = require('path')

const PORT = process.env.PORT || 3000
const REPO = 'https://github.com/raineorshine/email-filter-builder'

// A local .env supplies CONTACT_EMAIL in development; in production it is a service variable. Absent in both cases is not fatal — the contact falls back to the public issue tracker.
try {
  process.loadEnvFile(path.join(__dirname, '.env'))
} catch {}

/** The contact link for the privacy policy: a mailto when an address is configured, otherwise the public issue tracker. */
const Contact = () => (process.env.CONTACT_EMAIL ? `<a href="mailto:${process.env.CONTACT_EMAIL}">${process.env.CONTACT_EMAIL}</a>` : `<a href="${REPO}/issues">the issue tracker</a>`)

/** Reads a page and fills in its placeholders. Pages are rendered once at startup, since nothing about them varies per request. */
const Page = file => fs.readFileSync(path.join(__dirname, file), 'utf-8').replaceAll('{{CONTACT}}', Contact())

const pages = { index: Page('index.html'), privacy: Page('privacy.html') }

/** Maps a request path to a rendered page. Only the two published pages are routable. */
const ROUTES = { '/': 'index', '/index.html': 'index', '/privacy': 'privacy', '/privacy.html': 'privacy' }

http
  .createServer((req, res) => {
    const page = ROUTES[new URL(req.url, `http://${req.headers.host}`).pathname]
    if (!page) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
      return res.end('Not found')
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300' })
    res.end(pages[page])
  })
  .listen(PORT, () => console.info(`Listening on ${PORT}`))
