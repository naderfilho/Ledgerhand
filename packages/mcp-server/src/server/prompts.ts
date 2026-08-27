import type { Prompt, PromptMessage } from '@modelcontextprotocol/sdk/types.js'

/**
 * ---------------------------------------------------------------------------
 * Prompts
 * ---------------------------------------------------------------------------
 * The four routines a trading company actually runs. They exist so the
 * procedure lives in the server, where it can be reviewed and versioned, and
 * not in whatever the operator typed into a chat window that afternoon.
 *
 * Each one names the tools to use and the order to use them in, states what
 * must never be assumed (the date, above all), and says explicitly that
 * destructive steps stop for a person. A prompt cannot enforce any of that --
 * the enforcement is in the domain and in the approval gate -- but an agent
 * that is told the rule up front asks for fewer things it will not be given.
 */

export interface ErpPrompt {
  readonly definition: Prompt
  /** The operations this routine needs; the prompt is hidden if the role lacks them. */
  readonly requires: readonly string[]
  readonly render: (args: Readonly<Record<string, string>>) => readonly PromptMessage[]
}

function userMessage(text: string): PromptMessage {
  return { role: 'user', content: { type: 'text', text } }
}

const DATE_RULE =
  'Call get_current_context first and use the date it returns. Never infer today from your own sense of time.'

const APPROVAL_RULE =
  'Destructive steps (settling, invoicing, closing cash, stock exits and adjustments) stop for human approval. Prepare them, state the figures, and let the person decide. Do not attempt to work around a refusal.'

export const PROMPTS: readonly ErpPrompt[] = [
  {
    definition: {
      name: 'daily_cash_closing',
      title: 'Close the day',
      description:
        'Reconcile the day: what came in, what went out, which titles due today are still unsettled, then close the cash session.',
      arguments: [
        {
          name: 'business_date',
          description: 'The day to close, as YYYY-MM-DD. Defaults to today in the tenant timezone.',
          required: false,
        },
        {
          name: 'counted_balance',
          description: 'The amount physically counted, if it was counted.',
          required: false,
        },
      ],
    },
    requires: ['get_cash_position', 'close_daily_cash'],
    render: (args) => [
      userMessage(
        [
          `Close the cash session${args['business_date'] === undefined ? '' : ` for ${args['business_date']}`}.`,
          '',
          DATE_RULE,
          '',
          'Steps:',
          '1. get_cash_position for the day. If no session is open, say so and stop -- a day that was never opened cannot be closed.',
          '2. list_receivables and list_payables due that day, and report which are still unsettled and for how much.',
          '3. Summarise: opening balance, money in, money out, expected closing balance.',
          args['counted_balance'] === undefined
            ? '4. Ask whether the drawer was counted before closing.'
            : `4. The counted balance is ${args['counted_balance']}; report the difference against the expected closing balance.`,
          '5. Call close_daily_cash. If titles remain unsettled, a justification is required -- ask the person for it rather than inventing one.',
          '',
          APPROVAL_RULE,
        ].join('\n'),
      ),
    ],
  },
  {
    definition: {
      name: 'minimum_stock_replenishment',
      title: 'Replenish stock below minimum',
      description:
        'Find products under their minimum, group them by supplier and draft the purchase orders.',
      arguments: [
        {
          name: 'supplier_id',
          description: 'Restrict the run to a single supplier.',
          required: false,
        },
      ],
    },
    requires: ['list_products_below_minimum', 'create_purchase_order'],
    render: (args) => [
      userMessage(
        [
          'Prepare the replenishment run.',
          '',
          DATE_RULE,
          '',
          'Steps:',
          '1. Read erp://stock/below-minimum, or call list_products_below_minimum.',
          '2. For each product, check list_purchase_orders with status ["placed","partially_received"] before ordering more: a delivery already on its way covers the shortfall.',
          args['supplier_id'] === undefined
            ? '3. Group what is genuinely missing by supplier, using the last purchase cost as the unit cost.'
            : `3. Restrict the run to supplier ${args['supplier_id']}.`,
          '4. Create one draft purchase order per supplier, ordering at least the shortfall.',
          '5. Report what you drafted and what you deliberately skipped, with the reason.',
          '',
          'Leave the orders as drafts. Placing them is a decision for a person.',
        ].join('\n'),
      ),
    ],
  },
  {
    definition: {
      name: 'overdue_receivables_review',
      title: 'Review overdue receivables',
      description:
        'Rank what customers owe past due, by age and amount, and propose the collection order.',
      arguments: [
        {
          name: 'minimum_amount',
          description: 'Ignore titles below this outstanding amount.',
          required: false,
        },
      ],
    },
    requires: ['list_receivables'],
    render: (args) => [
      userMessage(
        [
          'Review the overdue receivables.',
          '',
          DATE_RULE,
          '',
          'Steps:',
          '1. Read erp://finance/receivables/overdue.',
          '2. Group by customer, with the total outstanding and the age of the oldest title in days.',
          args['minimum_amount'] === undefined
            ? '3. Rank by exposure: amount weighted by how long it has been late.'
            : `3. Ignore anything under ${args['minimum_amount']} outstanding, then rank by exposure.`,
          '4. Propose an order of contact and say what to ask each customer for.',
          '',
          'Do not settle anything. A payment is recorded when it arrives, not when it is promised.',
        ].join('\n'),
      ),
    ],
  },
  {
    definition: {
      name: 'month_end_review',
      title: 'Month-end review',
      description:
        'Sales, margin, cash flow, stock valuation and what is outstanding on both sides, for a month.',
      arguments: [
        { name: 'month', description: 'The month to review, as YYYY-MM.', required: false },
      ],
    },
    requires: ['report_sales_by_period', 'report_cash_flow', 'report_stock_position'],
    render: (args) => [
      userMessage(
        [
          `Produce the month-end review${args['month'] === undefined ? '' : ` for ${args['month']}`}.`,
          '',
          DATE_RULE,
          '',
          'Steps:',
          '1. report_sales_by_period for the month, grouped by week: gross, discounts, net, cost, margin.',
          '2. report_cash_flow for the same range, and note any day that closed with a difference.',
          '3. report_stock_position for the valuation, and flag anything below minimum.',
          '4. report_overdue_titles for what is outstanding on both sides.',
          '5. Write the summary in figures, not adjectives, and name the two things that most need attention.',
          '',
          'This is a read-only routine. It changes nothing.',
        ].join('\n'),
      ),
    ],
  },
]
