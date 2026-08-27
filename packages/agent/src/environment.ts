import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * ---------------------------------------------------------------------------
 * Reading the .env the messages point at
 * ---------------------------------------------------------------------------
 * Five places in this repository told the reader to "set ANTHROPIC_API_KEY in
 * .env" while nothing loaded the file: the agent CLI, the eval suite, the demo
 * recorder and the replay recorder. The key had to be exported by hand, which
 * the person following the README has no way to guess.
 *
 * This is deliberately a second copy of `packages/db/src/scripts/environment.ts`
 * rather than an import of it. `packages/agent` may not depend on
 * `packages/db` -- ESLint fails the build if it does, because "the agent never
 * holds database credentials" is meant to be a property of the dependency
 * graph and not a promise. Two composition roots that are forbidden to know
 * about each other cannot share a module, so they each carry the twenty lines.
 * The duplication is the architecture being honest, not an oversight.
 *
 * `packages/evals` needs no copy: it already depends on this package.
 *
 * Anything already set in the environment wins, and a missing file is silence
 * -- CI passes the key in as a secret and has no file to read.
 */
export function loadRepositoryEnvironment(): void {
  // Three levels up from src and from dist alike, so this resolves the same
  // through tsx as it does from the build.
  const path = fileURLToPath(new URL('../../../.env', import.meta.url))

  let contents: string
  try {
    contents = readFileSync(path, 'utf8')
  } catch {
    return
  }

  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.replace(/^\s*export\s+/, '').trim()
    if (trimmed === '' || trimmed.startsWith('#')) continue

    const separator = trimmed.indexOf('=')
    if (separator <= 0) continue

    const name = trimmed.slice(0, separator).trim()
    const value = unquote(trimmed.slice(separator + 1).trim())
    if (value === '') continue

    // An empty variable counts as unset, which is how every caller treats one.
    const existing = process.env[name]
    if (existing === undefined || existing === '') process.env[name] = value
  }
}

function unquote(value: string): string {
  const first = value.at(0)
  if ((first === '"' || first === "'") && value.length > 1 && value.endsWith(first)) {
    return value.slice(1, -1)
  }
  return value
}
