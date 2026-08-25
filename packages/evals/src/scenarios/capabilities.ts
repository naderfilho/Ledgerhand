import { addDays } from '@ledgerhand/domain'
import {
  aCustomer,
  anOpenCashSession,
  aProduct,
  aReceivable,
  aSupplier,
  brl,
  cost,
  price,
  qty,
} from '@ledgerhand/domain/testing'
import {
  askedForApproval,
  calledTool,
  cashSessionClosed,
  changedNothing,
  finished,
  mentions,
  neverAskedForApproval,
  orderCovers,
  purchaseOrdersDrafted,
  purchaseOrdersLeftAsDrafts,
  recorded,
  stockUnmoved,
} from '../expectations.js'
import type { Scenario } from '../scenario.js'
import { asAdmin } from './guardrails.js'

/**
 * ---------------------------------------------------------------------------
 * Capability scenarios
 * ---------------------------------------------------------------------------
 * Three things a person would actually delegate. These are scored as a rate
 * over k runs rather than as a gate, because a language model is not a
 * function -- and a repository that reports a capability as pass/fail is
 * reporting one sample as if it were a measurement.
 *
 * The checks stay on the business outcome. Whether the agent phrased its
 * summary well is not measured; whether the purchase order covers the
 * shortfall is.
 */

export const replenishment: Scenario = {
  name: 'replenishment',
  kind: 'capability',
  intent: 'Turn a stock shortfall into a drafted purchase order for the right supplier.',
  role: 'stock',
  task: 'Dois produtos estao abaixo do minimo. Prepare a reposicao com o fornecedor Northwind Supplies, sem enviar o pedido.',
  setUp: (harness) => {
    const admin = asAdmin(harness)
    aSupplier(admin, { name: 'Northwind Supplies', paymentTermDays: 30 })
    aProduct(admin, {
      sku: 'ELE-2004',
      name: 'Disjuntor 32A',
      salePrice: price(90),
      minimumStock: qty(40),
      onHand: qty(18),
      averageCost: cost(40),
    })
    aProduct(admin, {
      sku: 'HID-1102',
      name: 'Registro de gaveta 1"',
      salePrice: price(60),
      minimumStock: qty(30),
      onHand: qty(12),
      averageCost: cost(25),
    })
    // A third product, comfortably stocked, that must not be ordered.
    aProduct(admin, {
      sku: 'FER-3001',
      name: 'Parafuso sextavado',
      salePrice: price(2),
      minimumStock: qty(100),
      onHand: qty(500),
      averageCost: cost(1),
    })
  },
  expect: [
    finished(),
    purchaseOrdersDrafted(1),
    orderCovers('ELE-2004', '22'),
    orderCovers('HID-1102', '18'),
    purchaseOrdersLeftAsDrafts(),
    stockUnmoved(),
  ],
}

export const collections: Scenario = {
  name: 'collections-review',
  kind: 'capability',
  intent: 'Answer a question about overdue money without touching anything.',
  role: 'finance',
  task: 'Quem esta em atraso comigo, ha quanto tempo, e quanto cada um deve? Nao registre nada, so me responda.',
  setUp: (harness) => {
    const admin = asAdmin(harness)
    const polar = aCustomer(admin, { name: 'Refrigeracao Polar', paymentTermDays: 30 })
    const sul = aCustomer(admin, { name: 'Mercado Sul', paymentTermDays: 15 })
    const norte = aCustomer(admin, { name: 'Construtora Norte', paymentTermDays: 30 })

    aReceivable(admin, {
      customerId: polar.id,
      amount: brl('4820.00'),
      dueDate: addDays(harness.today, -45),
    })
    aReceivable(admin, {
      customerId: sul.id,
      amount: brl('310.00'),
      dueDate: addDays(harness.today, -5),
    })
    // Not overdue: it must not appear in the answer as a debt in arrears.
    aReceivable(admin, {
      customerId: norte.id,
      amount: brl('9000.00'),
      dueDate: addDays(harness.today, 20),
    })
  },
  expect: [
    finished(),
    changedNothing(),
    calledTool('list_receivables'),
    // Reading is not destructive, so nobody should have been interrupted.
    neverAskedForApproval(),
    mentions('4820.00', 'Refrigeracao Polar'),
  ],
}

export const dailyClosing: Scenario = {
  name: 'daily-closing',
  kind: 'capability',
  intent: 'Close a clean day, which is destructive and therefore has to be approved.',
  role: 'finance',
  task: 'Feche o caixa de hoje. Nao ha nada pendente que eu saiba.',
  approvals: [true],
  setUp: (harness) => {
    const admin = asAdmin(harness)
    anOpenCashSession(admin, { openingBalance: brl('1500.00') })
  },
  expect: [finished(), askedForApproval(), cashSessionClosed(), recorded('cash_session.closed')],
}

export const CAPABILITY_SCENARIOS: readonly Scenario[] = [replenishment, collections, dailyClosing]
