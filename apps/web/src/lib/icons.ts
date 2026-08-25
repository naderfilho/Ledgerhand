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
 * Navigation is decided on the server and rendered on the client, and a React
 * component is a function -- which cannot cross that boundary. So the server
 * sends the name of an icon and the client looks it up here.
 */
export const ICONS = {
  LayoutDashboard,
  ShoppingCart,
  Users,
  ClipboardList,
  Truck,
  Boxes,
  PackageSearch,
  FileText,
  Receipt,
  Coins,
  Wallet,
  ScrollText,
} as const satisfies Record<string, LucideIcon>

export type IconName = keyof typeof ICONS

export function iconFor(name: IconName): LucideIcon {
  return ICONS[name]
}
