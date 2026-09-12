/** Mutex over the destination account, held for the duration of an --apply. Editing the spec is parallel across worktrees; writing the account is not. `sync.js --apply` reconciles the whole account against whatever the spec says at that instant, so a second sync running concurrently — or one fired while another session is still editing — publishes a spec nobody audited. `flock` is absent on macOS, so the lock is a directory, whose creation is atomic on every POSIX filesystem. */

const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const paths = require('./paths')

/** How long a lock whose holder cannot be identified is honored before it is presumed abandoned. Only reached when the metadata is unreadable — an acquire killed in the microseconds between the mkdir and the write — since a lock that names its holder is settled by liveness instead. */
const STALE_MS = 10 * 60 * 1000

/** Runs a git command, or returns null outside a repo. */
const git = args => {
  try {
    return execFileSync('git', args, { cwd: __dirname, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return null
  }
}

/** Where the lock lives: beside the spec and the credentials in the config directory, which is the same scope as the account it protects — every worktree and every clone on the machine contends for one lock rather than one apiece. */
const LockDir = () => process.env.GMAIL_SYNC_LOCK || path.join(paths.configDir(), 'gmail-sync.lock')

/** Whether a process is still running. EPERM means it exists under another user, which is still alive. */
const alive = pid => {
  try {
    process.kill(pid, 0)
    return true
  } catch (e) {
    return e.code === 'EPERM'
  }
}

/** The lock's holder, or null if it never wrote one. */
const Holder = dir => {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, 'holder.json'), 'utf-8'))
  } catch {
    return null
  }
}

/** Whether a lock may be taken from its holder. A live holder is never reclaimed, however long it has been there: the confirm prompt is inside the critical section, so a session waiting on it is holding the lock for exactly the reason the lock exists. Age only settles the case liveness cannot. */
const abandoned = (dir, holder) => {
  if (holder) return !alive(holder.pid)
  try {
    return Date.now() - fs.statSync(dir).mtimeMs >= STALE_MS
  } catch {
    return true
  }
}

/** Names the holder in the terms a user can act on: which chat to go back to, and which worktree it is running in. */
const describe = (dir, holder) => {
  if (!holder) return `  lock      ${dir}\n  holder    (unrecorded — the acquire was interrupted)`
  return [`  worktree  ${holder.worktree}`, `  branch    ${holder.branch}`, `  session   ${holder.session || '(unrecorded)'}`, `  held for  ${Math.round((Date.now() - holder.acquired) / 1000)}s`, `  lock      ${dir}`].join('\n')
}

/** Creates the lock directory, or returns false if it already exists. The mkdir is the atomic step; the metadata is written immediately after, and a reader that finds none falls back to the age cap. */
const take = dir => {
  fs.mkdirSync(path.dirname(dir), { recursive: true })
  try {
    fs.mkdirSync(dir)
  } catch (e) {
    if (e.code === 'EEXIST') return false
    throw e
  }
  fs.writeFileSync(
    path.join(dir, 'holder.json'),
    JSON.stringify(
      {
        acquired: Date.now(),
        branch: git(['rev-parse', '--abbrev-ref', 'HEAD']) || '(unknown)',
        pid: process.pid,
        session: process.env.CLAUDE_CODE_HOST_SESSION_ID || process.env.CLAUDE_CODE_SESSION_ID || '',
        worktree: git(['rev-parse', '--show-toplevel']) || process.cwd(),
      },
      null,
      2,
    ),
  )
  return true
}

/** Takes the lock, or throws naming the session that holds it. Returns a release function, which is also wired to process exit so an apply that throws or is interrupted does not leave the account locked behind it. */
const Lock = ({ dir = LockDir(), log = console.info } = {}) => {
  if (!take(dir)) {
    const holder = Holder(dir)
    if (!abandoned(dir, holder)) throw new Error(`Another session is syncing this account.\n\n${describe(dir, holder)}\n\nWait for it to finish and re-run. If that session is gone but its process is not, remove the lock directory by hand.`)
    log(`Reclaiming a lock abandoned by a dead process.\n${describe(dir, holder)}\n`)
    fs.rmSync(dir, { force: true, recursive: true })
    if (!take(dir)) throw new Error(`Another session took the lock while this one was reclaiming it.\n\n${describe(dir, Holder(dir))}\n\nRe-run when it is done.`)
  }

  // Only ever removes a lock this process still holds: a reclaim may have handed it on, and dropping someone else's would put two syncs on the account at once.
  const release = () => {
    const holder = Holder(dir)
    if (holder && holder.pid !== process.pid) return
    fs.rmSync(dir, { force: true, recursive: true })
  }

  process.on('exit', release)
  // Signals do not run exit handlers on their own. Re-raising after the default disposition would be tidier, but the account is mid-write and exiting on the conventional code is what the shell reads.
  for (const signal of ['SIGHUP', 'SIGINT', 'SIGTERM']) process.on(signal, () => process.exit(signal === 'SIGINT' ? 130 : 1))

  return release
}

module.exports = Lock
module.exports.Holder = Holder
module.exports.LockDir = LockDir
module.exports.STALE_MS = STALE_MS
module.exports.abandoned = abandoned
