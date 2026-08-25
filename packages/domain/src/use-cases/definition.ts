import { z } from 'zod'
import type { Capability } from '../auth/roles.js'
import { requireCapability } from '../auth/roles.js'
import type { ExecutionContext } from '../context/execution-context.js'
import { domainError, type DomainError } from '../kit/errors.js'
import type { JsonObject, JsonValue } from '../kit/json.js'
import { err, mapOk, ok, type Result } from '../kit/result.js'

/**
 * ---------------------------------------------------------------------------
 * Use case definitions
 * ---------------------------------------------------------------------------
 * Every operation the system can perform is described once, here, as data:
 * what it is called, which capability it needs, how risky it is, what its
 * input looks like, and how to explain it to a person before it runs.
 *
 * The three adapters then derive themselves from that description instead of
 * restating it:
 *
 *   apps/web            renders forms from `inputSchema`, hides actions the
 *                       role lacks
 *   packages/mcp-server registers one tool per definition, filters `tools/list`
 *                       by `capability`, and refuses to execute `destructive`
 *                       ones without a stored human approval
 *   packages/agent      shows `preview` to the human on the approval card
 *
 * Risk is a property of the operation, not of the transport. Deciding it here
 * means the MCP server cannot accidentally expose something as harmless that
 * the domain considers irreversible.
 */

/**
 * `read`        does not change state.
 * `write`       reversible by a normal domain operation; small blast radius.
 * `destructive` irreversible without a compensating entry, OR overwrites a
 *               recorded fact, OR moves money, OR consumes fiscal numbering.
 *
 * The definition is deliberately mechanical so the classification of any new
 * operation is arguable from the rules rather than from taste.
 */
export const RISK_LEVELS = ['read', 'write', 'destructive'] as const
export type RiskLevel = (typeof RISK_LEVELS)[number]

export interface UseCaseSpec<Input, Output> {
  /** Stable identifier, also the MCP tool name: `confirm_sales_order`. */
  readonly name: string
  readonly title: string
  /**
   * Written for a language model deciding whether to call this. States what it
   * does, what it requires, and what it will refuse.
   */
  readonly summary: string
  readonly capability: Capability
  readonly risk: RiskLevel
  readonly inputSchema: z.ZodType<Input>
  readonly execute: (
    input: Input,
    context: ExecutionContext,
  ) => Promise<Result<Output, DomainError>>
  /**
   * Converts the output into the JSON every adapter hands to its reader. It is
   * required rather than optional because a use case whose result cannot leave
   * the process is not finished: `Money` is a bigint number of cents, and an
   * adapter left to serialise that on its own would either crash or -- worse --
   * report 1234.50 as 123450. See `../views/index.js`.
   *
   * Declared after `execute` in every definition on purpose: `Output` is
   * inferred from the handler, and a presenter written above it would be
   * type-checked before there is an output type to check it against.
   */
  readonly present: (output: Output) => JsonValue
  /**
   * A deterministic, code-generated sentence describing what executing this
   * input would do -- shown on the human approval card. Never produced by the
   * model, because the model is precisely the party whose account of its own
   * intentions cannot be trusted.
   */
  readonly preview?: (
    input: Input,
    context: ExecutionContext,
  ) => Promise<Result<string, DomainError>>
}

/**
 * The type-erased view of a use case, for code that iterates rather than
 * calls: the MCP tool registry, the audit viewer, the docs generator.
 *
 * `run` takes `unknown` on purpose. There is no way to reach a use case body
 * without passing through its zod schema first, which is what makes "input
 * from a language model is untrusted" a structural property rather than a
 * convention someone has to remember.
 */
export interface UseCaseDescriptor {
  readonly name: string
  readonly title: string
  readonly summary: string
  readonly capability: Capability
  readonly risk: RiskLevel
  /** JSON Schema advertised to MCP clients. Computed lazily and cached. */
  readonly jsonSchema: () => JsonObject
  readonly run: (
    rawInput: unknown,
    context: ExecutionContext,
  ) => Promise<Result<unknown, DomainError>>
  /**
   * `run` followed by the use case's own presenter. This is what every remote
   * caller uses -- the HTTP API and the MCP server -- because it is the only
   * form of the result that survives a process boundary.
   */
  readonly runJson: (
    rawInput: unknown,
    context: ExecutionContext,
  ) => Promise<Result<JsonValue, DomainError>>
  readonly preview:
    ((rawInput: unknown, context: ExecutionContext) => Promise<Result<string, DomainError>>) | null
}

export interface UseCase<Input, Output> extends UseCaseSpec<Input, Output> {
  readonly descriptor: UseCaseDescriptor
}

/**
 * Turns a zod failure into the same error shape every other refusal uses, with
 * a message a model can act on. Zod's own formatting is aimed at developers;
 * this one names the field and says what was expected.
 */
export function fromZodError(error: z.ZodError): DomainError {
  const issues = error.issues.map((issue) => ({
    path: issue.path.map((segment) => String(segment)).join('.'),
    message: issue.message,
  }))
  const summary = issues
    .map((issue) => (issue.path === '' ? issue.message : `${issue.path}: ${issue.message}`))
    .join('; ')
  return domainError('VALIDATION_FAILED', `Invalid input. ${summary}`, { issues })
}

/**
 * Wraps the handler with its capability check and its input validation, then
 * publishes both the typed form and the erased form. There is no path to the
 * body that skips either guard.
 */
export function defineUseCase<Input, Output>(
  spec: UseCaseSpec<Input, Output>,
): UseCase<Input, Output> {
  const authorise = (context: ExecutionContext): Result<void, DomainError> =>
    requireCapability(context.role, spec.capability)

  const execute = async (
    input: Input,
    context: ExecutionContext,
  ): Promise<Result<Output, DomainError>> => {
    const allowed = authorise(context)
    if (!allowed.ok) return allowed
    return await spec.execute(input, context)
  }

  const specPreview = spec.preview
  const preview =
    specPreview === undefined
      ? undefined
      : async (input: Input, context: ExecutionContext): Promise<Result<string, DomainError>> => {
          const allowed = authorise(context)
          if (!allowed.ok) return allowed
          return await specPreview(input, context)
        }

  const parse = (rawInput: unknown): Result<Input, DomainError> => {
    const parsed = spec.inputSchema.safeParse(rawInput)
    return parsed.success ? ok(parsed.data) : err(fromZodError(parsed.error))
  }

  let cachedSchema: JsonObject | null = null
  const jsonSchema = (): JsonObject => {
    cachedSchema ??= z.toJSONSchema(spec.inputSchema, {
      io: 'input',
      unrepresentable: 'any',
    }) as JsonObject
    return cachedSchema
  }

  const descriptor: UseCaseDescriptor = {
    name: spec.name,
    title: spec.title,
    summary: spec.summary,
    capability: spec.capability,
    risk: spec.risk,
    jsonSchema,
    // Authorisation comes before validation, in every entry point. A caller
    // who may not run an operation should be told that, not handed a critique
    // of arguments it was never going to be allowed to send -- which is also
    // a small oracle for the shape of an operation it cannot see.
    run: async (rawInput, context) => {
      const allowed = authorise(context)
      if (!allowed.ok) return allowed
      const parsed = parse(rawInput)
      if (!parsed.ok) return parsed
      return await execute(parsed.value, context)
    },
    runJson: async (rawInput, context) => {
      const allowed = authorise(context)
      if (!allowed.ok) return allowed
      const parsed = parse(rawInput)
      if (!parsed.ok) return parsed
      return mapOk(await execute(parsed.value, context), spec.present)
    },
    preview:
      preview === undefined
        ? null
        : async (rawInput, context) => {
            const allowed = authorise(context)
            if (!allowed.ok) return allowed
            const parsed = parse(rawInput)
            if (!parsed.ok) return parsed
            return await preview(parsed.value, context)
          },
  }

  return preview === undefined
    ? { ...spec, execute, descriptor }
    : { ...spec, execute, preview, descriptor }
}

export function isDestructive(candidate: { readonly risk: RiskLevel }): boolean {
  return candidate.risk === 'destructive'
}
