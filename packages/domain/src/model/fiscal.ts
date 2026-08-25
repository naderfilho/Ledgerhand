import { domainError, type DomainError } from '../kit/errors.js'
import type { CustomerId, FiscalDocumentId, SalesOrderId, TenantId } from '../kit/ids.js'
import type { Money } from '../kit/money.js'
import { err, ok, type Result } from '../kit/result.js'

/**
 * ---------------------------------------------------------------------------
 * Simplified fiscal document
 * ---------------------------------------------------------------------------
 * A stand-in for a Brazilian NF-e: it has a series, a gap-free sequential
 * number, a total, and a PDF. It is deliberately NOT integrated with SEFAZ --
 * that would be weeks of certificate handling and XML schemas that teach a
 * reader nothing about this project.
 *
 * What is modelled faithfully is the part that constrains the rest of the
 * system: the number is allocated inside the invoicing transaction and can
 * never be reused, which is why `invoice_sales_order` is classified
 * `destructive` and needs human approval when an agent asks for it.
 *
 * See docs/adr/0007-simulated-fiscal-document.md for the integration seam.
 */
export const FISCAL_DOCUMENT_STATUSES = ['issued', 'cancelled'] as const
export type FiscalDocumentStatus = (typeof FISCAL_DOCUMENT_STATUSES)[number]

export interface FiscalDocument {
  readonly id: FiscalDocumentId
  readonly tenantId: TenantId
  readonly series: string
  /** Zero-padded within the series, unique per tenant. */
  readonly number: string
  readonly salesOrderId: SalesOrderId
  readonly customerId: CustomerId
  readonly total: Money
  readonly status: FiscalDocumentStatus
  readonly issuedAt: Date
  readonly cancelledAt: Date | null
  readonly cancellationReason: string | null
  /** Relative path under the document store; rendered on demand if absent. */
  readonly pdfPath: string | null
}

export const DEFAULT_FISCAL_SERIES = 'A'

export function formatFiscalNumber(sequence: number): string {
  return String(sequence).padStart(6, '0')
}

export function fiscalDocumentLabel(document: FiscalDocument): string {
  return `${document.series}-${document.number}`
}

export function cancelFiscalDocument(
  document: FiscalDocument,
  reason: string,
  at: Date,
): Result<FiscalDocument, DomainError> {
  if (document.status === 'cancelled') {
    return err(
      domainError(
        'INVALID_STATE_TRANSITION',
        `Fiscal document ${fiscalDocumentLabel(document)} is already cancelled.`,
        { documentId: document.id },
      ),
    )
  }
  return ok({ ...document, status: 'cancelled', cancelledAt: at, cancellationReason: reason })
}
