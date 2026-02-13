'use client'

import { useCallback, useMemo } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import type { Tables } from '@/lib/database.types'
import { formatCairoDate, formatCurrency, parseNumeric } from '@/lib/format'

import { ChartWrapper } from './chart-wrapper'

type BalanceSnapshot = Tables<'balance_snapshots'>

interface BalanceChartProps {
  data: BalanceSnapshot[]
  currency?: string
  height?: number
}

export function BalanceChart({
  data,
  currency = 'EGP',
  height = 300,
}: BalanceChartProps) {
  const chartData = useMemo(() => {
    return [...data]
      .sort(
        (a, b) =>
          new Date(a.captured_at).getTime() - new Date(b.captured_at).getTime()
      )
      .map((record) => ({
        capturedAt: record.captured_at,
        displayDate: formatCairoDate(record.captured_at, {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }),
        balance: parseNumeric(record.balance),
      }))
  }, [data])

  const tooltipFormatter = useCallback(
    (value: number | string | (number | string)[] | undefined) => [
      formatCurrency(String(value ?? 0), currency),
      'Balance',
    ],
    [currency]
  )

  const tooltipLabelFormatter = useCallback((label: unknown) => {
    if (typeof label === 'string' || typeof label === 'number') {
      return String(label)
    }
    return ''
  }, [])

  if (chartData.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-sm text-muted-foreground"
        style={{ height }}
      >
        No balance history available
      </div>
    )
  }

  return (
    <ChartWrapper height={height}>
      <LineChart data={chartData} margin={{ top: 16, right: 16, bottom: 0, left: -8 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="displayDate" tickLine={false} axisLine={false} minTickGap={16} />
        <YAxis
          tickFormatter={(value) => formatCurrency(String(value), currency)}
          tickLine={false}
          axisLine={false}
          width={90}
        />
        <Tooltip formatter={tooltipFormatter} labelFormatter={tooltipLabelFormatter} />
        <Line
          type="monotone"
          dataKey="balance"
          stroke="#16a34a"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ChartWrapper>
  )
}
