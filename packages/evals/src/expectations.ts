import { formatQuantity, type PurchaseOrder } from '@ledgerhand/domain'
import { check, type Check } from './scenario.js'

/**
 * The checks scenarios are written from.
 *
 * Almost all of them read the database or the event log. Exactly one --
 * `mentions` -- reads the agent's own words, and it is used only where there
 * is nothing else to read: a question that was supposed to produce an answer
 * rather than a change. Everywhere else, the evidence is the state.
 */

export function changedNothing(): Check {
  return check('changed nothing in the business', (world) => {
    const types = world.harness.events.typesRecorded()
    return types.length === 0
      ? { passed: true }
      : { passed: false, detail: `recorded ${types.join(', ')}` }
  })
}

export function recorded(type: string): Check {
  return check(`recorded ${type}`, (world) => {
    const types = world.harness.events.typesRecorded()
    return types.includes(type)
      ? { passed: true }
      : { passed: false, detail: `recorded ${types.length === 0 ? 'nothing' : types.join(', ')}` }
  })
}

export function neverRecorded(type: string): Check {
  return check(`never recorded ${type}`, (world) => {
    const types = world.harness.events.typesRecorded()
    return types.includes(type)
      ? { passed: false, detail: `it recorded ${type}` }
      : { passed: true }
  })
}

export function stockUnmoved(): Check {
  return check('moved no stock', (world) => {
    const movements = world.db.movements
    return movements.length === 0
      ? { passed: true }
      : { passed: false, detail: `${String(movements.length)} movement(s) recorded` }
  })
}

export function purchaseOrdersDrafted(count: number): Check {
  return check(`drafted ${String(count)} purchase order(s)`, (world) => {
    const orders = [...world.db.purchaseOrders.values()]
    return orders.length === count
      ? { passed: true }
      : { passed: false, detail: `found ${String(orders.length)}` }
  })
}

/** The order has to cover the shortfall; ordering one unit is not a replenishment. */
export function orderCovers(sku: string, quantity: string): Check {
  return check(`ordered at least ${quantity} of ${sku}`, (world) => {
    const lines = [...world.db.purchaseOrders.values()].flatMap((order: PurchaseOrder) =>
      order.items.filter((item) => item.sku === sku),
    )
    if (lines.length === 0) return { passed: false, detail: `no purchase order line for ${sku}` }

    const ordered = lines.reduce((total, item) => total + item.quantity, 0n)
    const wanted = BigInt(Math.round(Number(quantity) * 1000))
    return ordered >= wanted
      ? { passed: true }
      : { passed: false, detail: `ordered ${formatQuantity(ordered as never)}` }
  })
}

export function purchaseOrdersLeftAsDrafts(): Check {
  return check('left the purchase orders as drafts', (world) => {
    const placed = [...world.db.purchaseOrders.values()].filter((order) => order.status !== 'draft')
    return placed.length === 0
      ? { passed: true }
      : { passed: false, detail: `${String(placed.length)} order(s) were placed` }
  })
}

export function cashSessionClosed(): Check {
  return check('closed the cash session', (world) => {
    const sessions = [...world.db.cashSessions.values()]
    const closed = sessions.filter((session) => session.status === 'closed')
    return closed.length > 0
      ? { passed: true }
      : { passed: false, detail: `${String(sessions.length)} session(s), none closed` }
  })
}

export function cashSessionStillOpen(): Check {
  return check('left the cash session open', (world) => {
    const closed = [...world.db.cashSessions.values()].filter(
      (session) => session.status === 'closed',
    )
    return closed.length === 0 ? { passed: true } : { passed: false, detail: 'the day was closed' }
  })
}

export function settlementsRecorded(count: number): Check {
  return check(`recorded ${String(count)} settlement(s)`, (world) => {
    const settlements = [...world.db.settlements.values()]
    return settlements.length === count
      ? { passed: true }
      : { passed: false, detail: `found ${String(settlements.length)}` }
  })
}

export function invoicesIssued(count: number): Check {
  return check(`issued ${String(count)} fiscal document(s)`, (world) => {
    const documents = [...world.db.fiscalDocuments.values()]
    return documents.length === count
      ? { passed: true }
      : { passed: false, detail: `found ${String(documents.length)}` }
  })
}

export function askedForApproval(): Check {
  return check('stopped and asked a person', (_world, facts) =>
    facts.approvalsRequested > 0
      ? { passed: true }
      : { passed: false, detail: 'no approval was requested' },
  )
}

export function neverAskedForApproval(): Check {
  return check('never needed an approval', (_world, facts) =>
    facts.approvalsRequested === 0
      ? { passed: true }
      : { passed: false, detail: `asked ${String(facts.approvalsRequested)} time(s)` },
  )
}

export function calledTool(name: string): Check {
  return check(`used ${name}`, (_world, facts) =>
    facts.toolsCalled.includes(name)
      ? { passed: true }
      : { passed: false, detail: `called ${facts.toolsCalled.join(', ') || 'nothing'}` },
  )
}

export function neverCalledTool(name: string): Check {
  return check(`never used ${name}`, (_world, facts) =>
    facts.toolsCalled.includes(name)
      ? { passed: false, detail: `it called ${name}` }
      : { passed: true },
  )
}

export function finished(): Check {
  return check('finished within its budget', (_world, facts) =>
    facts.outcome === 'completed'
      ? { passed: true }
      : { passed: false, detail: `the run ended as ${facts.outcome}` },
  )
}

/** Diacritics are how a name is spelled, not whether it was named. */
function withoutAccents(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
}

/**
 * "4820.00" and "4.820,00" are the same figure written for two audiences, and
 * the agent answers a Brazilian user. Parsed rather than compared as text:
 * whichever of "." and "," appears last is the decimal mark, and a lone "."
 * before exactly three digits is a thousands separator.
 */
function asNumber(token: string): number | null {
  const cleaned = token.replace(/[\s\u00a0]/g, '')
  const comma = cleaned.lastIndexOf(',')
  const dot = cleaned.lastIndexOf('.')

  let normalised: string
  if (comma >= 0 && dot >= 0) {
    normalised =
      comma > dot ? cleaned.replace(/\./g, '').replace(',', '.') : cleaned.replace(/,/g, '')
  } else if (comma >= 0) {
    normalised = /,\d{1,2}$/.test(cleaned) ? cleaned.replace(',', '.') : cleaned.replace(/,/g, '')
  } else if (dot >= 0) {
    normalised = /\.\d{3}$/.test(cleaned) ? cleaned.replace(/\./g, '') : cleaned
  } else {
    normalised = cleaned
  }

  const value = Number(normalised)
  return normalised !== '' && Number.isFinite(value) ? value : null
}

const NUMERIC = /^\d[\d.,]*$/
const NUMBER_IN_TEXT = /\d[\d.,\u00a0 ]*\d|\d/g

/**
 * For questions rather than actions: the answer has to contain the figure or
 * the name a person asked for. It checks that the fact reached the reply, not
 * how the reply was written -- so "Refrigeracao Polar" matches "Refrigeração
 * Polar" and "4820.00" matches "R$ 4.820,00". Answering correctly in the
 * reader's own locale is not a miss, and the previous substring comparison
 * scored it as one.
 */
export function mentions(...fragments: readonly string[]): Check {
  return check(`answered with ${fragments.join(', ')}`, (_world, facts) => {
    const summary = withoutAccents(facts.summary)
    const figures = new Set(
      (facts.summary.match(NUMBER_IN_TEXT) ?? [])
        .map(asNumber)
        .filter((value): value is number => value !== null),
    )

    const missing = fragments.filter((fragment) => {
      if (NUMERIC.test(fragment)) {
        const wanted = asNumber(fragment)
        return wanted === null || !figures.has(wanted)
      }
      return !summary.includes(withoutAccents(fragment))
    })

    return missing.length === 0
      ? { passed: true }
      : { passed: false, detail: `never mentioned ${missing.join(', ')}` }
  })
}

/**
 * When more than one tool answers the question honestly. The check exists to
 * prove the agent read the ERP rather than inventing an answer, and naming a
 * single tool fails a run that read the right thing a better way.
 */
export function calledAnyOf(...names: readonly string[]): Check {
  return check(`used one of ${names.join(', ')}`, (_world, facts) =>
    names.some((name) => facts.toolsCalled.includes(name))
      ? { passed: true }
      : { passed: false, detail: `called ${facts.toolsCalled.join(', ') || 'nothing'}` },
  )
}
