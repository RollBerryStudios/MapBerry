import { build, context } from 'esbuild'
import { resolve } from 'path'

const ROOT = resolve(process.cwd())
const watch = process.argv.includes('--watch')

const options = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'es2022',
  external: ['electron'],
  legalComments: 'none',
  logLevel: 'info',
  entryPoints: [resolve(ROOT, 'src/preload/preload.ts')],
  outfile: resolve(ROOT, 'dist/preload/preload.js')
}

if (watch) {
  const ctx = await context(options)
  await ctx.watch()
  console.log('[build-preload] watching...')
} else {
  await build(options)
}
