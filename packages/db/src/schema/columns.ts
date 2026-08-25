import {
  formatScaled,
  moneyFromCents,
  MONEY_SCALE,
  parseScaled,
  quantityFromThousandths,
  QUANTITY_SCALE,
  unitCostFromMillionths,
  UNIT_VALUE_SCALE,
  unsafeBusinessDate,
  type BusinessDate,
  type Money,
  type Quantity,
  type UnitCost,
} from '@ledgerhand/domain'
import { customType } from 'drizzle-orm/pg-core'

/**
 * ---------------------------------------------------------------------------
 * Column types
 * ---------------------------------------------------------------------------
 * The domain works in scaled integers; Postgres stores `numeric`. These custom
 * types are the only place the two representations meet, and they use the same
 * parser the rest of the system uses, so a value cannot take a different route
 * in and out of the database.
 *
 * `numeric` rather than `bigint` because reports aggregate in SQL: `SUM(total)`
 * has to mean the money it looks like it means when somebody opens psql, and a
 * column holding 123456 for "one thousand two hundred and thirty four reais"
 * is a trap for whoever writes the next query.
 *
 * See docs/adr/0003-fixed-point-arithmetic.md.
 */

function decode(value: string, scale: number, label: string): bigint {
  const parsed = parseScaled(value, scale, label)
  if (!parsed.ok) {
    // A value already in the database that no longer parses is corruption, not
    // a validation failure -- there is no sensible way to continue.
    throw new Error(`${label} column holds a value this schema cannot read: ${value}`)
  }
  return parsed.value
}

export const money = customType<{ data: Money; driverData: string }>({
  dataType: () => `numeric(18, ${String(MONEY_SCALE)})`,
  fromDriver: (value) => moneyFromCents(decode(value, MONEY_SCALE, 'Money')),
  toDriver: (value) => formatScaled(value, MONEY_SCALE),
})

export const quantity = customType<{ data: Quantity; driverData: string }>({
  dataType: () => `numeric(18, ${String(QUANTITY_SCALE)})`,
  fromDriver: (value) => quantityFromThousandths(decode(value, QUANTITY_SCALE, 'Quantity')),
  toDriver: (value) => formatScaled(value, QUANTITY_SCALE),
})

/** Serves both `UnitPrice` and `UnitCost`; they share a scale. */
export const unitValue = customType<{ data: UnitCost; driverData: string }>({
  dataType: () => `numeric(20, ${String(UNIT_VALUE_SCALE)})`,
  fromDriver: (value) => unitCostFromMillionths(decode(value, UNIT_VALUE_SCALE, 'Unit value')),
  toDriver: (value) => formatScaled(value, UNIT_VALUE_SCALE),
})

/**
 * A calendar day in the tenant timezone. Stored as `date`, never `timestamptz`:
 * the whole point of a business date is that it does not move when the reader
 * is in another timezone.
 */
export const businessDate = customType<{ data: BusinessDate; driverData: string }>({
  dataType: () => 'date',
  fromDriver: (value) => unsafeBusinessDate(value.slice(0, 10)),
  toDriver: (value) => value,
})
