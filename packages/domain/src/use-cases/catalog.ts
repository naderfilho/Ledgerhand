import { z } from 'zod'
import { domainError, notFound } from '../kit/errors.js'
import { asId, skuSchema, type CustomerId, type ProductId, type SupplierId } from '../kit/ids.js'
import { formatUnitValue, positiveUnitPriceSchema } from '../kit/unit-value.js'
import { formatQuantity, nonNegativeQuantitySchema, ZERO_QUANTITY } from '../kit/quantity.js'
import { err, ok } from '../kit/result.js'
import { domainEvent } from '../events/domain-event.js'
import { productUnitSchema, type Product } from '../model/product.js'
import type { Customer, Supplier } from '../model/party.js'
import { defineUseCase } from './definition.js'
import { DEFAULT_PAGE, type Paginated } from '../ports/repositories.js'

const pageSchema = z
  .object({
    limit: z.number().int().min(1).max(200).default(DEFAULT_PAGE.limit),
    offset: z.number().int().min(0).default(DEFAULT_PAGE.offset),
  })
  .optional()

const partyInputSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.').max(120),
  taxId: z.string().trim().max(32).nullish(),
  email: z.email('Invalid e-mail address.').nullish(),
  phone: z.string().trim().max(32).nullish(),
  notes: z.string().trim().max(1000).nullish(),
  paymentTermDays: z.number().int().min(0).max(365).default(30),
})

export const createProduct = defineUseCase({
  name: 'create_product',
  title: 'Create product',
  summary:
    'Registers a new product in the catalogue with its selling price, unit of measure and minimum stock level. Fails if the SKU already exists. Does not create any stock: use register_stock_entry or receive_purchase_order for that.',
  capability: 'catalog:write',
  risk: 'write',
  inputSchema: z.object({
    sku: skuSchema,
    name: z.string().trim().min(1, 'Product name is required.').max(120),
    description: z.string().trim().max(1000).nullish(),
    unit: productUnitSchema.default('unit'),
    salePrice: positiveUnitPriceSchema,
    minimumStock: nonNegativeQuantitySchema.optional(),
  }),
  execute: async (input, context) => {
    const existing = await context.uow.products.findBySku(input.sku)
    if (existing !== null) {
      return err(
        domainError(
          'DUPLICATE_KEY',
          `SKU ${input.sku} already belongs to "${existing.name}". Pick a different SKU or update the existing product.`,
          { sku: input.sku, existingProductId: existing.id },
        ),
      )
    }

    const product: Product = {
      id: asId<ProductId>(context.uow.ids.next()),
      tenantId: context.tenantId,
      sku: input.sku,
      name: input.name,
      description: input.description ?? null,
      unit: input.unit,
      salePrice: input.salePrice,
      minimumStock: input.minimumStock ?? ZERO_QUANTITY,
      active: true,
      createdAt: context.now,
      updatedAt: context.now,
    }

    await context.uow.products.save(product)
    context.uow.events.record(
      domainEvent('product.created', 'product', product.id, {
        productId: product.id,
        sku: product.sku,
        name: product.name,
        salePrice: formatUnitValue(product.salePrice),
      }),
    )

    return ok(product)
  },
})

export const updateProduct = defineUseCase({
  name: 'update_product',
  title: 'Update product',
  summary:
    'Changes the name, description, selling price or minimum stock level of an existing product. The SKU and the unit of measure are immutable, because historical documents and stock movements refer to them.',
  capability: 'catalog:write',
  risk: 'write',
  inputSchema: z.object({
    productId: z.uuid(),
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(1000).nullish(),
    salePrice: positiveUnitPriceSchema.optional(),
    minimumStock: nonNegativeQuantitySchema.optional(),
  }),
  execute: async (input, context) => {
    const productId = asId<ProductId>(input.productId)
    const product = await context.uow.products.findById(productId)
    if (product === null) return err(notFound('Product', input.productId))
    if (!product.active) {
      return err(
        domainError(
          'PRODUCT_ARCHIVED',
          `Product ${product.sku} is archived and cannot be edited. Reactivate it first.`,
          { productId: product.id, sku: product.sku },
        ),
      )
    }

    const changes: string[] = []
    if (input.name !== undefined && input.name !== product.name) changes.push('name')
    if (input.description !== undefined && (input.description ?? null) !== product.description) {
      changes.push('description')
    }
    if (input.salePrice !== undefined && input.salePrice !== product.salePrice) {
      changes.push('salePrice')
    }
    if (input.minimumStock !== undefined && input.minimumStock !== product.minimumStock) {
      changes.push('minimumStock')
    }

    if (changes.length === 0) return ok(product)

    const updated: Product = {
      ...product,
      name: input.name ?? product.name,
      description:
        input.description === undefined ? product.description : (input.description ?? null),
      salePrice: input.salePrice ?? product.salePrice,
      minimumStock: input.minimumStock ?? product.minimumStock,
      updatedAt: context.now,
    }

    await context.uow.products.save(updated)
    context.uow.events.record(
      domainEvent('product.updated', 'product', updated.id, {
        productId: updated.id,
        sku: updated.sku,
        changes,
      }),
    )

    return ok(updated)
  },
})

export const archiveProduct = defineUseCase({
  name: 'archive_product',
  title: 'Archive product',
  summary:
    'Removes a product from the active catalogue. Archiving is refused while stock remains on hand, because a product that physically exists in the warehouse must stay visible in stock reports. History is preserved: the product is never deleted.',
  capability: 'catalog:archive',
  risk: 'destructive',
  inputSchema: z.object({
    productId: z.uuid(),
    reason: z.string().trim().max(500).optional(),
  }),
  execute: async (input, context) => {
    const productId = asId<ProductId>(input.productId)
    const product = await context.uow.products.findById(productId)
    if (product === null) return err(notFound('Product', input.productId))
    if (!product.active) return ok(product)

    const balance = await context.uow.stock.getBalance(productId)
    if (balance.onHand > 0n || balance.reserved > 0n) {
      return err(
        domainError(
          'PRODUCT_IN_USE',
          `Product ${product.sku} still has ${formatQuantity(balance.onHand)} on hand and ${formatQuantity(balance.reserved)} reserved. Write the stock off with adjust_stock before archiving.`,
          {
            productId: product.id,
            sku: product.sku,
            onHand: formatQuantity(balance.onHand),
            reserved: formatQuantity(balance.reserved),
          },
        ),
      )
    }

    const archived: Product = { ...product, active: false, updatedAt: context.now }
    await context.uow.products.save(archived)
    context.uow.events.record(
      domainEvent('product.archived', 'product', archived.id, {
        productId: archived.id,
        sku: archived.sku,
      }),
    )

    return ok(archived)
  },
  preview: async (input, context) => {
    const product = await context.uow.products.findById(asId<ProductId>(input.productId))
    if (product === null) return err(notFound('Product', input.productId))
    return ok(
      `Archive product ${product.sku} (${product.name}). It will disappear from the active catalogue and can no longer be sold or purchased. Existing documents keep referring to it.`,
    )
  },
})

export const createCustomer = defineUseCase({
  name: 'create_customer',
  title: 'Create customer',
  summary:
    'Registers a customer. The payment term in days is used to calculate the due date of receivables generated when their orders are invoiced.',
  capability: 'catalog:write',
  risk: 'write',
  inputSchema: partyInputSchema,
  execute: async (input, context) => {
    const customer: Customer = {
      id: asId<CustomerId>(context.uow.ids.next()),
      tenantId: context.tenantId,
      name: input.name,
      taxId: input.taxId ?? null,
      email: input.email ?? null,
      phone: input.phone ?? null,
      notes: input.notes ?? null,
      paymentTermDays: input.paymentTermDays,
      active: true,
      createdAt: context.now,
      updatedAt: context.now,
    }

    await context.uow.customers.save(customer)
    context.uow.events.record(
      domainEvent('customer.created', 'customer', customer.id, {
        customerId: customer.id,
        name: customer.name,
      }),
    )

    return ok(customer)
  },
})

export const createSupplier = defineUseCase({
  name: 'create_supplier',
  title: 'Create supplier',
  summary:
    'Registers a supplier. The payment term in days is used to calculate the due date of the payable generated when one of their purchase orders is received.',
  capability: 'catalog:write',
  risk: 'write',
  inputSchema: partyInputSchema,
  execute: async (input, context) => {
    const supplier: Supplier = {
      id: asId<SupplierId>(context.uow.ids.next()),
      tenantId: context.tenantId,
      name: input.name,
      taxId: input.taxId ?? null,
      email: input.email ?? null,
      phone: input.phone ?? null,
      notes: input.notes ?? null,
      paymentTermDays: input.paymentTermDays,
      active: true,
      createdAt: context.now,
      updatedAt: context.now,
    }

    await context.uow.suppliers.save(supplier)
    context.uow.events.record(
      domainEvent('supplier.created', 'supplier', supplier.id, {
        supplierId: supplier.id,
        name: supplier.name,
      }),
    )

    return ok(supplier)
  },
})

export const listProducts = defineUseCase({
  name: 'list_products',
  title: 'List products',
  summary:
    'Lists catalogue products, optionally filtered by a search term matching SKU or name. Returns selling price and minimum stock, not the quantity on hand: use get_stock_position for that.',
  capability: 'catalog:read',
  risk: 'read',
  inputSchema: z.object({
    search: z.string().trim().max(120).optional(),
    activeOnly: z.boolean().default(true),
    page: pageSchema,
  }),
  execute: async (input, context) => {
    const result: Paginated<Product> = await context.uow.products.list({
      ...(input.search === undefined ? {} : { search: input.search }),
      activeOnly: input.activeOnly,
      ...(input.page === undefined ? {} : { page: input.page }),
    })
    return ok(result)
  },
})

export const getProduct = defineUseCase({
  name: 'get_product',
  title: 'Get product',
  summary: 'Returns one product by id or by SKU, including its current stock balance.',
  capability: 'catalog:read',
  risk: 'read',
  inputSchema: z
    .object({
      productId: z.uuid().optional(),
      sku: skuSchema.optional(),
    })
    .refine((value) => value.productId !== undefined || value.sku !== undefined, {
      message: 'Provide either productId or sku.',
    }),
  execute: async (input, context) => {
    const product =
      input.productId !== undefined
        ? await context.uow.products.findById(asId<ProductId>(input.productId))
        : input.sku !== undefined
          ? await context.uow.products.findBySku(input.sku)
          : null

    if (product === null) return err(notFound('Product', input.productId ?? input.sku ?? 'unknown'))
    const balance = await context.uow.stock.getBalance(product.id)
    return ok({ product, balance })
  },
})

export const listCustomers = defineUseCase({
  name: 'list_customers',
  title: 'List customers',
  summary: 'Lists customers, optionally filtered by a search term matching name or tax id.',
  capability: 'catalog:read',
  risk: 'read',
  inputSchema: z.object({
    search: z.string().trim().max(120).optional(),
    activeOnly: z.boolean().default(true),
    page: pageSchema,
  }),
  execute: async (input, context) =>
    ok(
      await context.uow.customers.list({
        ...(input.search === undefined ? {} : { search: input.search }),
        activeOnly: input.activeOnly,
        ...(input.page === undefined ? {} : { page: input.page }),
      }),
    ),
})

export const listSuppliers = defineUseCase({
  name: 'list_suppliers',
  title: 'List suppliers',
  summary: 'Lists suppliers, optionally filtered by a search term matching name or tax id.',
  capability: 'catalog:read',
  risk: 'read',
  inputSchema: z.object({
    search: z.string().trim().max(120).optional(),
    activeOnly: z.boolean().default(true),
    page: pageSchema,
  }),
  execute: async (input, context) =>
    ok(
      await context.uow.suppliers.list({
        ...(input.search === undefined ? {} : { search: input.search }),
        activeOnly: input.activeOnly,
        ...(input.page === undefined ? {} : { page: input.page }),
      }),
    ),
})
