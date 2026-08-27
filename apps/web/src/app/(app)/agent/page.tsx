import type { Metadata } from 'next'
import type * as React from 'react'
import { AgentReplay } from '@/components/app/agent-replay'
import { Card, CardBody, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { replayFor } from '@/lib/agent-replay'
import { currentTranslator } from '@/server/locale'

export const metadata: Metadata = { title: 'The agent' }

export default async function AgentPage(): Promise<React.JSX.Element> {
  const { t, lang } = await currentTranslator()
  const replay = replayFor(lang)
  // Counted, never typed: the paragraph said six while the screen showed
  // fifteen, which is the drift this repository exists to argue against.
  const guardrails = replay.acts.filter((entry) => entry.kind === 'guardrail').length
  const labels = {
    guardrail: t('Guardrail'),
    capability: t('Capability'),
    actingFor: t('Acting for'),
    whoAsked: t(', who asked:'),
    pause: t('Pause'),
    play: t('Play'),
    replay: t('Replay'),
    backstage: t('Backstage'),
    calls: t('calls'),
    exchanges: t('exchanges'),
    whatIsHappening: t('What is happening'),
    approvalGranted: t('approval granted'),
    approvalRefused: t('approval refused'),
    refusedByTheErp: t('refused by the ERP'),
    stoppedAndAsked: t('The ERP stopped and asked a person'),
    approved: t('Approved'),
    refused: t('Refused'),
    checkedAfterwards: t('Checked against the database afterwards'),
  }

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-xl font-semibold tracking-tight">{t('The agent')}</h1>
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
          {t(
            'An agent is only useful in production when the system, not the prompt, decides what it may do.',
          )}{' '}
          {t(
            'Below are recorded runs, one for each kind of thing it can be asked: work that simply happens, work that stops for a person, and work it is never offered at all.',
          )}{' '}
          <span className="text-foreground">
            {String(replay.acts.length)} {t('recorded runs')}, {String(guardrails)}{' '}
            {t('of them guardrails')}.
          </span>
        </p>
      </header>

      <AgentReplay acts={replay.acts} labels={labels} />

      <Card>
        <CardHeader>
          <CardTitle>{t('Why this is a replay')}</CardTitle>
          <CardDescription>{t('These are real runs, not a mock-up of one.')}</CardDescription>
        </CardHeader>
        <CardBody className="space-y-3 text-sm leading-relaxed text-muted-foreground">
          <p>
            {t(
              'Each act above was produced by running the real agent loop against a real MCP client and server and the real domain, and recording what happened. The tool calls are in the order they were made. The verdicts at the end of each act are the scenario’s own checks, which read the database after the run rather than reading the agent’s account of itself.',
            )}
          </p>
          <p>
            {t(
              'Running it live on every visit would mean this public page spending on a paid API for anyone who opens it, so live execution is not exposed here. The recording is regenerated from the eval suite with one command, which means it cannot quietly drift away from what the agent actually does: if the behaviour changes, so does this screen.',
            )}
          </p>
          <p className="font-mono text-xs">{replay.model}</p>
        </CardBody>
      </Card>
    </div>
  )
}
