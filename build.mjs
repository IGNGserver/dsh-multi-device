/**
 * Build script for dsh-multi-device:
 * 1. Host ESM bundle -> lib/index.js
 * 2. Shared Contract ESM bundle -> lib/contract.js
 * 3. Browser Client CJS bundle wrapped in window.__ModuleLoader__.load(...) -> lib/client.js
 * 4. TypeScript declarations -> lib/types/
 */
import { build } from 'esbuild'
import { mkdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'

mkdirSync('lib', { recursive: true })

const dshExternal = [
  '@deepseek-ai/cordis',
  '@deepseek-ai/schemastery',
  '@deepseek-ai/dsh-*',
  'ssh2',
  'ws',
]

await build({
  entryPoints: ['src/index.ts'],
  outfile: 'lib/index.js',
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: ['node22'],
  sourcemap: true,
  external: dshExternal,
  logLevel: 'info',
})

await build({
  entryPoints: ['src/contract.ts'],
  outfile: 'lib/contract.js',
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: ['es2022'],
  sourcemap: true,
  external: dshExternal,
  logLevel: 'info',
})

await build({
  entryPoints: ['src/client/index.tsx'],
  outfile: 'lib/client.js',
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: ['es2022'],
  sourcemap: true,
  jsx: 'automatic',
  external: [
    ...dshExternal,
    'react',
    'react-dom',
    'react/jsx-runtime',
    'react/jsx-dev-runtime',
    'scheduler',
  ],
  banner: {
    js: "window.__ModuleLoader__.load({ id: 'dsh-multi-device', factory: (require) => { var module = { exports: {} }; var exports = module.exports;",
  },
  footer: {
    js: 'return module.exports; } });',
  },
  logLevel: 'info',
})

const require = createRequire(import.meta.url)
execFileSync(
  process.execPath,
  [require.resolve('typescript/lib/tsc.js'), '-p', 'tsconfig.json'],
  { stdio: 'inherit' },
)
