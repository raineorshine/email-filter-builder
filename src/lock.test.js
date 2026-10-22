const { spawn, spawnSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')
const Lock = require('./lock')
const { Holder, Link, STALE_MS } = Lock

/** A pid that has certainly exited: spawned and reaped before the test reads it. */
const deadPid = () => spawnSync(process.execPath, ['-e', '']).pid

let dir
const silent = () => {}

beforeEach(() => {
  dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'lock-test-')), 'gmail-sync.lock')
})

afterEach(() => {
  fs.rmSync(path.dirname(dir), { force: true, recursive: true })
})

/** Writes a lock held by someone else, without going through Lock(). */
const held = (pid, extra = {}) => {
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'holder.json'), JSON.stringify({ acquired: Date.now(), branch: 'other', pid, session: 'other-session', worktree: '/elsewhere', ...extra }))
}

test('acquires when the lock is free, recording the holder', () => {
  Lock({ dir, log: silent })

  expect(fs.existsSync(dir)).toBe(true)
  expect(Holder(dir).pid).toBe(process.pid)
})

test('refuses while another live process holds it', () => {
  held(process.ppid)

  expect(() => Lock({ dir, log: silent })).toThrow(/Another session is syncing this account/)
  expect(Holder(dir).pid).toBe(process.ppid)
})

test('names the holding session and worktree in the refusal', () => {
  held(process.ppid)

  expect(() => Lock({ dir, log: silent })).toThrow(/other-session/)
  expect(() => Lock({ dir, log: silent })).toThrow(/\/elsewhere/)
})

test('links a desktop-app holder by its recorded title and id', () => {
  held(process.ppid, { session: 'local_abc-123', title: 'Widen [the] rule' })

  expect(() => Lock({ dir, log: silent })).toThrow('link      [Widen (the) rule](#local_abc-123)')
})

test('prints no link for a holder without a desktop-app session id', () => {
  held(process.ppid, { title: 'Terminal run' })

  expect(() => Lock({ dir, log: silent })).toThrow(/title     Terminal run/)
  expect(() => Lock({ dir, log: silent })).not.toThrow(/link/)
})

test('falls back to the branch when the holder recorded no title', () => {
  expect(Link({ branch: 'feature', session: 'local_x' })).toBe('[feature](#local_x)')
  expect(Link(null)).toBe(null)
})

test('records the session title passed in by the caller', () => {
  process.env.GMAIL_SYNC_SESSION_TITLE = 'My chat'
  try {
    Lock({ dir, log: silent })
  } finally {
    delete process.env.GMAIL_SYNC_SESSION_TITLE
  }

  expect(Holder(dir).title).toBe('My chat')
})

test('reclaims a lock whose holder process is gone', () => {
  held(deadPid())

  Lock({ dir, log: silent })

  expect(Holder(dir).pid).toBe(process.pid)
})

test('does not reclaim a live holder however long it has been there', () => {
  held(process.ppid)
  const stale = new Date(Date.now() - 10 * STALE_MS)
  fs.utimesSync(dir, stale, stale)

  expect(() => Lock({ dir, log: silent })).toThrow(/Another session is syncing this account/)
})

test('honors a lock with no holder metadata until the stale cap', () => {
  fs.mkdirSync(dir, { recursive: true })

  expect(() => Lock({ dir, log: silent })).toThrow(/Another session is syncing this account/)

  const stale = new Date(Date.now() - STALE_MS - 1000)
  fs.utimesSync(dir, stale, stale)

  Lock({ dir, log: silent })
  expect(Holder(dir).pid).toBe(process.pid)
})

test('release frees the lock', () => {
  const release = Lock({ dir, log: silent })

  release()

  expect(fs.existsSync(dir)).toBe(false)
})

test('an interrupted run releases the lock rather than wedging the account', async () => {
  const script = `require(${JSON.stringify(path.resolve(__dirname, 'lock.js'))})({ dir: ${JSON.stringify(dir)} }); console.log('held'); setInterval(() => {}, 1000)`
  const child = spawn(process.execPath, ['-e', script], { stdio: ['ignore', 'pipe', 'inherit'] })

  const code = await new Promise(resolve => {
    child.stdout.once('data', () => child.kill('SIGINT'))
    child.on('exit', resolve)
  })

  expect(code).toBe(130)
  expect(fs.existsSync(dir)).toBe(false)
})

test('release leaves a lock that has since been taken by another process', () => {
  const release = Lock({ dir, log: silent })
  held(process.ppid)

  release()

  expect(Holder(dir).pid).toBe(process.ppid)
})
