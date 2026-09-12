const { spawn, spawnSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')
const Lock = require('./lock')
const { Holder, STALE_MS } = Lock

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
const held = pid => {
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'holder.json'), JSON.stringify({ acquired: Date.now(), branch: 'other', pid, session: 'other-session', worktree: '/elsewhere' }))
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
