import type { Metadata } from 'next'
import type * as React from 'react'
import { AgentReplay } from '@/components/app/agent-replay'
import { Card, CardBody, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { REPLAY } from '@/lib/agent-replay'
import { currentTranslator } from '@/server/locale'

export const metadata: Metadata = { title: 'The agent' }

export default async function AgentPage(): Promise<React.JSX.Element> {
  const { t } = await currentTranslator()
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
          An agent is only useful in production when the system, not the prompt, decides what it may
          do. Six recorded runs, below: the tool that is never offered, a person who approves, a
          person who refuses, nobody available to answer at all, and two where the work is
          reversible so nobody is interrupted.
        </p>
      </header>

      <AgentReplay acts={REPLAY.acts} labels={labels} />

      <Card>
        <CardHeader>
          <CardTitle>{t('Why this is a replay')}</CardTitle>
          <CardDescription>{t('These are real runs, not a mock-up of one.')}</CardDescription>
        </CardHeader>
        <CardBody className="space-y-3 text-sm leading-relaxed text-muted-foreground">
          <p>
            Each act above was produced by running the real agent loop against a real MCP client and
            server and the real domain, on {REPLAY.model}, and recording what happened. The tool
            calls are in the order they were made. The verdicts at the end of each act are the
            scenario&rsquo;s own checks, which read the database after the run rather than reading
            the agent&rsquo;s account of itself.
          </p>
          <p>
            Running it live on every visit would mean this public page spending on a paid API for
            anyone who opens it, so live execution is not exposed here. The recording is regenerated
            from the eval suite with one command, which means it cannot quietly drift away from what
            the agent actually does: if the behaviour changes, so does this screen.
          </p>
        </CardBody>
      </Card>
    </div>
  )
}
