import { spawn } from 'node:child_process'

const env = { ...process.env }
delete env.NO_COLOR

const child = spawn(
  'playwright',
  process.argv.slice(2),
  {
    stdio: 'inherit',
    env,
    shell: process.platform === 'win32',
  },
)

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 1)
})
