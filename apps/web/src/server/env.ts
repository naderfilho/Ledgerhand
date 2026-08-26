/**
 * ---------------------------------------------------------------------------
 * What a deployment has to be given
 * ---------------------------------------------------------------------------
 * Every connection here has a localhost default, so that someone who has just
 * run `docker compose up` does not need to write a `.env` before the first
 * page renders. None of those defaults may survive into production: there, a
 * missing variable means the deployment was never finished, and it should say
 * so rather than spend the connect timeout failing to reach a database that
 * was never on that machine.
 */
export function connectionString(variable: string, developmentDefault: string): string {
  const value = process.env[variable]
  if (value !== undefined && value !== '') return value

  if (process.env['NODE_ENV'] === 'production') {
    throw new Error(`${variable} is not set. A deployment has to be given one.`)
  }
  return developmentDefault
}

/**
 * How many connections one process may hold, which is not a constant because
 * the shape of the process is not. A server that stays up multiplexes many
 * requests over a few connections. A serverless instance serves one request at
 * a time, and every connection it opens is one the pooler keeps for a process
 * that may be frozen a moment later, so the honest number there is one.
 */
export const POOL_SIZE = process.env['VERCEL'] === undefined ? 10 : 1
