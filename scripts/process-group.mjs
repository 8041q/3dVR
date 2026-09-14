import { spawn } from 'node:child_process'

export function runProcesses(processes, { env = process.env } = {}) {
  const children = []
  let shuttingDown = false

  function stopAll(exitCode = 0) {
    if (shuttingDown) return
    shuttingDown = true

    for (const child of children) {
      if (!child.killed) child.kill('SIGTERM')
    }

    setTimeout(() => {
      for (const child of children) {
        if (!child.killed) child.kill('SIGKILL')
      }
      process.exit(exitCode)
    }, 3000).unref()
  }

  for (const definition of processes) {
    const child = spawn(definition.command, definition.args, {
      cwd: definition.cwd || process.cwd(),
      env: { ...env, ...(definition.env || {}) },
      stdio: 'inherit',
      shell: false,
    })

    children.push(child)

    child.on('exit', (code, signal) => {
      if (shuttingDown) return
      const reason = signal ? `signal ${signal}` : `code ${code}`
      console.error(`[runner] ${definition.name} stopped (${reason}); stopping the group`)
      stopAll(code || 1)
    })

    child.on('error', (error) => {
      console.error(`[runner] ${definition.name} failed to start`, error)
      stopAll(1)
    })
  }

  process.on('SIGINT', () => stopAll(0))
  process.on('SIGTERM', () => stopAll(0))

  return { children, stopAll }
}
