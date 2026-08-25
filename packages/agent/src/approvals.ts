import { createInterface } from 'node:readline/promises'

/**
 * ---------------------------------------------------------------------------
 * Answering the ERP when it asks for a person
 * ---------------------------------------------------------------------------
 * The MCP server refuses to perform a destructive operation until someone
 * confirms it, and it asks over MCP elicitation. The agent is the client, so
 * the question arrives here -- and here is where it must reach an actual
 * human, or be refused.
 *
 * Note the shape of the responsibility. The agent does not decide whether an
 * operation needs approval (the domain classified it) and it does not write
 * the description (the domain generated it from the arguments). All it does is
 * carry the question to a person and carry the answer back. An agent that
 * lied about either would be lying about text it never produced.
 */

export interface ApprovalRequest {
  /** The sentence the ERP generated, verbatim. */
  readonly message: string
  readonly runId: string
}

export interface ApprovalOutcome {
  readonly approved: boolean
  /** Who decided: `console`, `policy`, `scripted`, `deny-all`. For the audit. */
  readonly by: string
  readonly reason?: string
}

export interface Approver {
  readonly name: string
  decide(request: ApprovalRequest): Promise<ApprovalOutcome>
}

/**
 * The default for anything unattended. An agent left running with nobody
 * watching does not get to perform irreversible operations, and saying so
 * out loud is more useful than quietly having no policy at all.
 */
export function denyAll(reason = 'No human was available to approve this.'): Approver {
  return {
    name: 'deny-all',
    decide: () => Promise.resolve({ approved: false, by: 'deny-all', reason }),
  }
}

/** Asks on the terminal. Anything but an explicit yes is a refusal. */
export function consoleApprover(): Approver {
  return {
    name: 'console',
    decide: async (request) => {
      const io = createInterface({ input: process.stdin, output: process.stderr })
      try {
        process.stderr.write(`\n--- The ERP is asking for approval ---\n${request.message}\n`)
        const answer = await io.question('Approve? [y/N] ')
        const approved = /^(y|yes)$/i.test(answer.trim())
        return approved
          ? { approved: true, by: 'console' }
          : { approved: false, by: 'console', reason: 'A person declined.' }
      } finally {
        io.close()
      }
    },
  }
}

/**
 * A fixed sequence of answers, for tests and for the eval suite, where what is
 * being measured is what the agent asked for rather than what a human felt
 * like allowing that afternoon. Runs out into refusal rather than into
 * silence.
 */
export function scriptedApprover(answers: readonly boolean[]): Approver {
  let index = 0
  return {
    name: 'scripted',
    decide: () => {
      const answer = answers[index] ?? false
      index += 1
      return Promise.resolve(
        answer
          ? { approved: true, by: 'scripted' }
          : { approved: false, by: 'scripted', reason: 'The script declined this step.' },
      )
    },
  }
}

/**
 * A rule instead of a person -- "settlements under R$ 500 to a known customer
 * are pre-approved". Useful and dangerous in the same breath, so it records
 * which rule allowed what.
 */
export function policyApprover(
  name: string,
  allows: (request: ApprovalRequest) => boolean,
): Approver {
  return {
    name: `policy:${name}`,
    decide: (request) =>
      Promise.resolve(
        allows(request)
          ? { approved: true, by: `policy:${name}` }
          : {
              approved: false,
              by: `policy:${name}`,
              reason: `The "${name}" policy does not cover this operation.`,
            },
      ),
  }
}
