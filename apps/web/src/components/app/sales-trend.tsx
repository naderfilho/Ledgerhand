'use client'

import type * as React from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatCurrency, formatDate } from '@/lib/format'

export interface TrendPoint {
  readonly period: string
  /** Canonical decimal string, converted to a number only for plotting. */
  readonly net: string
}

/**
 * The one place a monetary value becomes a JavaScript number: a chart needs a
 * scale, and a pixel cannot be a bigint. Every label still comes from the
 * original decimal string, so nothing the reader sees has been through a
 * float.
 */
export function SalesTrend({
  points,
}: {
  readonly points: readonly TrendPoint[]
}): React.JSX.Element {
  const data = points.map((point) => ({
    period: point.period,
    label: formatDate(point.period),
    net: point.net,
    plot: Number(point.net),
  }))

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <defs>
            <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.28} />
              <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="period"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
            tickFormatter={(value: string) => value.slice(8)}
            minTickGap={16}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={64}
            tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
            tickFormatter={(value: number) =>
              value >= 1000 ? `${String(Math.round(value / 1000))}k` : String(value)
            }
          />
          <Tooltip
            cursor={{ stroke: 'var(--border-strong)', strokeWidth: 1 }}
            content={({ active, payload }) => {
              if (!active || payload.length === 0) return null
              const point = payload[0]?.payload as { label: string; net: string } | undefined
              if (point === undefined) return null
              return (
                <div className="rounded-lg border border-border bg-surface px-3 py-2 shadow-[var(--shadow-overlay)]">
                  <p className="text-xs text-muted-foreground">{point.label}</p>
                  <p className="tabular text-sm font-semibold">{formatCurrency(point.net)}</p>
                </div>
              )
            }}
          />
          <Area
            type="monotone"
            dataKey="plot"
            stroke="var(--primary)"
            strokeWidth={2}
            fill="url(#salesFill)"
            dot={false}
            activeDot={{ r: 3.5, strokeWidth: 2, stroke: 'var(--surface)' }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
