/**
 * ---------------------------------------------------------------------------
 * What the agent just did, in words that assume no schema
 * ---------------------------------------------------------------------------
 * Shared by the two things that show a run to a person: the terminal
 * recording in the README and the replay on the agent screen. One table, so
 * a sentence cannot be right on the site and stale in the image.
 */
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

export type Lang = 'en' | 'pt'

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

export function narrate(tool: string, lang: Lang): string {
  if (lang === 'pt') return IN_PLAIN_PORTUGUESE[tool] ?? `Chamou ${tool}.`
  return IN_PLAIN_ENGLISH[tool] ?? `Called ${tool}.`
}
