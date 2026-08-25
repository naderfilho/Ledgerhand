#!/usr/bin/env node
import { writeFileSync } from 'node:fs'
import { consoleApprover, denyAll } from '../approvals.js'
import { runAgentTask } from '../run.js'
import { summarise } from '../transcript.js'

/**
 * One task, one run.
 *
 *   pnpm --filter @ledgerhand/agent dev "close the cash for today"
 *
 * Progress goes to stderr and the transcript to stdout, so a run can be piped
 * into a file without the commentary, and watched while it is piped.
 */

interface Arguments {
  readonly task: string
  readonly approval: 'ask' | 'deny'
  readonly json: boolean
  readonly out: string | null
}

function parse(argv: readonly string[]): Arguments {
  const words: string[] = []
  let approval: 'ask' | 'deny' = 'ask'
  let json = false
  let out: string | null = null

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index] ?? ''
    if (argument === '--deny') approval = 'deny'
    else if (argument === '--ask') approval = 'ask'
    else if (argument === '--json') json = true
    else if (argument === '--out') {
      index += 1
      out = argv[index] ?? null
    } else words.push(argument)
  }

  return { task: words.join(' ').trim(), approval, json, out }
}

async function main(): Promise<void> {
  const options = parse(process.argv.slice(2))
  if (options.task === '') {
    console.error(
      'Usage: ledgerhand-agent [--deny] [--json] [--out file] "the task, in a sentence"',
    )
    process.exit(2)
  }

  const transcript = await runAgentTask({
    task: options.task,
    approver: options.approval === 'deny' ? denyAll() : consoleApprover(),
    onEvent: (line) => {
      process.stderr.write(`${line}\n`)
    },
  })

  const rendered = options.json ? JSON.stringify(transcript, null, 2) : summarise(transcript)
  if (options.out !== null) {
    writeFileSync(options.out, JSON.stringify(transcript, null, 2))
    process.stderr.write(`\ntranscript written to ${options.out}\n`)
  }
  process.stdout.write(`${rendered}\n`)

  // A run that ran out of budget or was refused is not a success, and a script
  // driving this should be able to tell without parsing prose.
  process.exit(transcript.outcome === 'completed' ? 0 : 1)
}

main().catch((error: unknown) => {
  console.error('[ledgerhand-agent] the run could not start:', error)
  process.exit(1)
})
