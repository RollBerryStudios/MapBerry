import { spawn } from 'node:child_process'

const args = process.argv.slice(2)
const isDirectoryPack = args.includes('--dir')
const filters = [
  /duplicate dependency references/,
  ...(isDirectoryPack ? [/skipped macOS notarization/] : []),
]

function forwardFiltered(stream, target) {
  let buffer = ''
  stream.on('data', (chunk) => {
    buffer += chunk.toString()
    const lines = buffer.split(/\r?\n/)
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (!filters.some((pattern) => pattern.test(line))) {
        target.write(`${line}\n`)
      }
    }
  })
  stream.on('end', () => {
    if (buffer && !filters.some((pattern) => pattern.test(buffer))) {
      target.write(buffer)
    }
  })
}

const child = spawn(
  process.execPath,
  ['--no-deprecation', './node_modules/electron-builder/cli.js', ...args],
  { stdio: ['inherit', 'pipe', 'pipe'], env: process.env },
)

forwardFiltered(child.stdout, process.stdout)
forwardFiltered(child.stderr, process.stderr)

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 1)
})
