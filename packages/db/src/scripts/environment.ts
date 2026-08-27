import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * ---------------------------------------------------------------------------
 * Reading the .env the README tells you to write
 * ---------------------------------------------------------------------------
 * These scripts read their connection string from the environment, and every
 * one of them says "Copy .env.example to .env first" when it is missing. That
 * was not true: nothing loaded the file, so the documented development path
 * failed on `pnpm db:migrate` for anyone who followed it exactly.
 *
 * Loaded here rather than through a dependency because the format this needs
 * to read is the format this repository writes, and because the two other ways
 * of running these scripts have no file to read at all: the compose services
 * and the reseed workflow both pass real variables into the process. So a
 * missing file is silence, not an error, and **anything already set wins**.
 * Otherwise `DATABASE_ADMIN_URL=...deployment... pnpm db:seed` would quietly
 * seed the local database instead, which is the kind of surprise that ends
 * with the wrong tables emptied.
 *
 * A second copy of this lives in `packages/agent/src/environment.ts`, because
 * the agent may not depend on this package and the two composition roots are
 * forbidden to share a module. See the note there.
 *
 * The web application deliberately does not need this: every connection it
 * opens has a localhost default, so a fresh clone renders before anybody has
 * written a file. These scripts have no default on purpose -- the admin
 * connection owns the schema, and guessing at one is not a favour.
 */
export function loadRepositoryEnvironment(): void {
  // Four levels up from src/scripts and from dist/scripts alike, so this
  // resolves the same whether it runs through tsx or from the build.
  const path = fileURLToPath(new URL('../../../../.env', import.meta.url))

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

    // An empty variable counts as unset, because that is how every caller
    // below already treats one.
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
