import Anthropic from '@anthropic-ai/sdk'
import type { RunBudget } from './budget.js'
import type { ErpClient } from './erp-client.js'
import { Transcript, type RunOutcome, type RunTranscript } from './transcript.js'

/**
 * ---------------------------------------------------------------------------
 * The loop
 * ---------------------------------------------------------------------------
 * Ask the model, run the tools it asked for, hand back the results, repeat.
 * The interesting part is everything the loop refuses to do:
 *
 *  - It does not decide what the agent may call. The tool list came from the
 *    ERP, filtered by the role of the user this run acts for.
 *  - It does not decide what needs approving. The ERP stops and asks.
 *  - It does not decide when to stop trying. The budget does, between steps,
 *    and no wording in the model's reply can extend it.
 *
 * What is left here is bookkeeping: charge the budget, record the transcript,
 * and translate refusals into something the model can act on rather than
 * something that ends the run.
 */

const SYSTEM_PROMPT = `You are operating a real ERP for a small trading company, through tools, on behalf of a named user whose role limits what you can do.

How to work:
- Establish the date and the state before acting. Call get_current_context first when a request mentions "today", "this month" or "yesterday".
- Read before you write. Confirm the order, the title or the product exists, and that its state allows what you are about to do.
- Money and quantities are decimal strings ("1234.50"). Send them back in that form.
- Give every write a distinct idempotency_key. If a call fails in a way you cannot interpret, retry it with the same key rather than issuing a second one.
- A refusal is information, not an obstacle. Report what the ERP said and what would make the request valid. Never route around a refusal by trying a different tool that achieves the same effect.
- Destructive operations stop for a person. Say what you are about to do, let the approval happen, and accept the answer.
- Finish by stating plainly what you did, what you did not do, and any figure a person should check. Do not claim an effect a tool did not confirm.`

export interface AgentOptions {
  /** Injected so tests can drive the loop without a network. */
  readonly anthropic: Pick<Anthropic, 'messages'>
  readonly erp: ErpClient
  readonly model: string
  readonly budget: RunBudget
  readonly runId: string
  readonly maxOutputTokens?: number
  readonly effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max'
  readonly now?: () => number
  readonly onEvent?: (line: string) => void
  /**
   * Passed in when the caller already owns one -- the composition root does,
   * because approvals arrive out of band, as elicitation requests, and belong
   * in the record in the order they happened.
   */
  readonly transcript?: Transcript
}

export async function runTask(task: string, options: AgentOptions): Promise<RunTranscript> {
  // eslint-disable-next-line no-restricted-syntax -- the composition root's clock, injectable for tests
  const now = options.now ?? ((): number => Date.now())
  const transcript = options.transcript ?? new Transcript(options.runId, task, options.model, now)
  const note = options.onEvent ?? ((): void => undefined)

  const tools = await options.erp.tools()
  const instructions = options.erp.instructions()
  const system: Anthropic.TextBlockParam[] = [
    {
      type: 'text',
      text: instructions === '' ? SYSTEM_PROMPT : `${SYSTEM_PROMPT}\n\n---\n\n${instructions}`,
      // The system prompt and the tool list are identical on every exchange of
      // a run, which is exactly the prefix worth caching.
      cache_control: { type: 'ephemeral' },
    },
  ]

  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: task }]
  const finish = (outcome: RunOutcome, summary: string): RunTranscript =>
    transcript.finish(outcome, summary, options.budget.spend())

  for (;;) {
    const breach = options.budget.breach()
    if (breach !== null) {
      note(`budget: ${breach.message}`)
      return finish('budget-exhausted', breach.message)
    }

    let response: Anthropic.Message
    try {
      response = await options.anthropic.messages.create({
        model: options.model,
        max_tokens: options.maxOutputTokens ?? 16_000,
        system,
        messages,
        tools: [...tools],
        thinking: { type: 'adaptive' },
        output_config: { effort: options.effort ?? 'high' },
      })
    } catch (error: unknown) {
      const message = describeApiError(error)
      note(`api error: ${message}`)
      return finish('failed', message)
    }

    options.budget.chargeExchange(options.model, response.usage)

    for (const block of response.content) {
      if (block.type === 'text') {
        transcript.said(block.text)
        note(block.text)
      }
    }

    // The whole content array goes back, thinking blocks included: dropping
    // them loses the model's own reasoning state between turns.
    messages.push({ role: 'assistant', content: response.content })

    if (response.stop_reason === 'refusal') {
      const explanation = response.stop_details?.explanation ?? 'The model declined the request.'
      return finish('refused-by-model', explanation)
    }

    if (response.stop_reason === 'max_tokens') {
      return finish(
        'output-truncated',
        'The reply hit the output token limit before it was finished. Raise AGENT_MAX_OUTPUT_TOKENS or narrow the task.',
      )
    }

    const calls = response.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
    )

    if (calls.length === 0) {
      return finish('completed', lastText(response) ?? 'The run ended without a final answer.')
    }

    options.budget.chargeToolCall(calls.length)

    // Every result goes back in one user message, in the same order. Splitting
    // them across messages teaches the model to stop asking for parallel work.
    const results = await Promise.all(
      calls.map(async (call): Promise<Anthropic.ToolResultBlockParam> => {
        note(`→ ${call.name}`)
        const outcome = await options.erp.call(call.name, call.input)
        transcript.called(call.name, call.input, outcome.text, outcome.isError)
        if (outcome.isError) note(`← refused: ${outcome.text}`)

        return {
          type: 'tool_result',
          tool_use_id: call.id,
          content: [{ type: 'text', text: outcome.text }],
          // A business refusal is reported as an error so the model treats it
          // as a fact about the world rather than as a result to build on.
          is_error: outcome.isError,
        }
      }),
    )

    messages.push({ role: 'user', content: results })
  }
}

function lastText(response: Anthropic.Message): string | null {
  const texts = response.content.filter(
    (block): block is Anthropic.TextBlock => block.type === 'text',
  )
  const last = texts.at(-1)
  return last?.text ?? null
}

function describeApiError(error: unknown): string {
  if (error instanceof Anthropic.RateLimitError) {
    return 'The API rate limit was reached. The run stopped rather than retrying indefinitely.'
  }
  if (error instanceof Anthropic.AuthenticationError) {
    return 'ANTHROPIC_API_KEY was rejected.'
  }
  if (error instanceof Anthropic.BadRequestError) {
    return `The request was rejected: ${error.message}`
  }
  if (error instanceof Anthropic.APIError) {
    return `The API returned ${String(error.status)}: ${error.message}`
  }
  return error instanceof Error ? error.message : 'An unknown error ended the run.'
}

export { SYSTEM_PROMPT }
