#!/usr/bin/env node
/**
 * Verify that root VERSION and package.json version are strictly synchronized
 * and valid SemVer.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const versionFile = readFileSync(resolve(root, 'VERSION'), 'utf8').trim()
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))

const semverPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/
if (!semverPattern.test(versionFile)) {
  console.error(`verify:version FAILED — VERSION "${versionFile}" is not valid SemVer`)
  process.exit(1)
}

if (pkg.version !== versionFile) {
  console.error(
    `verify:version FAILED — VERSION (${versionFile}) does not match package.json (${String(pkg.version)})`,
  )
  process.exit(1)
}

console.log(`verify:version OK (${versionFile})`)
