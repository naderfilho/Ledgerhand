import type { Page, Paginated } from '@ledgerhand/domain'
import { sql, type SQL } from 'drizzle-orm'

/**
 * Helpers shared by the repository adapters.
 *
 * Every value that reaches SQL does so as a bound parameter, including search
 * terms that originated in a language model. No adapter concatenates a string
 * into a query, which is why "the agent cannot write SQL" is a property of the
 * code rather than a promise in the README.
 */

export const DEFAULT_LIMIT = 50

export function limitOf(page: Page | undefined): number {
  return page?.limit ?? DEFAULT_LIMIT
}

export function offsetOf(page: Page | undefined): number {
  return page?.offset ?? 0
}

/**
 * `count(*) over()` rides along with the page, so listing 20 rows out of 4000
 * takes one round trip instead of two. It is selected as text and converted
 * here, because the driver may hand back either a string or a BigInt depending
 * on how int8 is configured.
 *
 * Selected as `_rowCount`, never as `total`: sales and purchase orders already
 * have a `total` column holding money, and a plain alias would shadow it. The
 * compiler caught that the first time; the underscore keeps it caught.
 */
export const rowCount: SQL<string> = sql<string>`count(*) over()`

export function paginatedFrom<Row extends { readonly _rowCount: string | number | bigint }, T>(
  rows: readonly Row[],
  map: (row: Row) => T,
): Paginated<T> {
  const first = rows[0]
  return {
    rows: rows.map(map),
    total: first === undefined ? 0 : Number(first._rowCount),
  }
}

/**
 * Escapes the wildcards so a search for "50%" means what the user typed rather
 * than matching everything. The result is still bound as a parameter.
 */
export function likePattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, (character) => `\\${character}`)}%`
}
