import type { Capability } from '@ledgerhand/domain'
import {
  Boxes,
  ClipboardList,
  Coins,
  FileText,
  LayoutDashboard,
  PackageSearch,
  Receipt,
  ScrollText,
  ShoppingCart,
  Truck,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react'

/**
 * One definition of the navigation, used by the sidebar and by the command
 * palette. Each entry carries the capability it needs, so a role that cannot
 * use a screen never sees a link to it -- the same principle the MCP server
 * applies to its tool list.
 */
export interface NavItem {
  readonly href: string
  readonly label: string
  readonly icon: LucideIcon
  readonly capability: Capability
  /** Extra words the command palette should match on. */
  readonly keywords?: readonly string[]
}

export interface NavGroup {
  readonly label: string
  readonly items: readonly NavItem[]
}

export const NAVIGATION: readonly NavGroup[] = [
  {
    label: 'Overview',
    items: [
      {
        href: '/',
        label: 'Dashboard',
        icon: LayoutDashboard,
        capability: 'reports:read',
        keywords: ['home', 'summary', 'today'],
      },
    ],
  },
  {
    label: 'Sales',
    items: [
      {
        href: '/sales',
        label: 'Sales orders',
        icon: ShoppingCart,
        capability: 'sales:read',
        keywords: ['order', 'invoice', 'customer order'],
      },
      {
        href: '/customers',
        label: 'Customers',
        icon: Users,
        capability: 'catalog:read',
        keywords: ['client', 'buyer'],
      },
    ],
  },
  {
    label: 'Purchasing',
    items: [
      {
        href: '/purchasing',
        label: 'Purchase orders',
        icon: ClipboardList,
        capability: 'purchase:read',
        keywords: ['supplier order', 'receive', 'delivery'],
      },
      {
        href: '/suppliers',
        label: 'Suppliers',
        icon: Truck,
        capability: 'catalog:read',
        keywords: ['vendor'],
      },
    ],
  },
  {
    label: 'Inventory',
    items: [
      {
        href: '/stock',
        label: 'Stock position',
        icon: Boxes,
        capability: 'stock:read',
        keywords: ['inventory', 'on hand', 'available'],
      },
      {
        href: '/stock/movements',
        label: 'Movements',
        icon: PackageSearch,
        capability: 'stock:read',
        keywords: ['entry', 'exit', 'adjustment', 'history'],
      },
      {
        href: '/products',
        label: 'Products',
        icon: FileText,
        capability: 'catalog:read',
        keywords: ['catalogue', 'sku', 'item'],
      },
    ],
  },
  {
    label: 'Finance',
    items: [
      {
        href: '/finance/receivables',
        label: 'Receivables',
        icon: Receipt,
        capability: 'finance:read',
        keywords: ['owed to us', 'collections', 'overdue'],
      },
      {
        href: '/finance/payables',
        label: 'Payables',
        icon: Coins,
        capability: 'finance:read',
        keywords: ['owed by us', 'bills', 'suppliers'],
      },
      {
        href: '/finance/cash',
        label: 'Daily cash',
        icon: Wallet,
        capability: 'finance:read',
        keywords: ['close the day', 'session', 'till'],
      },
    ],
  },
  {
    label: 'Insight',
    items: [
      {
        href: '/reports',
        label: 'Reports',
        icon: ScrollText,
        capability: 'reports:read',
        keywords: ['sales by period', 'cash flow', 'valuation'],
      },
      {
        href: '/audit',
        label: 'Audit trail',
        icon: ScrollText,
        capability: 'audit:read',
        keywords: ['events', 'history', 'who did what'],
      },
    ],
  },
]

export function visibleNavigation(
  allowed: (capability: Capability) => boolean,
): readonly NavGroup[] {
  return NAVIGATION.map((group) => ({
    ...group,
    items: group.items.filter((item) => allowed(item.capability)),
  })).filter((group) => group.items.length > 0)
}
