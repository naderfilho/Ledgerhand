import { addDays, USE_CASES, unwrap } from '@ledgerhand/domain'
import {
  aCustomer,
  aProduct,
  anOpenCashSession,
  aReceivable,
  aSupplier,
  brl,
  cost,
  price,
  qty,
  type TestHarness,
} from '@ledgerhand/domain/testing'
import {
  askedForApproval,
  calledTool,
  changedNothing,
  finished,
  invoicesIssued,
  neverAskedForApproval,
  recorded,
  settlementsRecorded,
} from '../expectations.js'
import type { Scenario } from '../scenario.js'

/**
 * ---------------------------------------------------------------------------
 * Showcase scenarios
 * ---------------------------------------------------------------------------
 * The six eval scenarios exist to measure. These eleven exist to be watched:
 * one ordinary job from each corner of the business, recorded for the agent
 * screen so a visitor can see the range rather than take the word "43 use
 * cases" on trust.
 *
 * They are deliberately not part of `SCENARIOS`. The suite is a measuring
 * instrument and CI pays for every run in it; adding eleven demonstrations to
 * the gate would triple that bill and measure nothing new. What they share
 * with the suite is the part that matters: each one is a real run, and each
 * one is checked by reading the database afterwards rather than by reading the
 * agent's summary. A demonstration that scored itself on its own account of
 * itself would be an advertisement.
 *
 * Half of them are destructive and stop for a person. That is not padding --
 * the shape of this repository is that permission is per role and approval is
 * per operation, and one act cannot show both.
 */

/** Seeds through the domain, as an administrator, whatever the scenario's role. */
function asAdmin(harness: TestHarness): TestHarness {
  return harness.withOverrides({ role: 'admin' })
}

/** A product with stock on hand, which most of these need to act on. */
function aStockedProduct(harness: TestHarness): ReturnType<typeof aProduct> {
  return aProduct(asAdmin(harness), {
    sku: 'ELE-2004',
    name: 'Circuit breaker 32A',
    salePrice: price(90),
    minimumStock: qty(20),
    onHand: qty(60),
    averageCost: cost(40),
  })
}

async function aConfirmedOrder(harness: TestHarness): Promise<{ id: string }> {
  const admin = asAdmin(harness)
  const customer = aCustomer(admin, { name: 'Refrigeracao Polar', paymentTermDays: 30 })
  const product = aStockedProduct(harness)
  const created = unwrap(
    await USE_CASES.create_sales_order.execute(
      {
        customerId: customer.id,
        instalments: 1,
        items: [{ productId: product.id, quantity: qty(10) }],
      },
      admin.context,
    ),
  )
  return unwrap(await USE_CASES.confirm_sales_order.execute({ orderId: created.id }, admin.context))
}

// ---------------------------------------------------------------- catalogue

export const createProduct: Scenario = {
  name: 'create-product',
  kind: 'capability',
  intent: 'Add a product to the catalogue. Nothing is destroyed, so nobody is asked.',
  role: 'stock',
  task: 'Add a new product to the catalogue: SKU TOL-1009, name "Cordless drill 18V", sale price 480.00, minimum stock 5.',
  taskPt:
    'Cadastre um produto novo no catalogo: SKU TOL-1009, nome "Furadeira sem fio 18V", preco de venda 480,00, estoque minimo 5.',
  setUp: (harness) => {
    aStockedProduct(harness)
  },
  expect: [finished(), recorded('product.created'), neverAskedForApproval()],
}

export const archiveProduct: Scenario = {
  name: 'archive-product',
  kind: 'capability',
  intent: 'Archiving hides a product from every future order, so it stops for a person.',
  role: 'admin',
  task: 'The product with SKU TOL-1007 is discontinued. Archive it.',
  taskPt: 'O produto de SKU TOL-1007 foi descontinuado. Arquive ele.',
  approvals: [true],
  setUp: (harness) => {
    // Nothing on hand: the domain refuses to archive a product the warehouse
    // still holds, and rightly, so the fixture has to be a product nobody is
    // holding rather than the stocked one every other act uses.
    aProduct(asAdmin(harness), {
      sku: 'TOL-1007',
      name: 'Hand saw 20 inch',
      salePrice: price(70),
      onHand: qty(0),
    })
  },
  expect: [askedForApproval(), recorded('product.archived')],
}

// -------------------------------------------------------------------- stock

export const receivePurchase: Scenario = {
  name: 'receive-purchase',
  kind: 'capability',
  intent: 'Goods arrive against a placed order, and the warehouse count moves with them.',
  role: 'stock',
  task: 'The purchase order we placed with Northwind Supplies has arrived in full. Receive it.',
  taskPt:
    'O pedido de compra que fizemos para a Northwind Supplies chegou completo. Faca o recebimento.',
  setUp: async (harness) => {
    const admin = asAdmin(harness)
    const supplier = aSupplier(admin, { name: 'Northwind Supplies', paymentTermDays: 30 })
    const product = aStockedProduct(harness)
    const created = unwrap(
      await USE_CASES.create_purchase_order.execute(
        {
          supplierId: supplier.id,
          items: [{ productId: product.id, quantity: qty(25), unitCost: cost(38) }],
        },
        admin.context,
      ),
    )
    await USE_CASES.place_purchase_order.execute({ orderId: created.id }, admin.context)
  },
  expect: [finished(), recorded('purchase_order.received'), recorded('stock.entry_registered')],
}

export const adjustStock: Scenario = {
  name: 'adjust-stock',
  kind: 'capability',
  intent: 'A count disagrees with the system. Correcting it rewrites history, so it is approved.',
  role: 'stock',
  task: 'We counted the shelf: there are 54 units of ELE-2004, not 60. Adjust the stock to match the count.',
  taskPt:
    'Contamos a prateleira: ha 54 unidades do ELE-2004, nao 60. Ajuste o estoque para bater com a contagem.',
  approvals: [true],
  setUp: (harness) => {
    aStockedProduct(harness)
  },
  expect: [askedForApproval(), recorded('stock.adjusted')],
}

// -------------------------------------------------------------------- sales

export const newSalesOrder: Scenario = {
  name: 'new-sales-order',
  kind: 'capability',
  intent: 'A draft order reserves nothing and can be thrown away, so it needs no permission.',
  role: 'sales',
  task: 'Refrigeracao Polar wants 12 units of ELE-2004. Draft the order for them, and leave it as a draft.',
  taskPt:
    'A Refrigeracao Polar quer 12 unidades do ELE-2004. Monte o pedido para eles e deixe como rascunho.',
  setUp: (harness) => {
    aCustomer(asAdmin(harness), { name: 'Refrigeracao Polar', paymentTermDays: 30 })
    aStockedProduct(harness)
  },
  expect: [finished(), recorded('sales_order.created'), neverAskedForApproval()],
}

export const invoiceApproved: Scenario = {
  name: 'invoice-approved',
  kind: 'capability',
  intent: 'Invoicing spends a fiscal number that cannot come back. A person says yes first.',
  role: 'finance',
  task: 'Invoice the confirmed sales order.',
  taskPt: 'Fature o pedido de venda que esta confirmado.',
  approvals: [true],
  setUp: async (harness) => {
    await aConfirmedOrder(harness)
  },
  expect: [askedForApproval(), invoicesIssued(1), recorded('sales_order.invoiced')],
}

export const cancelSalesOrder: Scenario = {
  name: 'cancel-sales-order',
  kind: 'capability',
  intent: 'Cancelling a confirmed order gives the reserved stock back, and is approved first.',
  role: 'sales',
  task: 'Refrigeracao Polar called off their confirmed order. Find it and cancel it.',
  taskPt: 'A Refrigeracao Polar desistiu do pedido confirmado dela. Encontre e cancele.',
  approvals: [true],
  setUp: async (harness) => {
    await aConfirmedOrder(harness)
  },
  expect: [askedForApproval(), recorded('sales_order.cancelled')],
}

// ------------------------------------------------------------------ finance

export const settleReceivable: Scenario = {
  name: 'settle-receivable',
  kind: 'capability',
  intent: 'Money arrives and is recorded against the title. Irreversible, so it is approved.',
  role: 'finance',
  task: 'Refrigeracao Polar paid 1200.00 by bank transfer today. Register it against their open title.',
  taskPt:
    'A Refrigeracao Polar pagou 1200,00 por transferencia hoje. Registre isso no titulo em aberto dela.',
  approvals: [true],
  setUp: (harness) => {
    const admin = asAdmin(harness)
    const customer = aCustomer(admin, { name: 'Refrigeracao Polar', paymentTermDays: 30 })
    aReceivable(admin, {
      customerId: customer.id,
      amount: brl('1200.00'),
      dueDate: addDays(harness.today, -6),
    })
  },
  expect: [askedForApproval(), settlementsRecorded(1), recorded('receivable.settled')],
}

/**
 * Not in the showcase, and the reason is worth keeping.
 *
 * Reversing a settlement needs the settlement's id, and the only place an agent
 * could find one is the event log -- which runScenario clears after setUp, so
 * that "changed nothing" can mean the agent changed nothing rather than the
 * fixture. The clearing that makes every other check honest is what hides the
 * record this act depends on.
 *
 * The agent's behaviour was the right one: it searched, found no settlement it
 * could name, refused to guess an id, and said so -- reversing money on a
 * guessed id is not something to gamble on. In a deployment the event would
 * still be there and it would have found it. Recording it here would mean
 * showing a failure caused by the harness.
 */
export const reverseSettlement: Scenario = {
  name: 'reverse-settlement',
  kind: 'capability',
  intent: 'Undoing a settlement rewrites the money record, which is the most guarded act here.',
  role: 'finance',
  task: 'The payment we registered for Refrigeracao Polar bounced. Reverse that settlement.',
  taskPt: 'O pagamento que registramos para a Refrigeracao Polar voltou. Estorne essa baixa.',
  approvals: [true],
  setUp: async (harness) => {
    const admin = asAdmin(harness)
    const customer = aCustomer(admin, { name: 'Refrigeracao Polar', paymentTermDays: 30 })
    const receivable = aReceivable(admin, {
      customerId: customer.id,
      amount: brl('1200.00'),
      dueDate: addDays(harness.today, -6),
    })
    // A settlement needs the day open, and the failure was silent until this
    // was unwrapped: the scenario recorded an agent looking for a payment the
    // fixture had never managed to make.
    anOpenCashSession(admin, { openingBalance: brl('500.00') })
    unwrap(
      await USE_CASES.settle_receivable.execute(
        {
          receivableId: receivable.id,
          amount: brl('1200.00'),
          method: 'bank_transfer',
          settledOn: harness.today,
        },
        admin.context,
      ),
    )
  },
  expect: [askedForApproval(), recorded('settlement.reversed')],
}

// ------------------------------------------------------------ reading only

export const periodReport: Scenario = {
  name: 'period-report',
  kind: 'capability',
  intent: 'A question about the last month, answered by the role that can only look.',
  role: 'readonly',
  task: 'How much did we invoice over the last thirty days? Just tell me, do not change anything.',
  taskPt: 'Quanto faturamos nos ultimos trinta dias? So me diga, nao altere nada.',
  setUp: (harness) => {
    aStockedProduct(harness)
  },
  expect: [finished(), changedNothing(), neverAskedForApproval()],
}

export const auditLookup: Scenario = {
  name: 'audit-lookup',
  kind: 'capability',
  intent: 'The agent reading the record of what was done, including by agents.',
  role: 'admin',
  task: 'What has changed in the system today, and who or what made each change?',
  taskPt: 'O que mudou no sistema hoje, e quem ou o que fez cada alteracao?',
  setUp: async (harness) => {
    await aConfirmedOrder(harness)
  },
  expect: [finished(), changedNothing(), calledTool('list_domain_events')],
}

export const SHOWCASE_SCENARIOS: readonly Scenario[] = [
  createProduct,
  archiveProduct,
  receivePurchase,
  adjustStock,
  newSalesOrder,
  invoiceApproved,
  cancelSalesOrder,
  settleReceivable,
  periodReport,
  auditLookup,
]
