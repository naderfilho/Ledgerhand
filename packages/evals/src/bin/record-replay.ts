#!/usr/bin/env node
import Anthropic from '@anthropic-ai/sdk'
import { writeFileSync } from 'node:fs'
import { runScenario } from '../runner.js'
import { scenarioNamed } from '../scenarios/index.js'
import type { Scenario } from '../scenario.js'

/**
 * ---------------------------------------------------------------------------
 * Recording the runs the site plays back
 * ---------------------------------------------------------------------------
 *   pnpm --filter @ledgerhand/evals record-replay --out ../../apps/web/src/server/agent-replay.json
 *
 * The site shows the agent working without an API key behind it, because a
 * public page that spends money on every visitor is a page that gets turned
 * off. What it plays is not a mock: it is six real runs of the six eval
 * scenarios, with the tool calls in the order they were made, the arguments
 * that were sent, what came back, and the gaps between them measured from the
 * transcript's own timestamps.
 *
 * Those gaps are the reason the replay feels like something happening rather
 * than a list being revealed. Most of each one is the model thinking, which is
 * the part a list cannot show.
 *
 * The plain-language narration is derived from the entries rather than written
 * beside them, so it cannot describe a run that did not happen. A tool with no
 * sentence of its own gets a generic one instead of being dropped silently.
 */

interface Act {
  readonly scenario: string
  readonly title: string
  readonly subtitle: string
  /** The same two lines in Portuguese, for --lang pt. */
  readonly titlePt?: string
  readonly subtitlePt?: string
  readonly role: string
}

const ACTS: readonly Act[] = [
  {
    scenario: 'out-of-role-settlement',
    title: 'The tool is never offered',
    subtitle: 'Registering a payment belongs to finance. This agent works for a salesperson.',
    titlePt: 'A ferramenta nunca é oferecida',
    subtitlePt: 'Dar baixa em título é do financeiro. Este agente trabalha para um vendedor.',
    role: 'sales',
  },
  {
    scenario: 'daily-closing',
    title: 'A person approves, and it happens',
    subtitle:
      'Closing the day cannot be undone, so the ERP stops and asks before anything changes.',
    titlePt: 'Uma pessoa aprova, e acontece',
    subtitlePt:
      'Fechar o dia não se desfaz, então o ERP para e pergunta antes de mudar qualquer coisa.',
    role: 'finance',
  },
  {
    scenario: 'declined-approval',
    title: 'A person refuses, and nothing happens',
    subtitle: 'The same operation, the same agent, the same authority. The answer is no.',
    titlePt: 'Uma pessoa recusa, e nada acontece',
    subtitlePt: 'A mesma operação, o mesmo agente, a mesma autoridade. A resposta é não.',
    role: 'finance',
  },
  {
    scenario: 'invoice-without-approval',
    title: 'Nobody answers, so nothing is spent',
    subtitle:
      'An invoice burns a fiscal number that cannot be reused. With no one to approve, it is not issued.',
    titlePt: 'Ninguém responde, então nada é gasto',
    subtitlePt:
      'Uma nota queima um número fiscal que não volta. Sem quem aprove, ela não é emitida.',
    role: 'finance',
  },
  {
    scenario: 'replenishment',
    title: 'Reversible work needs no permission',
    subtitle:
      'A shortfall becomes a drafted purchase order. Drafting can be undone, so nobody is interrupted.',
    titlePt: 'Trabalho reversível não pede licença',
    subtitlePt:
      'Uma falta vira um pedido de compra em rascunho. Rascunho se desfaz, então ninguém é interrompido.',
    role: 'stock',
  },
  {
    scenario: 'collections-review',
    title: 'A question, answered without touching anything',
    subtitle: 'Reading is not destructive. The agent reports, and the business is unchanged.',
    titlePt: 'Uma pergunta, respondida sem tocar em nada',
    subtitlePt: 'Ler não é destrutivo. O agente reporta, e o negócio fica como estava.',
    role: 'finance',
  },
  {
    scenario: 'archive-product',
    title: 'Retiring a product asks first',
    subtitle: 'Archiving hides it from every future order, and that is not undone by editing.',
    titlePt: 'Aposentar um produto pergunta antes',
    subtitlePt: 'Arquivar esconde ele de todo pedido futuro, e isso não se desfaz editando.',
    role: 'admin',
  },
  {
    scenario: 'receive-purchase',
    title: 'Goods arrive, and the shelf agrees',
    subtitle: 'Receiving a placed order moves stock and creates what is owed for it.',
    titlePt: 'A mercadoria chega, e a prateleira concorda',
    subtitlePt: 'Receber um pedido movimenta o estoque e cria o que se deve por ele.',
    role: 'stock',
  },
  {
    scenario: 'adjust-stock',
    title: 'A count that disagrees with the system',
    subtitle: 'Correcting the books against a physical count rewrites history, so it is approved.',
    titlePt: 'Uma contagem que discorda do sistema',
    subtitlePt:
      'Corrigir os livros contra a contagem física reescreve histórico, então é aprovado.',
    role: 'stock',
  },
  {
    scenario: 'new-sales-order',
    title: 'A draft nobody has to allow',
    subtitle: 'A draft order reserves nothing and can be thrown away.',
    titlePt: 'Um rascunho que ninguém precisa permitir',
    subtitlePt: 'Pedido em rascunho não reserva nada e pode ser jogado fora.',
    role: 'sales',
  },
  {
    scenario: 'invoice-approved',
    title: 'The invoice a person did allow',
    subtitle: 'The same operation refused in act four, this time with somebody to say yes.',
    titlePt: 'A nota que uma pessoa deixou sair',
    subtitlePt: 'A mesma operação recusada no ato quatro, desta vez com alguém para dizer sim.',
    role: 'finance',
  },
  {
    scenario: 'cancel-sales-order',
    title: 'Calling off a confirmed order',
    subtitle: 'Cancelling gives the reserved stock back, and stops for a person on the way.',
    titlePt: 'Desistindo de um pedido confirmado',
    subtitlePt: 'Cancelar devolve o estoque reservado, e para numa pessoa no caminho.',
    role: 'sales',
  },
  {
    scenario: 'settle-receivable',
    title: 'Money arrives and is recorded',
    subtitle: 'A settlement cannot be taken back by editing it, so it is approved.',
    titlePt: 'O dinheiro chega e é registrado',
    subtitlePt: 'Uma baixa não volta atrás editando, então é aprovada.',
    role: 'finance',
  },
  {
    scenario: 'period-report',
    title: 'A question from the role that can only look',
    subtitle: 'Read-only asks about the month and gets an answer, changing nothing.',
    titlePt: 'Uma pergunta do papel que só olha',
    subtitlePt: 'O somente-leitura pergunta sobre o mês e recebe resposta, sem mudar nada.',
    role: 'readonly',
  },
  {
    scenario: 'audit-lookup',
    title: 'The agent reading the record',
    subtitle:
      'Every change names the person or the agent run behind it, and the agent can read that.',
    titlePt: 'O agente lendo o registro',
    subtitlePt:
      'Toda mudança nomeia a pessoa ou a execução de agente por trás dela, e o agente pode ler isso.',
    role: 'admin',
  },
]

/**
 * One sentence per tool, in the words a person who does not know the schema
 * would use. Reads are described as reads; the irreversible ones say so,
 * because that is the whole reason the act exists.
 */
const IN_PLAIN_ENGLISH: Readonly<Record<string, string>> = {
  get_current_context: 'Checked what day it is, and whose authority it is acting under.',
  get_cash_position: 'Read what the cash register holds today.',
  list_customers: 'Looked the customer up.',
  list_suppliers: 'Looked the suppliers up.',
  list_products: 'Read the catalogue.',
  list_sales_orders: 'Found the sales order.',
  get_sales_order: 'Opened the sales order to read its lines.',
  list_receivables: 'Read what customers owe.',
  list_payables: 'Read what the company owes.',
  report_overdue_titles: 'Read what is overdue, and by how long.',
  list_products_below_minimum: 'Found the products that have fallen below their minimum.',
  get_product: 'Read the product record.',
  get_stock_balance: 'Read how much is actually on the shelf.',
  preview_operation: 'Asked the ERP what the operation would do — without doing it.',
  create_purchase_order:
    'Drafted a purchase order. Drafting is reversible, so nobody was interrupted.',
  close_daily_cash: 'Tried to close the day. This one cannot be undone.',
  invoice_sales_order:
    'Tried to issue the invoice, which spends a fiscal number. This one cannot be undone.',
  settle_receivable: 'Tried to register the payment against the title. This one cannot be undone.',
  create_product: 'Added the product to the catalogue.',
  update_product: 'Changed the product record.',
  archive_product:
    'Tried to archive the product, which hides it from every future order. This one cannot be undone.',
  create_customer: 'Added the customer.',
  create_supplier: 'Added the supplier.',
  register_stock_entry: 'Booked the goods in.',
  register_stock_exit: 'Tried to book goods out. This one cannot be undone.',
  adjust_stock:
    'Tried to correct the recorded quantity against a physical count. This one cannot be undone.',
  list_stock_movements: 'Read what has moved in and out.',
  create_sales_order: 'Drafted the sales order. A draft reserves nothing.',
  update_sales_order_items: 'Changed what is on the order.',
  confirm_sales_order: 'Confirmed the order, which reserves the stock for it.',
  cancel_sales_order:
    'Tried to cancel the order and give the stock back. This one cannot be undone.',
  place_purchase_order: 'Sent the purchase order to the supplier.',
  receive_purchase_order: 'Received the goods against the order.',
  cancel_purchase_order: 'Tried to cancel the purchase order. This one cannot be undone.',
  list_purchase_orders: 'Read the purchase orders.',
  get_purchase_order: 'Opened the purchase order.',
  settle_payable: 'Tried to record a payment out. This one cannot be undone.',
  reverse_settlement:
    'Tried to undo a settlement, rewriting what the books say was paid. This one cannot be undone.',
  open_cash_session: 'Opened the day.',
  report_sales_by_period: 'Read what was invoiced over the period.',
  report_cash_flow: 'Read the money in and out.',
  report_stock_position: 'Read what the warehouse holds.',
  list_domain_events: 'Read the record of what changed, and who or what changed it.',
  get_fiscal_document: 'Read the fiscal document.',
}

type Lang = 'en' | 'pt'

/** The same sentences in Portuguese, for the recording that language plays. */
const IN_PLAIN_PORTUGUESE: Readonly<Record<string, string>> = {
  get_current_context: 'Conferiu que dia é hoje, e sob a autoridade de quem está agindo.',
  get_cash_position: 'Leu o que o caixa tem hoje.',
  list_customers: 'Procurou o cliente.',
  list_suppliers: 'Procurou os fornecedores.',
  list_products: 'Leu o catálogo.',
  list_sales_orders: 'Encontrou o pedido de venda.',
  get_sales_order: 'Abriu o pedido para ler os itens.',
  list_receivables: 'Leu o que os clientes devem.',
  list_payables: 'Leu o que a empresa deve.',
  report_overdue_titles: 'Leu o que está vencido, e há quanto tempo.',
  list_products_below_minimum: 'Encontrou os produtos abaixo do mínimo.',
  get_product: 'Leu o cadastro do produto.',
  get_stock_balance: 'Leu quanto há de fato na prateleira.',
  preview_operation: 'Perguntou ao ERP o que a operação faria — sem fazer.',
  create_purchase_order:
    'Montou um pedido de compra. Rascunho é reversível, então ninguém foi interrompido.',
  close_daily_cash: 'Tentou fechar o dia. Esta não se desfaz.',
  invoice_sales_order: 'Tentou faturar, o que gasta um número fiscal. Esta não se desfaz.',
  settle_receivable: 'Tentou registrar o pagamento no título. Esta não se desfaz.',
  create_product: 'Cadastrou o produto no catálogo.',
  update_product: 'Alterou o cadastro do produto.',
  archive_product:
    'Tentou arquivar o produto, o que o esconde de todo pedido futuro. Esta não se desfaz.',
  create_customer: 'Cadastrou o cliente.',
  create_supplier: 'Cadastrou o fornecedor.',
  register_stock_entry: 'Deu entrada na mercadoria.',
  register_stock_exit: 'Tentou dar saída em mercadoria. Esta não se desfaz.',
  adjust_stock:
    'Tentou corrigir a quantidade registrada contra uma contagem física. Esta não se desfaz.',
  list_stock_movements: 'Leu o que entrou e saiu.',
  create_sales_order: 'Montou o pedido de venda. Rascunho não reserva nada.',
  update_sales_order_items: 'Alterou os itens do pedido.',
  confirm_sales_order: 'Confirmou o pedido, o que reserva o estoque dele.',
  cancel_sales_order: 'Tentou cancelar o pedido e devolver o estoque. Esta não se desfaz.',
  place_purchase_order: 'Enviou o pedido de compra ao fornecedor.',
  receive_purchase_order: 'Recebeu a mercadoria contra o pedido.',
  cancel_purchase_order: 'Tentou cancelar o pedido de compra. Esta não se desfaz.',
  list_purchase_orders: 'Leu os pedidos de compra.',
  get_purchase_order: 'Abriu o pedido de compra.',
  settle_payable: 'Tentou registrar um pagamento de saída. Esta não se desfaz.',
  reverse_settlement:
    'Tentou estornar uma baixa, reescrevendo o que os livros dizem que foi pago. Esta não se desfaz.',
  open_cash_session: 'Abriu o dia.',
  report_sales_by_period: 'Leu o que foi faturado no período.',
  report_cash_flow: 'Leu o dinheiro que entrou e saiu.',
  report_stock_position: 'Leu o que o armazém tem.',
  list_domain_events: 'Leu o registro do que mudou, e quem ou o que mudou.',
  get_fiscal_document: 'Leu o documento fiscal.',
}

/** Long enough to be evidence, short enough to stay a column. */
const INPUT_LIMIT = 150
const OUTPUT_LIMIT = 220
const THOUGHT_LIMIT = 260

function clip(value: string, limit: number): string {
  const flat = value.replace(/\s+/g, ' ').trim()
  return flat.length > limit ? `${flat.slice(0, limit)}…` : flat
}

function asArguments(input: unknown): string {
  if (input === undefined || input === null) return '{}'
  try {
    return clip(JSON.stringify(input), INPUT_LIMIT)
  } catch {
    return '{}'
  }
}

function narrate(tool: string, lang: Lang): string {
  if (lang === 'pt') return IN_PLAIN_PORTUGUESE[tool] ?? `Chamou ${tool}.`
  return IN_PLAIN_ENGLISH[tool] ?? `Called ${tool}.`
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  const outIndex = argv.indexOf('--out')
  const out = outIndex >= 0 ? (argv[outIndex + 1] ?? 'replay.json') : 'replay.json'
  const langIndex = argv.indexOf('--lang')
  const lang: Lang = langIndex >= 0 && argv[langIndex + 1] === 'pt' ? 'pt' : 'en'
  const model = process.env['AGENT_MODEL'] ?? 'claude-sonnet-5'

  let anthropic: Anthropic
  try {
    anthropic = new Anthropic()
  } catch {
    console.error('Recording the replay runs the real agent: set ANTHROPIC_API_KEY in .env.')
    process.exit(2)
  }

  const acts = []
  for (const act of ACTS) {
    const scenario: Scenario | undefined = scenarioNamed(act.scenario)
    if (scenario === undefined) throw new Error(`No scenario named ${act.scenario}`)

    // The Portuguese recording is a second real run, not a translation of the
    // first: the agent answers in the language it is asked in, and rewriting
    // what it said would be putting words in its mouth.
    const asked = lang === 'pt' ? (scenario.taskPt ?? scenario.task) : scenario.task
    const run = await runScenario({ ...scenario, task: asked }, { anthropic, model })
    const started = Date.parse(run.transcript.startedAt)

    const beats = run.transcript.entries.map((entry) => {
      const offsetMs = Math.max(0, Date.parse(entry.at) - started)
      if (entry.kind === 'called') {
        return {
          kind: 'call' as const,
          offsetMs,
          tool: entry.tool,
          arguments: asArguments(entry.input),
          result: clip(entry.output, OUTPUT_LIMIT),
          refused: entry.refused,
          plain: narrate(entry.tool, lang),
        }
      }
      if (entry.kind === 'asked') {
        return {
          kind: 'approval' as const,
          offsetMs,
          message: entry.message,
          approved: entry.approved,
          by: entry.by,
          ...(entry.reason === undefined ? {} : { reason: entry.reason }),
          plain: entry.approved
            ? lang === 'pt'
              ? 'Uma pessoa foi consultada e disse sim. Só então algo mudou.'
              : 'A person was asked, and said yes. Only then did anything change.'
            : lang === 'pt'
              ? 'Uma pessoa foi consultada e disse não. Nada mudou.'
              : 'A person was asked, and said no. Nothing changed.',
        }
      }
      return {
        kind: 'thought' as const,
        offsetMs,
        text: clip(entry.text, THOUGHT_LIMIT),
        plain: clip(entry.text, THOUGHT_LIMIT),
      }
    })

    acts.push({
      name: scenario.name,
      kind: scenario.kind,
      title: lang === 'pt' ? (act.titlePt ?? act.title) : act.title,
      subtitle: lang === 'pt' ? (act.subtitlePt ?? act.subtitle) : act.subtitle,
      role: act.role,
      task: asked,
      beats,
      // The proof strip. Every one of these read the database after the run.
      checks: run.checks.map((check) => ({
        passed: check.passed,
        description: check.description,
        ...(check.detail === undefined ? {} : { detail: check.detail }),
      })),
      summary: run.transcript.summary,
      outcome: run.transcript.outcome,
      passed: run.passed,
      spend: {
        toolCalls: run.spend.toolCalls,
        inputTokens: run.spend.inputTokens,
        outputTokens: run.spend.outputTokens,
        costUsd: run.spend.costUsd,
        elapsedMs: run.spend.elapsedMs,
        exchanges: run.spend.exchanges,
      },
      approvalsRequested: run.facts.approvalsRequested,
      approvalsGranted: run.facts.approvalsGranted,
    })

    process.stderr.write(
      `${scenario.name}: ${run.passed ? 'ok' : 'FAILED'} (${String(beats.length)} beats, ${String(Math.round(run.spend.elapsedMs / 1000))}s)\n`,
    )
  }

  writeFileSync(out, `${JSON.stringify({ model, acts }, null, 2)}\n`)
  process.stderr.write(`\nWrote ${out}\n`)
}

main().catch((error: unknown) => {
  console.error('[ledgerhand-replay]', error instanceof Error ? error.message : error)
  process.exit(2)
})
