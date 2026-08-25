import { describe, expect, it } from 'vitest'
import { capabilitiesOf, ROLES, type Role } from '../auth/roles.js'
import { aCustomer, aProduct, createTestHarness, cost, qty } from '../testing/index.js'
import { DESCRIPTORS, descriptorsForRole, riskOf, USE_CASES } from './registry.js'

/**
 * These tests guard the promise the whole project rests on: an agent acting for
 * a user can never do something that user could not do by hand, and a
 * destructive operation always has a human-readable preview to approve.
 */

const nameOf = (role: Role): readonly string[] =>
  descriptorsForRole(role).map((descriptor) => descriptor.name)

describe('the tool list a role is shown', () => {
  it('never offers a tool the role would be refused', () => {
    for (const role of ROLES) {
      const allowed = new Set(capabilitiesOf(role))
      for (const descriptor of descriptorsForRole(role)) {
        expect(allowed.has(descriptor.capability)).toBe(true)
      }
    }
  })

  it('gives readonly nothing that changes state', () => {
    for (const descriptor of descriptorsForRole('readonly')) {
      expect(descriptor.risk).toBe('read')
    }
  })

  it('keeps money out of the sales role and stock out of the finance role', () => {
    const sales = nameOf('sales')
    expect(sales).toContain('create_sales_order')
    expect(sales).toContain('confirm_sales_order')
    expect(sales).not.toContain('settle_receivable')
    expect(sales).not.toContain('invoice_sales_order')
    expect(sales).not.toContain('adjust_stock')

    const finance = nameOf('finance')
    expect(finance).toContain('settle_receivable')
    expect(finance).toContain('close_daily_cash')
    expect(finance).toContain('invoice_sales_order')
    expect(finance).not.toContain('adjust_stock')
    expect(finance).not.toContain('create_sales_order')
  })

  it('shows the administrator everything', () => {
    expect(descriptorsForRole('admin')).toHaveLength(DESCRIPTORS.length)
  })
})

describe('capability enforcement at the use case boundary', () => {
  it('refuses the call even when the tool list was bypassed', async () => {
    const harness = createTestHarness({ role: 'sales' })
    const customer = aCustomer(harness)
    const product = aProduct(harness, { onHand: qty(5), averageCost: cost(2) })

    const adjusted = await USE_CASES.adjust_stock.descriptor.run(
      { productId: product.id, delta: -1, reason: 'shrinkage' },
      harness.context,
    )

    expect(adjusted.ok).toBe(false)
    if (!adjusted.ok) {
      expect(adjusted.error.code).toBe('FORBIDDEN')
      expect(adjusted.error.message).toContain('stock:adjust')
      expect(adjusted.error.message).toContain('sales')
    }
    expect(customer.id).toBeDefined()
  })

  it('refuses a preview for the same reason it would refuse the call', async () => {
    const harness = createTestHarness({ role: 'readonly' })
    const product = aProduct(harness, { onHand: qty(5), averageCost: cost(2) })

    const preview = await USE_CASES.adjust_stock.descriptor.preview?.(
      { productId: product.id, delta: -1, reason: 'shrinkage' },
      harness.context,
    )

    expect(preview?.ok).toBe(false)
    if (preview?.ok === false) expect(preview.error.code).toBe('FORBIDDEN')
  })

  it('leaves no trace when a call is refused', async () => {
    const harness = createTestHarness({ role: 'readonly' })
    const product = aProduct(harness, { onHand: qty(5), averageCost: cost(2) })

    await USE_CASES.register_stock_exit.descriptor.run(
      { productId: product.id, quantity: 1 },
      harness.context,
    )

    expect(harness.events.recorded).toHaveLength(0)
    expect(harness.db.movements).toHaveLength(0)
  })
})

describe('risk classification', () => {
  it('marks exactly the operations that move money, consume numbering or overwrite facts', () => {
    const destructive = DESCRIPTORS.filter((descriptor) => descriptor.risk === 'destructive')
      .map((descriptor) => descriptor.name)
      .sort()

    expect(destructive).toEqual([
      'adjust_stock',
      'archive_product',
      'cancel_purchase_order',
      'cancel_sales_order',
      'close_daily_cash',
      'invoice_sales_order',
      'register_stock_exit',
      'reverse_settlement',
      'settle_payable',
      'settle_receivable',
    ])
  })

  it('gives every destructive operation a preview, because every one of them needs approval', () => {
    for (const descriptor of DESCRIPTORS) {
      if (descriptor.risk === 'destructive') {
        expect(descriptor.preview, `${descriptor.name} has no preview`).not.toBeNull()
      }
    }
  })

  it('never classifies a read as anything else', () => {
    for (const descriptor of DESCRIPTORS) {
      if (descriptor.name.startsWith('list_') || descriptor.name.startsWith('report_')) {
        expect(descriptor.risk).toBe('read')
      }
    }
  })

  it('exposes the risk of a tool by name for the MCP layer', () => {
    expect(riskOf('settle_receivable')).toBe('destructive')
    expect(riskOf('create_sales_order')).toBe('write')
    expect(riskOf('list_products')).toBe('read')
    expect(riskOf('nonexistent_tool')).toBeNull()
  })
})

describe('tool descriptions offered to the model', () => {
  it('gives every tool a unique name and a substantial description', () => {
    const names = new Set<string>()
    for (const descriptor of DESCRIPTORS) {
      expect(names.has(descriptor.name), `duplicate tool name ${descriptor.name}`).toBe(false)
      names.add(descriptor.name)
      expect(descriptor.summary.length).toBeGreaterThan(60)
      expect(descriptor.name).toMatch(/^[a-z][a-z0-9_]*$/)
    }
  })

  it('produces a JSON Schema for every tool', () => {
    for (const descriptor of DESCRIPTORS) {
      const schema = descriptor.jsonSchema()
      expect(schema['type'], `${descriptor.name} schema is not an object`).toBe('object')
    }
  })
})
