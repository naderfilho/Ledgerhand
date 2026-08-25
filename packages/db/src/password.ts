import { hash, verify } from '@node-rs/argon2'

/**
 * Password hashing lives next to the table that stores the hash, so there is
 * exactly one implementation and nobody is tempted to write a second one.
 *
 * Argon2id with the parameters OWASP currently recommends as a baseline:
 * 19 MiB of memory, two iterations, one degree of parallelism. Memory cost is
 * what makes a stolen table expensive to attack; iteration count alone is not.
 */
const OPTIONS = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const

export async function hashPassword(plain: string): Promise<string> {
  return await hash(plain, OPTIONS)
}

/**
 * Returns false rather than throwing on a malformed stored hash: a corrupted
 * row must fail the login, not crash the sign-in route.
 */
export async function verifyPassword(storedHash: string, plain: string): Promise<boolean> {
  try {
    return await verify(storedHash, plain, OPTIONS)
  } catch {
    return false
  }
}
